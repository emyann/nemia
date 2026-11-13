/**
 * What a repository offers a step, read from its checkout: its skills, its agents, its MCP servers with the
 * tools each lists, and the tools its settings deny.
 *
 * What a step was actually given is on the engine's record, shown on the run's page; a toggle is a key in the workflow folder. Nothing
 * here writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Context, Effect, Layer } from 'effect';
import { MCP_TRANSPORTS as HARNESS_TRANSPORTS, transportOf, type McpTransport as HarnessTransport, type Running } from 'agent-orchestrator';
import { CLAUDE_RULES, WorkflowError, readFrontmatter, splitFrontmatter } from 'agent-orchestrator/workflow';
import type { FrontmatterEntry } from 'agent-orchestrator/workflow';

/** A skill or an agent: what its frontmatter calls it, what it says it is for, and the file it was read from. */
export type Described = { name: string; description: string | null; source: string };

/** A tool a server listed. `denied` is the rule in `permissions.deny` that refuses it, if one does. */
export type McpTool = { name: string; description: string | null; denied: string | null };

/** A server as `.mcp.json` declares it, and what it answered when the api asked it for its tools. */
export type McpServer = {
  name: string;
  source: string;
  /**
   * `.mcp.json`'s `type`, as the transport a harness loads the server over (`HARNESS_TRANSPORTS`, the harness's own, which objects'
   * `McpTransport` of a url is not): `stdio` for a server with a command and none given, and `unknown` for any other word, or a url with
   * none, the word as written quoted in `notAsked`.
   */
  type: HarnessTransport | 'unknown';
  /**
   * `command`, `args` and `url` as `.mcp.json` writes them: the api expands `${VAR}` only to start the server, so no secret reaches the
   * page.
   */
  command: string | null;
  args: string[];
  url: string | null;
  /**
   * Whether `.claude/settings.json` enables it: `enabledMcpjsonServers` or `enableAllProjectMcpServers`, and not `disabledMcpjsonServers`.
   */
  enabled: boolean;
  /** What it listed, or null when it was not asked or did not answer. */
  tools: McpTool[] | null;
  /** Why it did not list its tools, and the end of what it printed on stderr. */
  error: string | null;
  /** Why the api did not ask it — not enabled, or not a stdio server. */
  notAsked: string | null;
  /**
   * The state the harness reports of the server of this name the default factory records — `connected`, `needs-auth`, `failed`,
   * `pending` or `disabled`, the harness's own word, carried — or `null`: for a server the default factory does not record, and for one
   * whose state could not be read, which is not an absence. A server of the checkout's `.mcp.json` alone has none.
   */
  factoryState: string | null;
  /** When it was asked: the api asks each server once while it runs. */
  checkedAt: string | null;
};

/** A permission rule of the settings, and the file it was read from. */
export type DeniedRule = { rule: string; source: string };

export type Capabilities = {
  /** The checkout everything was read from. */
  repo: string;
  skills: Described[];
  agents: Described[];
  mcp: McpServer[];
  denied: DeniedRule[];
  /**
   * `permissions.ask` in `.claude/settings.json`, in its order: what asks whatever an allow rule or the harness's own leave says — Claude
   * Code reads them after the deny rules and before the allow rules. In `dontAsk`, where nothing asks, what they match is denied.
   */
  asked: DeniedRule[];
  /**
   * `permissions.allow` in `.claude/settings.json`, in its order: what a session runs without asking, beside what asks for no rule — Claude
   * Code's read-only commands (`CLAUDE_RULES.readOnlyCommands`) among it. In `dontAsk`, all it runs of what asks.
   */
  allowed: DeniedRule[];
  /** A file that is there and does not read: what was left out because of it, and the fix. */
  warnings: string[];
};

/** The checkout this api's source is in: the repository a person started it from. */
export const HOME_REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');

