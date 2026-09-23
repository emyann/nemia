/**
 * A task's MCP servers, as Claude Code is handed them: what the engine refuses of a task's `mcp`, the checkout's own
 * `.mcp.json`, the task's config written to a file, and the flags that load those and nothing else. And as Codex is
 * handed them: the server names an operator's Codex config already has, and a task's servers as its `mcp_servers` table.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer, SpawnRequest } from './runner.ts';

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringMap = (v: unknown) => isMap(v) && Object.values(v).every((s) => typeof s === 'string');

/**
 * Why a task's `mcp` is not a map of MCP servers, as a sentence that says what to write — or
 * `undefined`. Closed, like a brief's keys, because Claude Code does not refuse an entry it cannot
 * use: on 2.1.270 a `url` with no `type` loads no server and says nothing.
 */
export const mcpRefuses = (mcp: unknown): string | undefined => {
  const shape = 'An entry is { "command": "npx", "args": [...], "env": {...} }, or { "type": "http", "url": "https://...", "headers": {...} }, as in a `.mcp.json`.';
  if (!isMap(mcp)) return `\`mcp: ${JSON.stringify(mcp)}\` is not a map of MCP servers by name. ${shape}`;
  for (const [name, server] of Object.entries(mcp)) {
    const at = `\`mcp.${name}\``;
    if (!/^[\w-]+$/.test(name)) return `\`mcp: ${JSON.stringify(name)}\` is not a server name. Use letters, digits, - and _.`;
    if (!isMap(server)) return `${at} is not a server. ${shape}`;
    const local = 'command' in server;
    if (local === ('url' in server)) return `${at} has ${local ? 'both `command` and `url`' : 'neither `command` nor `url`'}. ${shape}`;
    const stray = Object.keys(server).find((k) => !(local ? ['type', 'command', 'args', 'env'] : ['type', 'url', 'headers']).includes(k));
    if (stray) return `${at} has \`${stray}\`, which a server with a \`${local ? 'command' : 'url'}\` does not take. ${shape}`;
    if (local) {
      if (typeof server.command !== 'string' || !server.command) return `\`mcp.${name}.command\` is not a program to run. Give it as a string, like "npx".`;
      if (server.type !== undefined && server.type !== 'stdio') return `${at} has a \`command\` and \`type: ${JSON.stringify(server.type)}\`. Leave \`type\` out, or give "stdio".`;
      if (server.args !== undefined && !(Array.isArray(server.args) && server.args.every((a) => typeof a === 'string'))) {
        return `\`mcp.${name}.args\` is not a list of strings. Give one argument per entry, like ["-y", "@playwright/mcp"].`;
      }
      if (server.env !== undefined && !isStringMap(server.env)) return `\`mcp.${name}.env\` is not a map of strings. Quote every value, like { "PORT": "3000" }.`;
    } else {
      if (typeof server.url !== 'string' || !server.url) return `\`mcp.${name}.url\` is not an address. Give it as a string, like "https://example.com/mcp".`;
      if (server.type !== 'http' && server.type !== 'sse') {
        return `${at} has a \`url\` and ${server.type === undefined ? 'no `type`' : `\`type: ${JSON.stringify(server.type)}\``}. Give "type": "http", or "sse": Claude Code loads no server from a url without one.`;
      }
      if (server.headers !== undefined && !isStringMap(server.headers)) return `\`mcp.${name}.headers\` is not a map of strings. Quote every value, like { "Authorization": "Bearer ..." }.`;
    }
  }
  return undefined;
};

/**
 * The checkout's own `.mcp.json`, when it has one: the repository's servers, named so that
 * `--strict-mcp-config` keeps them. One that is not JSON is refused here, before anything runs —
 * named, it stops the CLI before a session exists ("MCP config is not a valid JSON", 2.1.270).
 */
