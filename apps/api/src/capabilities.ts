/**
 * What a repository offers a step, read from its checkout: its skills, its agents, its MCP servers with the
 * tools each lists, and the tools its settings deny.
 *
 * The inventory half of B1 (docs/plan-hold-the-bar.md). What a step was actually given is on the engine's
 * record, shown on the run's page; a toggle is a key in the workflow folder. Nothing here writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** A skill or an agent: what its frontmatter calls it, what it says it is for, and the file it was read from. */
export type Described = { name: string; description: string | null; source: string };

/** A tool a server listed. `denied` is the rule in `permissions.deny` that refuses it, if one does. */
export type McpTool = { name: string; description: string | null; denied: string | null };

/** A server as `.mcp.json` declares it, and what it answered when the api asked it for its tools. */
export type McpServer = {
  name: string;
  source: string;
  /** `.mcp.json`'s `type`: `stdio` for a server with a command and none given. */
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  /** Whether `.claude/settings.json` enables it: `enabledMcpjsonServers` or `enableAllProjectMcpServers`, and not `disabledMcpjsonServers`. */
  enabled: boolean;
  /** What it listed, or null when it was not asked or did not answer. */
  tools: McpTool[] | null;
  /** Why it did not list its tools, and the end of what it printed on stderr. */
  error: string | null;
  /** Why the api did not ask it — not enabled, or not a stdio server. */
  notAsked: string | null;
  /** When it was asked: the api asks each server once while it runs. */
  checkedAt: string | null;
};

export type DeniedRule = { rule: string; source: string };

export type Capabilities = {
  /** The checkout everything was read from. */
  repo: string;
  skills: Described[];
  agents: Described[];
  mcp: McpServer[];
  denied: DeniedRule[];
  /** A file that is there and does not read: what was left out because of it, and the fix. */
  warnings: string[];
};

/** The checkout this api's source is in: the repository a person started it from. */
export const HOME_REPO = path.resolve(import.meta.dirname, '..', '..', '..');

/** The repository the api serves: `HKB_REPO` when set — how the tests and `npm run e2e` give it a fixture — and its own checkout otherwise. */
export const repoOf = (env: NodeJS.ProcessEnv = process.env): string => path.resolve(env.HKB_REPO?.trim() || HOME_REPO);

/** How long a server has to start and list its tools before it is reported as not answering. */
export const ASK_MS = 15_000;

const SETTINGS = '.claude/settings.json';
const MCP_JSON = '.mcp.json';

/** Everything the repository at `repo` offers. Never throws for what is on disk: an absent file is an empty list, a broken one a warning. */
export async function capabilitiesOf(repo: string, { deadlineMs = ASK_MS }: { deadlineMs?: number } = {}): Promise<Capabilities> {
  const warnings: string[] = [];
  const settings = jsonAt(repo, SETTINGS, warnings, 'nothing is read as denied or enabled from it');
  const deny = stringsAt(settings, ['permissions', 'deny'], warnings);
  const enabled = enabledBy(settings, warnings);
  const declared = declaredServers(jsonAt(repo, MCP_JSON, warnings, 'no MCP server is listed from it'), warnings);
  const mcp = await Promise.all(declared.map(async (server): Promise<McpServer> => {
    const entry = {
      name: server.name, source: MCP_JSON, type: server.type, command: server.command, args: server.args, url: server.url,
      enabled: enabled(server.name), tools: null, error: server.invalid, notAsked: null, checkedAt: null,
    };
    if (server.invalid) return entry;
    if (!server.command) return { ...entry, notAsked: `Not a stdio server (${server.type}, at ${server.url}): the api asks only stdio servers for their tools.` };
    // A GET does not run a command the person has not turned on: that is what enabling a project server is for.
    if (!entry.enabled) {
      return { ...entry, notAsked: `Not enabled by ${SETTINGS}, so the api does not start it. Add "${server.name}" to enabledMcpjsonServers there to list its tools.` };
    }
    const answer = await answerOf(repo, { ...server, command: server.command }, deadlineMs);
    return {
      ...entry,
      tools: answer.tools?.map((tool) => ({ ...tool, denied: denyingRule(deny, server.name, tool.name) })) ?? null,
      error: answer.error,
      checkedAt: answer.checkedAt,
    };
  }));
  return {
    repo,
    skills: skillsOf(repo, warnings),
    agents: agentsOf(repo, warnings),
    mcp,
    denied: deny.map((rule) => ({ rule, source: SETTINGS })),
    warnings,
  };
}

