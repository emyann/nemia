/**
 * A task's MCP servers, as Claude Code is handed them: what the engine refuses of a task's `mcp`, the checkout's own
 * `.mcp.json` and the entries a task picks of it, the task's config written to a file, the flags that load those and
 * nothing else, and every server a session is given as one value (`everyMcpServer`), which an attached session rides on
 * `Options.mcpServers` instead of a file. And as Codex is handed them: the server names an operator's Codex config already
 * has, and a task's servers as its `mcp_servers` table.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer, RemoteMcpServer } from './seam.ts';
import type { HarnessArgs } from './args.ts';

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringMap = (v: unknown) => isMap(v) && Object.values(v).every((s) => typeof s === 'string');

/** Why `mcp.<name>`, a server with a `command`, is not one a harness can start — or `undefined`. */
const localRefuses = (name: string, server: Record<string, unknown>): string | undefined => {
  const at = `\`mcp.${name}\``;
  if (typeof server.command !== 'string' || !server.command)
    return `\`mcp.${name}.command\` is not a program to run. Give it as a string, like "npx".`;
  if (server.type !== undefined && server.type !== 'stdio')
    return `${at} has a \`command\` and \`type: ${JSON.stringify(server.type)}\`. Leave \`type\` out, or give "stdio".`;
  if (server.args !== undefined && !(Array.isArray(server.args) && server.args.every((a) => typeof a === 'string'))) {
    return `\`mcp.${name}.args\` is not a list of strings. Give one argument per entry, like ["-y", "@playwright/mcp"].`;
  }
  if (server.env !== undefined && !isStringMap(server.env))
    return `\`mcp.${name}.env\` is not a map of strings. Quote every value, like { "PORT": "3000" }.`;
  return undefined;
};

/**
 * Why `mcp.<name>.oauth` is not an OAuth client — or `undefined`. It holds what a sign-in needs and no secret: a task's `config` is
 * journalled with it, and the harness reads a secret from its own store alone, so one named here is refused by name.
 */
const oauthRefuses = (name: string, oauth: unknown): string | undefined => {
  if (!isMap(oauth)) return `\`mcp.${name}.oauth\` is not an OAuth client. Give it as { "clientId": "Iv23li...", "callbackPort": 8791 }.`;
  const odd = Object.keys(oauth).find((k) => !['clientId', 'callbackPort'].includes(k));
  if (odd) {
    return `\`mcp.${name}.oauth\` has \`${odd}\`, which it does not take: it holds \`clientId\` and \`callbackPort\` and no secret, which Claude Code reads from its own store alone. Take \`${odd}\` off it.`;
  }
  if (typeof oauth.clientId !== 'string' || !oauth.clientId)
    return `\`mcp.${name}.oauth\` names no client. Set \`clientId\` to the OAuth app's client id, as a string.`;
  const port = oauth.callbackPort;
  if (port !== undefined && !(typeof port === 'number' && Number.isSafeInteger(port) && port > 0 && port < 65536)) {
    return `\`mcp.${name}.oauth.callbackPort\` is not a port. Give the port the OAuth app's callback is registered on, a whole number from 1 to 65535, like 8791.`;
  }
  return undefined;
};

/** Why `mcp.<name>`, a server with a `url`, is not one a harness can reach — or `undefined`. */
const remoteRefuses = (name: string, server: Record<string, unknown>, at: string): string | undefined => {
  if (typeof server.url !== 'string' || !server.url)
    return `\`mcp.${name}.url\` is not an address. Give it as a string, like "https://example.com/mcp".`;
  if (server.type !== 'http' && server.type !== 'sse') {
    return `${at} has a \`url\` and ${server.type === undefined ? 'no `type`' : `\`type: ${JSON.stringify(server.type)}\``}. Give "type": "http", or "sse": Claude Code loads no server from a url without one.`;
  }
  if (server.headers !== undefined && !isStringMap(server.headers))
    return `\`mcp.${name}.headers\` is not a map of strings. Quote every value, like { "Authorization": "Bearer ..." }.`;
  return server.oauth === undefined ? undefined : oauthRefuses(name, server.oauth);
};

/**
 * Why a task's `mcp` is not a map of MCP servers, as a sentence that says what to write — or
 * `undefined`. Closed, like a brief's keys, because Claude Code does not refuse an entry it cannot
 * use: a `url` with no `type` loads no server and says nothing.
 */
