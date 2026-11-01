/**
 * What a repository offers a step, read from its checkout: its skills, its agents, its MCP servers with the
 * tools each lists, and the tools its settings deny.
 *
 * What a step was actually given is on the engine's record, shown on the run's page; a toggle is a key in the workflow folder. Nothing
 * here writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Context, Effect, Layer } from 'effect';
import { MCP_TRANSPORTS, transportOf, type McpTransport, type Running } from 'agent-orchestrator';
import { WorkflowError, readFrontmatter, splitFrontmatter } from 'agent-orchestrator/workflow';
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
   * `.mcp.json`'s `type`, as the transport a harness loads the server over (`MCP_TRANSPORTS`): `stdio` for a server with a command and
   * none given, and `unknown` for any other word, or a url with none, the word as written quoted in `notAsked`.
   */
  type: McpTransport | 'unknown';
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
   * Code's read-only commands (`READ_ONLY_COMMANDS`) among it. In `dontAsk`, all it runs of what asks.
   */
  allowed: DeniedRule[];
  /** A file that is there and does not read: what was left out because of it, and the fix. */
  warnings: string[];
};

/** The checkout this api's source is in: the repository a person started it from. */
export const HOME_REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');

/**
 * The repository the api serves: `HKB_REPO` when set — how the tests and `npm run e2e` give it a fixture — else, where the api runs an
 * install (`running`), the repository it was built from, and its own checkout otherwise.
 */
export const repoOf = (env: NodeJS.ProcessEnv, running?: Running): string =>
  path.resolve(env.HKB_REPO?.trim() || (running?.kind === 'install' ? running.source : HOME_REPO));

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
              ? `Not a server a harness loads (${server.written === null ? 'no `type`' : `\`type: ${JSON.stringify(server.written)}\``}, at ${server.url}): give "type" one of ${MCP_TRANSPORTS.map((t) => `"${t}"`).join(', ')} in ${MCP_JSON}.`
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
        tools: answer.tools?.map((tool) => ({ ...tool, denied: denyingRule(deny, server.name, tool.name) })) ?? null,
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

/**
 * What a measurement carries so that it is never read as current: the harness it was taken on, that harness's version, the day, and where
 * it is recorded.
 */
export type Dated = { harness: string; version: string; measuredAt: string; source: string };

/**
 * `measurement`, refused unless it says what it was taken on and when: a harness named, a version numbered as Claude Code numbers its own
 * (`2.1.272`), a day that is on the calendar, written `YYYY-MM-DD` — not the 30th of February — and where it is recorded. A list without
 * them reads as a claim about today, which nothing here can check: the page says which day and which version, and those are all that hold
 * it to what was measured.
 */
export function dated<T extends Dated>(name: string, measurement: T): T {
  const { harness, version, measuredAt, source } = measurement as Partial<Dated>;
  const said = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
  const at = said(measuredAt) && /^\d{4}-\d{2}-\d{2}$/.test(measuredAt) ? new Date(`${measuredAt}T00:00:00Z`) : null;
  const day = at !== null && !Number.isNaN(at.getTime()) && at.toISOString().startsWith(measuredAt as string);
  const wrong = [
    ...(said(harness) ? [] : ['no `harness`']),
    ...(said(version) && /^\d+\.\d+\.\d+$/.test(version)
      ? []
      : [`no \`version\` numbered as 2.1.272 (${JSON.stringify(version ?? null)})`]),
    ...(day ? [] : [`no \`measuredAt\` day written as 2026-09-15 (${JSON.stringify(measuredAt ?? null)})`]),
    ...(said(source) ? [] : ['no `source`']),
  ];
  if (wrong.length === 0) return measurement;
  throw Object.assign(
    new Error(
      `${name} has ${wrong.join(', ')}. A measurement is data of one day and one version: give it the day it was taken, the version it was taken on, and where that is recorded.`,
    ),
    { exitCode: 2 },
  );
}

/**
 * The read-only commands as `dated` holds a measurement, and more: `measured` and `documented` each a list of commands, one word each, with
 * none listed twice and none both measured and documented, and `docs` saying when the docs were read.
 */