/**
 * The rule in `deny` that refuses the tool `mcp__<server>__<tool>`, if one does: one naming the tool, the whole
 * server (`mcp__<server>`), or every tool of it (`mcp__<server>__*`). A rule naming a prefix of either refuses nothing.
 */
export function denyingRule(deny: readonly string[], server: string, tool: string): string | null {
  const prefix = `mcp__${server}`;
  return deny.find((rule) => rule === `${prefix}__${tool}` || rule === prefix || rule === `${prefix}__*`) ?? null;
}

// ─── skills and agents ──────────────────────────────────────────────────────

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
    if (!absent(err)) warnings.push(`${dir} could not be listed (${messageOf(err)}), so nothing in it is shown. Check its permissions.`);
    return [];
  }
}

/** A skill or an agent from its file: named by its frontmatter, or by `fallback` when that does not name it. Null when there is no such file. */
function describedAt(repo: string, source: string, fallback: string, warnings: string[]): Described | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(repo, source), 'utf8');
  } catch (err) {
    if (!absent(err)) warnings.push(`${source} could not be read (${messageOf(err)}), so it is not listed. Make it a readable file.`);
    return null;
  }
  const fields = frontmatterOf(text);
  return { name: fields?.name || fallback, description: fields?.description || null, source };
}

/**
 * The top-level `key: value` pairs of a markdown file's YAML frontmatter, or null when it has none: no `---` on
 * its first line, or one that never closes. As much YAML as a skill or an agent uses to say what it is: plain
 * values, which may run on over indented lines; single- and double-quoted strings; `|` and `>` blocks. A nested
 * map or a list under a key is skipped, not read.
 */
export function frontmatterOf(text: string): Record<string, string> | null {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trimEnd() !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end < 0) return null;
  const fields: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const key = /^([A-Za-z0-9_][\w.-]*):(?:[ \t]+(.*))?$/.exec(lines[i]!);
    if (!key) continue;
    const more: string[] = [];
    while (i + 1 < end && /^(\s|$)/.test(lines[i + 1]!)) more.push(lines[++i]!);
    const value = valueOf(key[2]?.trim() ?? '', more);
    if (value !== null) fields[key[1]!] = value;
  }
  return fields;
}

/** A value from the rest of its key's line and the indented lines under it. Null for a nested map or list. */
function valueOf(first: string, more: string[]): string | null {
  const block = /^([|>])[+-]?\d*\s*(#.*)?$/.exec(first);
  if (block) {
    const body = dedent(more).join('\n').trim();
    // `>` folds each line break between two lines of text into a space; a blank line stays a line break.
    return block[1] === '|' ? body : body.replace(/([^\n])\n(?=[^\n])/g, '$1 ').replace(/\n\n/g, '\n');
  }
  if (!first && more.some((line) => /^\s*(-|[\w.-]+:)(\s|$)/.test(line))) return null;
  const text = [first, ...more.map((line) => line.trim()).filter(Boolean)].join(' ');
  if (text.startsWith('"')) {
    const quoted = text.slice(0, text.lastIndexOf('"') + 1);
    try {
      return JSON.parse(quoted) as string;
    } catch {
      return quoted.slice(1, -1);
    }
  }
  if (text.startsWith("'") && text.lastIndexOf("'") > 0) return text.slice(1, text.lastIndexOf("'")).replaceAll("''", "'");
  return text.replace(/(^|\s)#.*$/, '').trim();
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent).trimEnd());
}