/**
 * The folder the daemon's pass ticks in (main.ts), and never a request's place: no route reads it, a request being placed by its factory
 * alone (`placeFor`, factory/place.ts). `HKB_REPO` when set — how the tests and `npm run e2e` give it a fixture — else, where the api runs
 * an install (`running`), the repository it was built from where that is a folder on disk, and its own checkout otherwise. None where the
 * install's `source` is no folder — an install unpacked from a published archive, whose source is the address it was downloaded from: an
 * address is never a folder, so it is never joined into one.
 */
export const repoOf = (env: NodeJS.ProcessEnv, running?: Running): string | undefined => {
  const given = env.HKB_REPO?.trim();
  if (given) return path.resolve(given);
  if (running?.kind !== 'install') return HOME_REPO;
  return isFolder(running.source) ? path.resolve(running.source) : undefined;
};

/** Whether `at` is a folder on disk, as written: an address (`https://…`) is not. */
const isFolder = (at: string): boolean => {
  if (!path.isAbsolute(at)) return false;
  try {
    return fs.statSync(at).isDirectory();
  } catch {
    return false;
  }
};

/** How long a server has to start and list its tools before it is reported as not answering. */
export const ASK_MS = 15_000;

export const SETTINGS = '.claude/settings.json';
const MCP_JSON = '.mcp.json';

/**
 * Everything the repository at `repo` offers. Never throws for what is on disk: an absent file is an empty list, a broken one a warning.
 * A server not enabled is not started: a GET does not run a command the person has not turned on, which is what enabling a project
 * server is for. Each server enabled is asked through `asker`, the app's `McpAsker` on a request; with none, through an asker of this
 * call's own, which asks each afresh.
 */
export async function capabilitiesOf(
  repo: string,
  {
    deadlineMs = ASK_MS,
    env = process.env,
    asker = makeMcpAsker(),
  }: { deadlineMs?: number; env?: NodeJS.ProcessEnv; asker?: AskServer } = {},
): Promise<Capabilities> {
  const warnings: string[] = [];
  const settings = jsonAt(repo, SETTINGS, warnings, 'nothing is read as denied or enabled from it');
  const deny = stringsAt(settings, ['permissions', 'deny'], warnings);
  const ask = stringsAt(settings, ['permissions', 'ask'], warnings);
  const allow = stringsAt(settings, ['permissions', 'allow'], warnings);
  const enabled = enabledBy(settings, warnings);
  const declared = declaredServers(jsonAt(repo, MCP_JSON, warnings, 'no MCP server is listed from it'), warnings);
  const mcp = await Promise.all(
    declared.map(async (server): Promise<McpServer> => {
      const entry = {
        name: server.name,
        source: MCP_JSON,
        type: server.type,
        command: server.command,
        args: server.args,
        url: server.url,
        enabled: enabled(server.name),
        tools: null,
        error: server.invalid,
        notAsked: null,
        factoryState: null,
        checkedAt: null,
      };
      if (server.invalid) return entry;
      if (!server.command)
        return {
          ...entry,
          notAsked:
            server.type === 'unknown'
              ? `Not a server a harness loads (${server.written === null ? 'no `type`' : `\`type: ${JSON.stringify(server.written)}\``}, at ${server.url}): give "type" one of ${HARNESS_TRANSPORTS.map((t) => `"${t}"`).join(', ')} in ${MCP_JSON}.`
              : `Not a stdio server (${server.type}, at ${server.url}): the api asks only stdio servers for their tools.`,
        };
      if (!entry.enabled) {
        return {
          ...entry,
          notAsked: `Not enabled by ${SETTINGS}, so the api does not start it. Add "${server.name}" to enabledMcpjsonServers there to list its tools.`,
        };
      }
      const stdio = { ...server, command: server.command };
      const launch = launchOf(repo, stdio, env);
      if ('missing' in launch) {
        const [them, each] = launch.missing.length > 1 ? ['them', 'each'] : ['it', 'it'];
        const named = launch.missing.map((name) => `\`\${${name}}\``).join(' and ');
        return {
          ...entry,
          error: `${MCP_JSON} gives ${server.name} ${named} with no default, and the api's environment does not set ${them}, so it is not started. Set ${them} where the api runs, or give ${each} a default: \`\${NAME:-value}\`.`,
        };
      }
      const answer = await asker(repo, stdio, launch, deadlineMs);
      return {
        ...entry,
        tools: answer.tools?.map((tool) => ({ ...tool, denied: CLAUDE_RULES.denyingRule(deny, server.name, tool.name) })) ?? null,
        error: answer.error,
        checkedAt: answer.checkedAt,
      };
    }),
  );
  return {
    repo,
    skills: skillsOf(repo, warnings),
    agents: agentsOf(repo, warnings),
    mcp,
    denied: deny.map((rule) => ({ rule, source: SETTINGS })),
    asked: ask.map((rule) => ({ rule, source: SETTINGS })),
    allowed: allow.map((rule) => ({ rule, source: SETTINGS })),
    warnings,
  };
}