export function readOnlyCommands<T extends Dated & { measured: readonly string[]; documented: readonly string[]; docs: string }>(
  name: string,
  commands: T,
): T {
  dated(name, commands);
  const listed = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every((c) => typeof c === 'string' && /^[a-z][\w-]*$/.test(c));
  const { measured, documented, docs } = commands as Partial<T>;
  const all = [...(listed(measured) ? measured : []), ...(listed(documented) ? documented : [])];
  const twice = [...new Set(all.filter((c, i) => all.indexOf(c) !== i))];
  const wrong = [
    ...(listed(measured) && measured.length > 0 ? [] : ['no `measured` list of commands, one word each']),
    ...(listed(documented) ? [] : ['no `documented` list of commands, one word each']),
    ...(twice.length === 0 ? [] : [`${twice.join(', ')} listed twice`]),
    ...(typeof docs === 'string' && /read \d{4}-\d{2}-\d{2}$/.test(docs)
      ? []
      : ['no `docs` ending in the day they were read ("read 2026-09-16")']),
  ];
  if (wrong.length === 0) return commands;
  throw Object.assign(new Error(`${name} has ${wrong.join(', ')}. Fix the list where it is declared.`), { exitCode: 2 });
}

/**
 * Why a tool the fenced reviewer had is taken to be in the unfenced set: `tools:` narrows the harness's own set, and adds nothing to it.
 */
const ON_THE_FENCED =
  "Not named by the unfenced measurement. The fenced reviewer had it the same day, and `tools:` only narrows the harness's own set.";
/** Why Edit and Write are taken to be in it: nothing measured names them. */
const EDITS_WITH = 'Not named by any measurement. A step filed with no `tools:` changes files with it.';

/**
 * What a Claude Code step with no `tools:` has: the harness's own set, as measured — `claude -p` spawned with the engine's flags, as an
 * `implement` step, on the day and the version it names (`measuredAt`, `version`), recorded where `source` says. Data with its date and
 * version, and nothing here asks the harness again: a later Claude Code may give another set, so the page says when and on which version
 * this was measured, and never that it is current.
 *
 * `tools` are the built-in tools that measurement names, as it writes them (`Cron*` and `Task*` a family each), and nothing else: the api's
 * test refuses a name the ledger's bullet does not write as a tool of its own. `inferred` are tools such a step is taken to have that no
 * unfenced measurement names, each with why, which the page marks as inferred and never as measured. `lacks` are the ones the measurement
 * found absent. MCP tools are in neither: the checkout's servers reach a step whatever its `tools:`
 * (packages/agent-orchestrator/docs/features.md, measured), and each lists its own.
 */
export const MEASURED_TOOLS = dated('MEASURED_TOOLS', {
  harness: 'Claude Code',
  version: '2.1.270',
  measuredAt: '2026-09-14',
  source: 'docs/plan-hold-the-bar.md §4b, "what a worker gets, measured"',
  tools: [
    'Agent',
    'Cron*',
    'Monitor',
    'NotebookEdit',
    'RemoteTrigger',
    'ScheduleWakeup',
    'SendMessage',
    'Task*',
    'WebFetch',
    'WebSearch',
    'Workflow',
  ],
  inferred: [
    { name: 'Bash', why: ON_THE_FENCED },
    { name: 'Glob', why: ON_THE_FENCED },
    { name: 'Grep', why: ON_THE_FENCED },
    { name: 'Read', why: ON_THE_FENCED },
    { name: 'Skill', why: ON_THE_FENCED },
    { name: 'Edit', why: EDITS_WITH },
    { name: 'Write', why: EDITS_WITH },
  ],
  lacks: ['Artifact', 'AskUserQuestion'],
} as const);