export const mcpRefuses = (mcp: unknown): string | undefined => {
  const shape =
    'An entry is { "command": "npx", "args": [...], "env": {...} }, or { "type": "http", "url": "https://...", "headers": {...}, "oauth": { "clientId": "..." } }, as in a `.mcp.json`.';
  if (!isMap(mcp)) return `\`mcp: ${JSON.stringify(mcp)}\` is not a map of MCP servers by name. ${shape}`;
  for (const [name, server] of Object.entries(mcp)) {
    const at = `\`mcp.${name}\``;
    if (!/^[\w-]+$/.test(name)) return `\`mcp: ${JSON.stringify(name)}\` is not a server name. Use letters, digits, - and _.`;
    if (!isMap(server)) return `${at} is not a server. ${shape}`;
    const local = 'command' in server;
    if (local === 'url' in server) return `${at} has ${local ? 'both `command` and `url`' : 'neither `command` nor `url`'}. ${shape}`;
    if (local && 'oauth' in server) {
      return `${at} has a \`command\` and \`oauth\`, and a server the harness starts signs in to nothing. Take \`oauth\` off it, or give it a \`url\` instead of a \`command\`.`;
    }
    const stray = Object.keys(server).find(
      (k) => !(local ? ['type', 'command', 'args', 'env'] : ['type', 'url', 'headers', 'oauth']).includes(k),
    );
    if (stray) return `${at} has \`${stray}\`, which a server with a \`${local ? 'command' : 'url'}\` does not take. ${shape}`;
    const why = local ? localRefuses(name, server) : remoteRefuses(name, server, at);
    if (why) return why;
  }
  return undefined;
};

/**
 * One recorded server as a harness is handed it: the same facts, rebuilt in one fixed key order — `type`, `url`, `headers` sorted by
 * name, then `oauth` — and nothing else.
 *
 * **The one producer.** Claude Code files a sign-in under `name|sha256({type,url,headers})[:16]`, so the bytes of a server's wire
 * facts *are* its identity: a session handed a server spelled one way and a state read of it spelled another are two servers to
 * Claude Code, and the second finds no sign-in. Every road that hands a recorded server to a harness goes through here — the
 * session's `Options.mcpServers` and the state read both — so the config a page judged is the config the session runs. Sorting
 * the headers makes the record's own key order no part of that identity: a person who reorders two headers in a form keeps their
 * sign-in.
 *
 * `oauth` sits outside the hash, which is why it may be edited without asking for a new sign-in; a header may not (measured,
 * finding 6). Pure.
 */