/** `.claude/skills/*\/SKILL.md`, by directory. A directory without a SKILL.md is not a skill. */
function skillsOf(repo: string, warnings: string[]): Described[] {
  return namesIn(repo, '.claude/skills', warnings)
    .map((dir) => describedAt(repo, `.claude/skills/${dir}/SKILL.md`, dir, warnings))
    .filter((skill) => skill !== null);
}

/** `.claude/agents/*.md`, by file name. */
function agentsOf(repo: string, warnings: string[]): Described[] {
  return namesIn(repo, '.claude/agents', warnings)
    .filter((file) => file.endsWith('.md'))
    .map((file) => describedAt(repo, `.claude/agents/${file}`, file.slice(0, -'.md'.length), warnings))
    .filter((agent) => agent !== null);
}

/** The entries of a directory in the checkout, sorted. An absent directory has none. */
function namesIn(repo: string, dir: string, warnings: string[]): string[] {
  try {
    return fs.readdirSync(path.join(repo, dir)).sort();
  } catch (err) {
    if (!absent(err)) warnings.push(`${dir} could not be listed (${sentenceOf(err)}), so nothing in it is shown. Check its permissions.`);
    return [];
  }
}

/**
 * A skill or an agent from its file: named by its frontmatter's `name`, or by `fallback` when that does not name it, and described by its
 * `description`, each read through the package's one frontmatter reader and taken only where it is text. Null when there is no such file.
 * A frontmatter the reader refuses (one that never closes, or YAML in neither form) is a warning naming the file, and the file is still
 * listed by `fallback` with no description, as a harness still loads a skill whose YAML fails.
 */
export function describedAt(repo: string, source: string, fallback: string, warnings: string[]): Described | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(repo, source), 'utf8');
  } catch (err) {
    if (!absent(err)) warnings.push(`${source} could not be read (${sentenceOf(err)}), so it is not listed. Make it a readable file.`);
    return null;
  }
  let entries: FrontmatterEntry[];
  try {
    const { block } = splitFrontmatter(source, text);
    entries = block === null ? [] : readFrontmatter(source, block).entries;
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    warnings.push(`${err.message} Until it reads, it is listed as \`${fallback}\`, with no description.`);
    entries = [];
  }
  const textOf = (key: string): string | null => {
    const value = entries.find((entry) => entry.key === key)?.value;
    return typeof value === 'string' && value ? value : null;
  };
  return { name: textOf('name') ?? fallback, description: textOf('description'), source };
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A JSON object from a file in the checkout. Null when the file is absent; null and a warning saying what is left out when it does not
 * read.
 */
function jsonAt(repo: string, file: string, warnings: string[], leftOut: string): Json | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(repo, file), 'utf8');
  } catch (err) {
    if (!absent(err)) warnings.push(`${file} could not be read (${sentenceOf(err)}), so ${leftOut}. Make it a readable file.`);
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (isObject(value)) return value;
    warnings.push(`${file} is not a JSON object, so ${leftOut}. Make it one: \`{ … }\`.`);
  } catch (err) {
    warnings.push(
      `${file} does not parse as JSON (${sentenceOf(err)}), so ${leftOut}. Fix the file; the page reads it again on the next visit.`,
    );
  }
  return null;
}