export const checkoutMcpConfig = (cwd: string): string | undefined => {
  // Absolute: Claude Code resolves the flag's path from inside the cwd, so `repo` would name repo/repo.
  const file = path.resolve(cwd, '.mcp.json');
  let text: string;
  try {
    if (!fs.statSync(file).isFile()) return undefined;
    text = fs.readFileSync(file, 'utf8');
  } catch { return undefined; }
  try { JSON.parse(text); } catch (e) {
    throw new Error(`${file} is not valid JSON (${(e as Error).message}), and Claude Code starts no session with it named. Fix the file, or remove it from the checkout.`);
  }
  return file;
};

/**
 * A task's `mcp`, written to `file` as an MCP config (`{"mcpServers": …}`) — or `file` cleared when
 * the task names none, so a re-spawn never finds servers it was not given. Owner-only: an `env` or
 * `headers` value may be a secret.
 */
export const writeMcpConfig = (file: string, mcp: SpawnRequest['mcp']): string | undefined => {
  if (!mcp || !Object.keys(mcp).length) { fs.rmSync(file, { force: true }); return undefined; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers: mcp }), { mode: 0o600 });
  // Absolute for the same reason as the checkout's: a root given relative is relative to the engine.
  return path.resolve(file);
};

/**
 * Claude Code's MCP flags: the configs given, then `--strict-mcp-config` and `--no-chrome`, always.
 *
 * Strict loads those configs and nothing else — but not every server comes from a config. Claude in
 * Chrome, which drives the operator's own browser and whatever they are signed in to there, is
 * switched on by a user setting (`claudeInChromeDefaultEnabled`), and it was still connecting in a
 * `--bg` session spawned strict (2.1.270). So it is switched off by its own flag; a step that needs a
 * browser names one in `mcp` or its checkout's `.mcp.json`. Strict comes straight after the configs
 * because `--mcp-config` is variadic.
 */
export const claudeMcpArgs = (configs: ReadonlyArray<string | undefined>): string[] => {
  const named = configs.filter((c): c is string => c !== undefined);
  return [...(named.length ? ['--mcp-config', ...named] : []), '--strict-mcp-config', '--no-chrome'];
};

/**
 * The MCP server names a Codex config gives, as `codex mcp add` writes them: `[mcp_servers.<name>]`
 * tables and the tables under them. Not TOML in general — an inline `mcp_servers = {…}` is not read —
 * so a name it misses meets Codex's own merge, which is where a task stood before this was read.
 */
export const codexMcpServerNames = (toml: string): Set<string> => {
  const names = new Set<string>();
  for (const raw of toml.split('\n')) {
    const table = /^\[mcp_servers\.(?:"((?:[^"\\]|\\.)*)"|([\w-]+))(?:\.[^\]]*)?\]$/.exec(raw.trim());
    if (table) names.add(table[1] ?? table[2]!);
  }
  return names;
};

/** A TOML basic string. JSON's escapes are TOML's; TOML also wants DEL escaped. */
const tomlString = (s: string) => JSON.stringify(s).replace(/\x7f/g, '\\u007f');
const tomlTable = (entries: ReadonlyArray<readonly [string, string | undefined]>) =>
  `{${entries.flatMap(([k, v]) => (v === undefined ? [] : [`${tomlString(k)}=${v}`])).join(',')}}`;
const tomlStrings = (m: Record<string, string> | undefined) =>
  m === undefined ? undefined : tomlTable(Object.entries(m).map(([k, v]) => [k, tomlString(v)] as const));

/**
 * A task's `mcp` as Codex's `mcp_servers` table, inline: `command`, `args`, `env`, or `url` with its
 * headers as `http_headers`. One value with every name quoted, because a dotted `-c` key is split on
 * every dot, quotes or none ("invalid transport in `mcp_servers."a`", 0.154.0).
 */
export const codexMcpServers = (mcp: Record<string, McpServer>): string =>
  tomlTable(Object.entries(mcp).map(([name, s]) => [name, 'command' in s
    ? tomlTable([['command', tomlString(s.command)], ['args', s.args && `[${s.args.map((a) => tomlString(a)).join(',')}]`], ['env', tomlStrings(s.env)]])
    : tomlTable([['url', tomlString(s.url)], ['http_headers', tomlStrings(s.headers)]])] as const));