export const mcpServerOf = (server: RemoteMcpServer): RemoteMcpServer => ({
  type: server.type,
  url: server.url,
  ...(server.headers === undefined
    ? {}
    : {
        headers: Object.fromEntries(Object.entries(server.headers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      }),
  ...(server.oauth === undefined
    ? {}
    : {
        oauth: {
          clientId: server.oauth.clientId,
          ...(server.oauth.callbackPort === undefined ? {} : { callbackPort: server.oauth.callbackPort }),
        },
      }),
});

/**
 * The checkout's own `.mcp.json`, when it has one, as an absolute path: the repository's servers, named so that
 * `--strict-mcp-config` keeps them. Absolute because Claude Code resolves the flag's path from inside the cwd, so a
 * relative `repo` would name `repo/repo`. One that is not JSON is refused here, before anything runs — named, it stops
 * the CLI before a session exists ("MCP config is not a valid JSON").
 */
export const checkoutMcpConfig = (cwd: string): string | undefined => {
  const file = path.resolve(cwd, '.mcp.json');
  let text: string;
  try {
    if (!fs.statSync(file).isFile()) return undefined;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    JSON.parse(text);
  } catch (e) {
    throw new Error(
      `${file} is not valid JSON (${(e as Error).message}), and Claude Code starts no session with it named. Fix the file, or remove it from the checkout.`,
      { cause: e },
    );
  }
  return file;
};

/**
 * The entries of the checkout's `.mcp.json` under `names`, as the file gives them, none changed: what a task's `checkoutMcp`
 * loads of it. No name reads no file. Refused, saying what to change: a checkout with no `.mcp.json`, one that is not JSON or
 * has no `mcpServers` map, and a name the file does not declare.
 */
export const pickedCheckoutMcp = (cwd: string, names: readonly string[]): Record<string, unknown> => {
  if (!names.length) return {};
  const file = path.resolve(cwd, '.mcp.json');
  const asked = `\`checkoutMcp: ${JSON.stringify(names)}\``;
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(
      `${asked} names servers of ${file}, which cannot be read (${(e as Error).message}). Declare them there, or take the names off the task.`,
      { cause: e },
    );
  }
  let servers: unknown;
  try {
    servers = (JSON.parse(text) as { mcpServers?: unknown } | null)?.mcpServers;
  } catch (e) {
    throw new Error(`${file} is not valid JSON (${(e as Error).message}), and ${asked} names servers of it. Fix the file.`, { cause: e });
  }
  if (!isMap(servers)) {
    throw new Error(
      `${file} has no \`mcpServers\` map, and ${asked} names servers of it. Declare them there, or take the names off the task.`,
    );
  }
  const absent = names.filter((name) => !Object.hasOwn(servers, name));
  if (absent.length) {
    const declared = Object.keys(servers);
    throw new Error(
      `${asked} names ${absent.map((n) => `\`${n}\``).join(', ')}, which ${file} does not declare: ${declared.length ? `its servers are ${declared.join(', ')}` : 'it declares no server'}. Declare the server there, or take the name off the task.`,
    );
  }
  return Object.fromEntries(names.map((name) => [name, servers[name]]));
};

/**
 * The servers a session's config file holds: the entries a task's `checkoutMcp` picks from its checkout's `.mcp.json`
 * (`pickedCheckoutMcp`), then the task's own `mcp`. `undefined` when the task gives neither.
 */
export const sessionMcp = (cwd: string, config: HarnessArgs | undefined): Record<string, unknown> | undefined =>
  config?.checkoutMcp ? { ...pickedCheckoutMcp(cwd, config.checkoutMcp), ...config.mcp } : config?.mcp;

/**
 * Every server a session is given, as a value: the checkout's own `.mcp.json` whole, as `claude -p` reads its second config — unless
 * the task picks entries of it by name (`checkoutMcp`), which `sessionMcp` has already taken — with the session's own laid over it, so
 * the task's server wins a name both give. `{}` where neither gives one.
 *
 * What `writeMcpConfig` writes to a file, for the caller that hands the map over as a value instead: an attached session's
 * `Options.mcpServers` (`sdk.d.ts:1991`). The values are a `.mcp.json`'s and a task's, read as they were written and never checked
 * here, so the type says `unknown` and the caller that hands them to the SDK is the one that names the SDK's shape.
 */
export const everyMcpServer = (cwd: string, config: HarnessArgs | undefined): Record<string, unknown> => {
  const checkout = config?.checkoutMcp ? undefined : checkoutMcpConfig(cwd);
  const theirs = checkout ? ((JSON.parse(fs.readFileSync(checkout, 'utf8')) as { mcpServers?: object }).mcpServers ?? {}) : {};
  return { ...theirs, ...sessionMcp(cwd, config) };
};

/**
 * A session's servers (`sessionMcp`), written to `file` as an MCP config (`{"mcpServers": …}`) — or `file` cleared when
 * there is none, so a re-spawn never finds servers it was not given. Owner-only: an `env` or
 * `headers` value may be a secret. For the paths that hand Claude Code a `--mcp-config` file of their own — a job,
 * `claude --bg`, `claude-detached`; an attached session hands the servers over as a value (`everyMcpServer`), which the SDK
 * spells onto the child's argv, so the owner-only file is no part of that path and this warning is not its cover. Returns
 * the file's absolute path, as `checkoutMcpConfig` does: a `file` given relative is relative to the engine, not to the
 * session's cwd.
 */
export const writeMcpConfig = (file: string, mcp: Record<string, unknown> | undefined): string | undefined => {
  if (!mcp || !Object.keys(mcp).length) {
    fs.rmSync(file, { force: true });
    return undefined;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mcpServers: mcp }), { mode: 0o600 });
  return path.resolve(file);
};

/**
 * Claude Code's MCP flags: the configs given, then `--strict-mcp-config` and `--no-chrome`, always.
 *
 * Strict loads those configs and nothing else — but not every server comes from a config. Claude in
 * Chrome, which drives the operator's own browser and whatever they are signed in to there, is
 * switched on by a user setting (`claudeInChromeDefaultEnabled`), and it connects even in a `--bg`
 * session spawned strict. So it is switched off by its own flag; a step that needs a
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
 * so a name it misses is left to Codex's own merge.
 */
export const codexMcpServerNames = (toml: string): Set<string> => {
  const names = new Set<string>();
  for (const raw of toml.split('\n')) {
    const [, quoted, bare] = /^\[mcp_servers\.(?:"((?:[^"\\]|\\.)*)"|([\w-]+))(?:\.[^\]]*)?\]$/.exec(raw.trim()) ?? [];
    const name = quoted ?? bare;
    if (name !== undefined) names.add(name);
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
 * `type` as `transport` and its headers as `http_headers`. One value with every name quoted, because a dotted `-c` key is split on
 * every dot, quotes or none (Codex answers "invalid transport in `mcp_servers."a`").
 *
 * The transport is written because a url without one is the half-formed entry `mcpRefuses` exists to prevent: Codex names the
 * transport itself ("invalid transport"), so a remote server that does not say which is one that loads and says nothing.
 *
 * **No oauth table.** A remote server's `oauth` is dropped here, and a recorded server reaches a Codex session with no sign-in. Nothing of
 * Codex has been measured — not whether it reads such a table, not what it would call the fields, not where it would file a
 * credential — so writing one would be a guess spelled as configuration. A Codex task is shown its servers rather than refused
 * them, and the state a page reads of one is unread, never a false `connected`; Codex's sign-in is measured before it is built.
 */
export const codexMcpServers = (mcp: Record<string, McpServer>): string =>
  tomlTable(
    Object.entries(mcp).map(
      ([name, s]) =>
        [
          name,
          'command' in s
            ? tomlTable([
                ['command', tomlString(s.command)],
                ['args', s.args && `[${s.args.map((a) => tomlString(a)).join(',')}]`],
                ['env', tomlStrings(s.env)],
              ])
            : tomlTable([
                ['url', tomlString(s.url)],
                ['transport', tomlString(s.type)],
                ['http_headers', tomlStrings(s.headers)],
              ]),
        ] as const,
    ),
  );