/** The list of strings at `keys` in `settings`. Absent is empty; anything but a list of strings is empty and a warning. */
function stringsAt(settings: Json | null, keys: string[], warnings: string[]): string[] {
  let value: unknown = settings;
  for (const key of keys) value = isObject(value) ? value[key] : undefined;
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  warnings.push(`${keys.join('.')} in ${SETTINGS} is not a list of strings, so it is read as empty. Make it one: \`["…"]\`.`);
  return [];
}

/** Whether `.claude/settings.json` turns a server of `.mcp.json` on, the way a session reads those keys. */
function enabledBy(settings: Json | null, warnings: string[]): (name: string) => boolean {
  const listed = stringsAt(settings, ['enabledMcpjsonServers'], warnings);
  const disabled = stringsAt(settings, ['disabledMcpjsonServers'], warnings);
  const all = settings?.enableAllProjectMcpServers === true;
  return (name) => !disabled.includes(name) && (all || listed.includes(name));
}

/**
 * A server as `.mcp.json` declares it: `written` its `type` as written, or null where none is. `invalid` says what is wrong with an entry
 * the api cannot read.
 */
type Declared = {
  name: string;
  type: HarnessTransport | 'unknown';
  written: string | null;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  invalid: string | null;
};

/** A server's written `type` as its transport, and the word as written: `stdio` for a command with none, `unknown` for a url with none. */
const transportWritten = (written: unknown, command: string | null): Pick<Declared, 'type' | 'written'> =>
  typeof written === 'string' ? { type: transportOf(written), written } : { type: command ? 'stdio' : 'unknown', written: null };

function declaredServers(mcpJson: Json | null, warnings: string[]): Declared[] {
  if (!mcpJson) return [];
  if (!isObject(mcpJson.mcpServers)) {
    warnings.push(
      `${MCP_JSON} has no \`mcpServers\` object, so no MCP server is listed from it. Declare them as \`{ "mcpServers": { "<name>": { "command": "…" } } }\`.`,
    );
    return [];
  }
  return Object.entries(mcpJson.mcpServers).map(([name, spec]): Declared => {
    const bare: Declared = { name, type: 'stdio', written: null, command: null, args: [], env: {}, url: null, invalid: null };
    if (!isObject(spec))
      return { ...bare, invalid: `${MCP_JSON} declares ${name} as something other than an object, so it is not started.` };
    const command = typeof spec.command === 'string' && spec.command ? spec.command : null;
    const url = typeof spec.url === 'string' && spec.url ? spec.url : null;
    const args = Array.isArray(spec.args) && spec.args.every((arg) => typeof arg === 'string') ? spec.args : null;
    const env =
      isObject(spec.env) && Object.values(spec.env).every((value) => typeof value === 'string')
        ? (spec.env as Record<string, string>)
        : null;
    const declared = {
      ...bare,
      ...transportWritten(spec.type, command),
      command,
      url,
      args: args ?? [],
      env: env ?? {},
    };
    const wrong = [
      ...(command || url ? [] : ['neither a `command` nor a `url`']),
      ...(spec.args === undefined || args ? [] : ['`args` that are not a list of strings']),
      ...(spec.env === undefined || env ? [] : ['an `env` whose values are not all strings']),
    ];
    return wrong.length
      ? { ...declared, invalid: `${MCP_JSON} gives ${name} ${wrong.join(' and ')}, so it is not started. Fix its entry.` }
      : declared;
  });
}

/** What starts a stdio server: the command, its args, and the whole environment it is given. */
type Launch = { command: string; args: string[]; env: Record<string, string> };

/**
 * The api's own settings, which a server is not given: they mean nothing to it, and an inherited `PORT` could have it bind the api's port.
 */
const API_ONLY = new Set(['PORT', 'HKB_REPO']);

/**
 * The server started as a session starts it: `${VAR}` and `${VAR:-default}` expanded in its `command`, `args` and
 * `env` from `env` — the default when `VAR` is unset — and `env` itself inherited, less the api's own settings and
 * with `CLAUDE_PROJECT_DIR` the repository, under the entry's `env`. `missing` names each variable that is unset and
 * has no default: a session refuses such an entry too.
 */