/**
 * The Bash commands Claude Code runs without a prompt in every mode, `dontAsk` among them, with no rule allowing them — unless a deny names
 * them, or an ask rule does, which makes one ask, and in `dontAsk` denied. Data with its date and version, as `MEASURED_TOOLS` is: nothing
 * here asks the harness again, and the page never says it is current.
 *
 * `measured` are what a session in `dontAsk` ran, under this repository's settings of the day `measuredAt` names, which allowed none of
 * them, recorded where `source` says: `cat`, `ls` and `grep` alone and `head` and `tail` in a pipe, while `node -e` was denied. That is
 * what was measured, and it stays so whatever the settings allow: a rule allowing `ls` proves nothing of that day's run, and takes nothing
 * from it. So nothing checks the list against the settings; `readOnlyCommands` holds its shape and its
 * date, and the page says the day. `documented` are the rest of what Claude Code's docs name, which say the set includes them, not that it
 * is all of it; `git` is its read-only forms, which they do not list.
 */
export const READ_ONLY_COMMANDS = readOnlyCommands('READ_ONLY_COMMANDS', {
  harness: 'Claude Code',
  version: '2.1.272',
  measuredAt: '2026-09-15',
  source: "B9's last review (docs/plan-hold-the-bar.md §6 item 30)",
  measured: ['cat', 'grep', 'head', 'ls', 'tail'],
  documented: ['cd', 'diff', 'du', 'echo', 'find', 'git', 'pwd', 'stat', 'wc', 'which'],
  docs: 'code.claude.com/docs/en/permissions, "Read-only commands", read 2026-09-16',
} as const);

/**
 * The rule in `deny` that refuses the tool `mcp__<server>__<tool>`, if one does: one naming the tool, the whole
 * server (`mcp__<server>`), or every tool of it (`mcp__<server>__*`). A rule naming a prefix of either refuses nothing.
 */
export function denyingRule(deny: readonly string[], server: string, tool: string): string | null {
  const prefix = `mcp__${server}`;
  return deny.find((rule) => rule === `${prefix}__${tool}` || rule === prefix || rule === `${prefix}__*`) ?? null;
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
  type: McpTransport | 'unknown';
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
 * How long a server that failed to list its tools is given for the last of its stderr to arrive before the error quotes it: the transport
 * closes a server that exits before its stderr has been read to the end.
 */
const STDERR_SETTLE_MS = 50;

/** A server as the api starts it: its name, and the command and args `.mcp.json` writes, which an error quotes. */
type Started = Pick<Declared, 'name' | 'args'> & { command: string };

/**
 * Start the server as `launch` says, in the repository, ask it `tools/list` over stdio, and stop it. Succeeds with the tools, or with why
 * not and what it printed (after `STDERR_SETTLE_MS`), quoting the entry as `.mcp.json` writes it; never fails. The client and its server
 * are taken in the ask's scope and closed as it closes (`client.close()`: stdin ended, then SIGTERM, then SIGKILL), whatever ends it: an
 * answer, `deadlineMs` passed, or an interruption; a request of the listing still in flight is rejected by that close. The listing is given
 * no abort signal: the client closes itself on an aborted `connect` and does not wait for the server, which a close after it then misses.
 */
export const serverAsk = (repo: string, server: Started, launch: Launch, deadlineMs: number): Effect.Effect<Answer> =>
  Effect.gen(function* () {
    let said = '';
    const { client, transport } = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const transport = new StdioClientTransport({
          command: launch.command,
          args: launch.args,
          env: launch.env,
          cwd: repo,
          stderr: 'pipe',
        });
        transport.stderr?.on('data', (chunk: Buffer) => (said = (said + chunk.toString()).slice(-16_000)));
        return { transport, client: new Client({ name: 'nemia-api', version: '0.0.0' }) };
      }),
      ({ client }) => Effect.promise(() => client.close().catch(() => {})),
    );
    return yield* Effect.tryPromise({ try: () => listTools(client, transport), catch: (err) => err }).pipe(
      Effect.timeoutOrElse({
        duration: deadlineMs,
        orElse: () => Effect.fail(new Error(`it did not list its tools within ${deadlineMs / 1000} s`)),
      }),
      Effect.map((tools): Answer => ({ tools, error: null, checkedAt: new Date().toISOString() })),
      Effect.catch((err) =>
        Effect.sleep(STDERR_SETTLE_MS).pipe(
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