// ─── settings and .mcp.json ─────────────────────────────────────────────────

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A JSON object from a file in the checkout. Null when the file is absent; null and a warning saying what is left out when it does not read. */
function jsonAt(repo: string, file: string, warnings: string[], leftOut: string): Json | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(repo, file), 'utf8');
  } catch (err) {
    if (!absent(err)) warnings.push(`${file} could not be read (${messageOf(err)}), so ${leftOut}. Make it a readable file.`);
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (isObject(value)) return value;
    warnings.push(`${file} is not a JSON object, so ${leftOut}. Make it one: \`{ … }\`.`);
  } catch (err) {
    warnings.push(`${file} does not parse as JSON (${messageOf(err)}), so ${leftOut}. Fix the file; the page reads it again on the next visit.`);
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

/** A server as `.mcp.json` declares it. `invalid` says what is wrong with an entry the api cannot read. */
type Declared = {
  name: string;
  type: string;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  invalid: string | null;
};

function declaredServers(mcpJson: Json | null, warnings: string[]): Declared[] {
  if (!mcpJson) return [];
  if (!isObject(mcpJson.mcpServers)) {
    warnings.push(`${MCP_JSON} has no \`mcpServers\` object, so no MCP server is listed from it. Declare them as \`{ "mcpServers": { "<name>": { "command": "…" } } }\`.`);
    return [];
  }
  return Object.entries(mcpJson.mcpServers).map(([name, spec]): Declared => {
    const bare: Declared = { name, type: 'stdio', command: null, args: [], env: {}, url: null, invalid: null };
    if (!isObject(spec)) return { ...bare, invalid: `${MCP_JSON} declares ${name} as something other than an object, so it is not started.` };
    const command = typeof spec.command === 'string' && spec.command ? spec.command : null;
    const url = typeof spec.url === 'string' && spec.url ? spec.url : null;
    const args = Array.isArray(spec.args) && spec.args.every((arg) => typeof arg === 'string') ? spec.args : null;
    const env = isObject(spec.env) && Object.values(spec.env).every((value) => typeof value === 'string') ? (spec.env as Record<string, string>) : null;
    const declared = { ...bare, type: typeof spec.type === 'string' ? spec.type : command ? 'stdio' : 'unknown', command, url, args: args ?? [], env: env ?? {} };
    const wrong = [
      ...(command || url ? [] : ['neither a `command` nor a `url`']),
      ...(spec.args === undefined || args ? [] : ['`args` that are not a list of strings']),
      ...(spec.env === undefined || env ? [] : ['an `env` whose values are not all strings']),
    ];
    return wrong.length ? { ...declared, invalid: `${MCP_JSON} gives ${name} ${wrong.join(' and ')}, so it is not started. Fix its entry.` } : declared;
  });
}

// ─── asking a server for its tools ──────────────────────────────────────────

type Answer = { tools: Array<{ name: string; description: string | null }> | null; error: string | null; checkedAt: string };

/**
 * Every answer the api has had, for the life of the process. Keyed by the repository and all `.mcp.json` says
 * to start the server, so an edit to its entry asks again; the promise is kept, so requests that overlap ask once.
 */
const answers = new Map<string, Promise<Answer>>();

function answerOf(repo: string, server: Declared & { command: string }, deadlineMs: number): Promise<Answer> {
  const key = JSON.stringify([repo, server.name, server.command, server.args, server.env]);
  let answer = answers.get(key);
  if (!answer) answers.set(key, (answer = ask(repo, server, deadlineMs)));
  return answer;
}

/** How much of a server's stderr an error keeps: its end, where a crash says why. */
const SAID_LINES = 20;

/**
 * Start the server as `.mcp.json` says, in the repository, ask it `tools/list` over stdio, and stop it.
 *
 * Its environment is the MCP SDK's default — `HOME`, `PATH`, `USER` and the like, not the api's own — with the
 * entry's `env` over it. Resolves with the tools, or with why not and what it printed; never rejects.
 */
async function ask(repo: string, server: Declared & { command: string }, deadlineMs: number): Promise<Answer> {
  const transport = new StdioClientTransport({ command: server.command, args: server.args, env: server.env, cwd: repo, stderr: 'pipe' });
  let said = '';
  transport.stderr?.on('data', (chunk: Buffer) => (said = (said + chunk.toString()).slice(-16_000)));
  const client = new Client({ name: 'hkb-api', version: '0.0.0' });
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`it did not list its tools within ${deadlineMs / 1000} s`)), deadlineMs);
  });
  try {
    const tools = await Promise.race([listTools(client, transport), late]);
    return { tools, error: null, checkedAt: new Date().toISOString() };
  } catch (err) {
    // A server that exits is closed before the last of its stderr has been read: give that a turn to arrive.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const tail = said.trimEnd().split('\n').slice(-SAID_LINES).join('\n');
    return {
      tools: null,
      error: `${whyNot(server, err)}${tail ? `\nWhat it printed on stderr:\n${tail}` : ''}`,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
  }
}

async function listTools(client: Client, transport: StdioClientTransport): Promise<NonNullable<Answer['tools']>> {
  await client.connect(transport);
  // A server that offers no tools — only prompts or resources — has no `tools/list` to answer, and says so with
  // -32601. It lists none: asking would report a working server as broken.
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

function whyNot(server: Declared & { command: string }, err: unknown): string {
  const started = `\`${[server.command, ...server.args].join(' ')}\``;
  if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return `${started} did not start: there is no command \`${server.command}\` on its PATH. Install it, or fix \`command\` for ${server.name} in ${MCP_JSON}.`;
  }
  return `${started} did not list its tools: ${messageOf(err)}. Run it yourself to see why, or fix its entry in ${MCP_JSON}.`;
}

const absent = (err: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException)?.code ?? '');

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/\.$/, '');