function launchOf(repo: string, server: Declared & { command: string }, env: NodeJS.ProcessEnv): Launch | { missing: string[] } {
  const missing = new Set<string>();
  const expand = (text: string): string =>
    text.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (written, name: string, fallback: string | undefined) => {
      const value = env[name] ?? fallback;
      if (value === undefined) missing.add(name);
      return value ?? written;
    });
  const command = expand(server.command);
  const args = server.args.map(expand);
  const own = Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, expand(value)]));
  if (missing.size) return { missing: [...missing] };
  const inherited = Object.entries(env).filter((pair): pair is [string, string] => pair[1] !== undefined && !API_ONLY.has(pair[0]));
  return { command, args, env: { ...Object.fromEntries(inherited), CLAUDE_PROJECT_DIR: repo, ...own } };
}

type Answer = { tools: Array<{ name: string; description: string | null }> | null; error: string | null; checkedAt: string };

/** A stdio server asked for its tools (`serverAsk`), in the repository, as `launch` starts it, given `deadlineMs`: never rejects. */
export type AskServer = (repo: string, server: Started, launch: Launch, deadlineMs: number) => Promise<Answer>;

/**
 * An MCP asker that has asked nothing yet, and keeps every answer it has for as long as it lives. Keyed by the repository, the server and
 * all it is started with, so an edit to its entry asks again; the promise is kept, so requests that overlap ask once.
 */
export function makeMcpAsker(): AskServer {
  const answers = new Map<string, Promise<Answer>>();
  return (repo, server, launch, deadlineMs) => {
    const key = JSON.stringify([repo, server.name, launch]);
    let answer = answers.get(key);
    if (!answer) answers.set(key, (answer = Effect.runPromise(serverAsk(repo, server, launch, deadlineMs))));
    return answer;
  };
}

/** The MCP asker every request shares, one for an app (`live`, a fresh `makeMcpAsker`): each server asked once while the app runs. */
export class McpAsker extends Context.Service<McpAsker, AskServer>()('api/McpAsker') {
  static readonly live: Layer.Layer<McpAsker> = Layer.sync(McpAsker)(makeMcpAsker);
}

/** How much of a server's stderr an error keeps: its end, where a crash says why. */
const SAID_LINES = 20;

/**
 * The most a server that failed to list its tools, once stopped, is waited on for its stderr to end before the error quotes what it has
 * printed: a stopped server's stderr ends as its process does, so this bounds only a stream that never says so.
 */
const STDERR_END_MS = 2_000;

/** When `stream` ends — its end, its close or its error — or at once where there is none. */
const endOf = (stream: { once(event: string, listener: () => void): unknown } | null): Promise<void> =>
  new Promise((resolve) => {
    if (stream === null) return resolve();
    for (const event of ['end', 'close', 'error']) stream.once(event, () => resolve());
  });

/** A server as the api starts it: its name, and the command and args `.mcp.json` writes, which an error quotes. */
type Started = Pick<Declared, 'name' | 'args'> & { command: string };

/**
 * Start the server as `launch` says, in the repository, ask it `tools/list` over stdio, and stop it. The era it speaks is the SDK's to find
 * (`versionNegotiation: 'auto'`, as a step's session asks it): `server/discover` is sent to a short-lived sibling started first, which
 * answers the modern era, refuses or says nothing within a third of `deadlineMs`, and the server is then started once more and asked in
 * that era, `initialize` for the legacy — so each ask starts a server twice, the sibling's stderr left unread. Succeeds with the tools, or
 * with why not and what it printed, quoting the entry as `.mcp.json` writes it; never fails. What it printed is read to its end: a server
 * that failed is stopped (`client.close()`) and its stderr waited on until it ends (`endOf`, at most `STDERR_END_MS`), so a line it printed
 * after the client saw it fail is quoted too; a server that never started has no stderr to wait on. The client and its server are taken in
 * the ask's scope and closed as it closes (`client.close()`: stdin ended, then SIGTERM, then SIGKILL), whatever ends it: an answer,
 * `deadlineMs` passed, or an interruption; a request of the listing still in flight is rejected by that close. The transport is closed too,
 * as the client alone does not reach it before it connects: a close during the era probe is what reaps the probe's sibling, which the
 * listing settles once it has (waited on at most `STDERR_END_MS`). The listing is given no abort signal: the client closes itself on an
 * aborted `connect` and does not wait for the server, which a close after it then misses.
 */
export const serverAsk = (repo: string, server: Started, launch: Launch, deadlineMs: number): Effect.Effect<Answer> =>
  Effect.gen(function* () {
    let said = '';
    let listing: Promise<unknown> | undefined;
    const { client, transport, ended } = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const transport = new StdioClientTransport({
          command: launch.command,
          args: launch.args,
          env: launch.env,
          cwd: repo,
          stderr: 'pipe',
        });
        transport.stderr?.on('data', (chunk: Buffer) => (said = (said + chunk.toString()).slice(-16_000)));
        const client = new Client(
          { name: 'nemia-api', version: '0.0.0' },
          { versionNegotiation: { mode: 'auto', probe: { timeoutMs: Math.floor(deadlineMs / 3) } } },
        );
        return { transport, client, ended: endOf(transport.stderr) };
      }),
      ({ client, transport }) =>
        Effect.promise(async () => {
          await Promise.all([transport.close().catch(() => {}), client.close().catch(() => {})]);
          await Promise.race([listing?.catch(() => {}), new Promise((resolve) => setTimeout(resolve, STDERR_END_MS).unref())]);
        }),
    );
    return yield* Effect.tryPromise({ try: () => (listing = listTools(client, transport)), catch: (err) => err }).pipe(
      Effect.timeoutOrElse({
        duration: deadlineMs,
        orElse: () => Effect.fail(new Error(`it did not list its tools within ${deadlineMs / 1000} s`)),
      }),
      Effect.map((tools): Answer => ({ tools, error: null, checkedAt: new Date().toISOString() })),
      Effect.catch((err) =>
        stderrEnded(client, err, ended).pipe(
          Effect.map((): Answer => {
            const tail = said.trimEnd().split('\n').slice(-SAID_LINES).join('\n');
            const printed = tail ? `\nWhat it printed on stderr:\n${tail}` : '';
            return { tools: null, error: `${whyNot(server, err)}${printed}`, checkedAt: new Date().toISOString() };
          }),
        ),
      ),
    );
  }).pipe(Effect.scoped);

/**
 * A server that failed (`err`) stopped, and its stderr ended: at once for one that never started — no command to run, which printed
 * nothing — else once the stream says so, at most `STDERR_END_MS` after the server was stopped.
 */
const stderrEnded = (client: Client, err: unknown, ended: Promise<void>): Effect.Effect<void> =>
  (err as NodeJS.ErrnoException)?.code === 'ENOENT'
    ? Effect.void
    : Effect.promise(() => client.close().catch(() => {})).pipe(
        Effect.andThen(Effect.promise(() => ended).pipe(Effect.timeoutOption(STDERR_END_MS))),
        Effect.asVoid,
      );

/**
 * The tools a connected server lists, every page of them. A server that offers no tools — only prompts or resources — has no `tools/list`
 * to answer, and says so with -32601: it lists none, rather than a working server being reported as broken.
 */
async function listTools(client: Client, transport: StdioClientTransport): Promise<NonNullable<Answer['tools']>> {
  await client.connect(transport);
  if (!client.getServerCapabilities()?.tools) return [];
  const tools: NonNullable<Answer['tools']> = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools.map((tool) => ({ name: tool.name, description: tool.description?.trim() || null })));
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

function whyNot(server: Started, err: unknown): string {
  const started = `\`${[server.command, ...server.args].join(' ')}\``;
  if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return `${started} did not start: there is no command \`${server.command}\` on its PATH. Install it, or fix \`command\` for ${server.name} in ${MCP_JSON}.`;
  }
  return `${started} did not list its tools: ${sentenceOf(err)}. Run it yourself to see why, or fix its entry in ${MCP_JSON}.`;
}

const absent = (err: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException)?.code ?? '');

const sentenceOf = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/\.$/, '');
