/**
 * The tokens of the remote MCP servers signed in to by a code (`mcp-device.ts`), held by the runtime and handed to each session.
 *
 * A token is one file under the engine's root, `mcp-tokens/<name>-<hash>.json`, written at mode 0600 and replaced by rename, filed under
 * the server's name and the sha256 of its wire bytes (`type`, `url` and `headers`, as `mcpServerOf` spells them): the identity Claude
 * Code files its own sign-ins under, so one sign-in serves every factory that records the same server, and a changed header asks for
 * a new one. It holds what a refresh needs, the token endpoint and the client id included, so a refresh needs no new discovery.
 *
 * The token is resolved at each spawn, as a kubelet resolves a secret at a container's start (`tokened`): it rides the in-memory
 * `SpawnRequest.mcpTokens`, never the task's `config`, which is journalled, and the Claude Code driver lays it over the server's
 * `headers` (`withTokens`). A refresh token is used once, so one refresh runs at a time per key in this process. A refresh the provider
 * refuses removes the file, and the server reads `needs-auth`; one that could not reach the provider removes nothing.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option, Schema } from 'effect';
import { refreshOnce, tokenDueOf, type TokenGrant } from './mcp-device.ts';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer, RunnerOps } from './seam.ts';

/** How long before its expiry a held token counts as due, so a session is never handed one that lapses as it starts. */
export const REFRESH_MARGIN_MS = 5 * 60_000;

/** The folder, under the engine's root, the tokens are held in. */
export const TOKENS_FOLDER = 'mcp-tokens';

const HeldFile = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.Number),
  refreshExpiresAt: Schema.NullOr(Schema.Number),
  tokenEndpoint: Schema.String,
  clientId: Schema.String,
});
type HeldFile = typeof HeldFile.Type;
const readFile = Schema.decodeUnknownOption(Schema.fromJsonString(HeldFile));

/**
 * The file a server's token is held in, under `root`: its name and the sha256 of its wire bytes.
 * @param root The engine's store root.
 * @param name The name the server is recorded under.
 * @param server The recorded remote server.
 */
export const tokenFileOf = (root: string, name: string, server: RemoteMcpServer) => {
  const { type, url, headers } = mcpServerOf(server);
  const hash = createHash('sha256').update(JSON.stringify({ type, url, ...(headers === undefined ? {} : { headers }) })).digest('hex');
  return path.join(root, TOKENS_FOLDER, `${name}-${hash.slice(0, 16)}.json`);
};

/** `held` written to `file` at mode 0600, by a temporary file renamed over it, so a reader never sees half of one. */
const writeHeld = (file: string, held: HeldFile) => {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(held), { mode: 0o600 });
  fs.renameSync(temporary, file);
};

/** `seconds` from `now`, as milliseconds since the epoch, null where the provider gave none. */
const instantOf = (now: number, seconds: number | null) => (seconds === null ? null : now + Math.round(seconds * 1000));

/**
 * `grant` held for the server `name`: written to a temporary file at mode 0600 and renamed over the token's file.
 * @param root The engine's store root.
 * @param name The name the server is recorded under.
 * @param server The recorded remote server.
 * @param grant The tokens the provider granted.
 * @param from Where the token is refreshed from: the provider's token endpoint and the server's OAuth client id.
 * @param now The time, in milliseconds since the epoch.
 */
export const holdToken = (
  root: string,
  name: string,
  server: RemoteMcpServer,
  grant: TokenGrant,
  from: { readonly tokenEndpoint: string; readonly clientId: string },
  now: number = Date.now(),
) => {
  const file = tokenFileOf(root, name, server);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const held = {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: instantOf(now, grant.expiresInSeconds),
    refreshExpiresAt: instantOf(now, grant.refreshExpiresInSeconds),
    tokenEndpoint: from.tokenEndpoint,
    clientId: from.clientId,
  } satisfies HeldFile;
  writeHeld(file, held);
};

/**
 * The server `name`'s token removed, so it reads `needs-auth`; whether one was held.
 * @param root The engine's store root.
 * @param name The name the server is recorded under.
 * @param server The recorded remote server.
 */
export const dropToken = (root: string, name: string, server: RemoteMcpServer) => {
  const file = tokenFileOf(root, name, server);
  const held = fs.existsSync(file);
  fs.rmSync(file, { force: true });
  return held;
};

/** The refreshes under way in this process, by file: a refresh token is used once, so a second ask joins the first. */
const refreshing = new Map<string, Promise<string | undefined>>();

/** `held` refreshed, its file replaced by the new grant; gone where the provider refuses, kept where it could not be reached. */
const refreshed = async (file: string, held: HeldFile, now: number) => {
  if (held.refreshToken === null) return undefined;
  try {
    const grant = await refreshOnce(held.tokenEndpoint, held.clientId, held.refreshToken);
    if (grant === 'refused') {
      fs.rmSync(file, { force: true });
      return undefined;
    }
    const next = {
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken ?? held.refreshToken,
      expiresAt: instantOf(now, grant.expiresInSeconds),
      refreshExpiresAt: grant.refreshToken === null ? held.refreshExpiresAt : instantOf(now, grant.refreshExpiresInSeconds),
      tokenEndpoint: held.tokenEndpoint,
      clientId: held.clientId,
    } satisfies HeldFile;
    writeHeld(file, next);
    return next.accessToken;
  } catch {
    return undefined;
  }
};

/**
 * The access token to hand a session for the server `name`, or `undefined` where none is held or the held one is gone: one due
 * within `REFRESH_MARGIN_MS` is refreshed first (`tokenDueOf`), one refresh at a time per file, and a token whose refresh the
 * provider refuses, or whose refresh token lapsed, is removed.
 * @param root The engine's store root.
 * @param name The name the server is recorded under.
 * @param server The recorded remote server.
 * @param now The time, in milliseconds since the epoch.
 */
export const heldToken = async (root: string, name: string, server: RemoteMcpServer, now: number = Date.now()) => {
  const file = tokenFileOf(root, name, server);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const read = readFile(text);
  if (Option.isNone(read)) return undefined;
  const held = read.value;
  const due = tokenDueOf(
    { expiresAt: held.expiresAt === null ? null : Math.round(held.expiresAt), refreshToken: held.refreshToken !== null, refreshExpiresAt: held.refreshExpiresAt },
    Math.round(now),
    REFRESH_MARGIN_MS,
  );
  if (due === 'fresh') return held.accessToken;
  if (due === 'gone') {
    fs.rmSync(file, { force: true });
    return undefined;
  }
  const joined = refreshing.get(file);
  if (joined !== undefined) return joined;
  const started = refreshed(file, held, now).finally(() => refreshing.delete(file));
  refreshing.set(file, started);
  return started;
};

/** The recorded remote servers of a task's `mcp`, by name: those with a `url`. */
const remotesOf = (mcp: Record<string, unknown> | undefined) =>
  Object.entries(mcp ?? {}).flatMap(([name, server]) =>
    typeof server === 'object' && server !== null && 'url' in server && typeof server.url === 'string'
      ? [[name, server as RemoteMcpServer] as const]
      : [],
  );

/**
 * The held access token of each remote server of `mcp`, by name, from the store under `root` (`heldToken`); undefined where none is held.
 * @param root The engine's store root, where the tokens are held.
 * @param mcp A task's servers by name, local and remote; a server with no `url` is left out.
 */
export const tokensOf = async (root: string, mcp: Record<string, unknown> | undefined) => {
  const held = await Promise.all(remotesOf(mcp).map(async ([name, server]) => [name, await heldToken(root, name, server)] as const));
  const tokens = Object.fromEntries(held.flatMap(([name, token]) => (token === undefined ? [] : [[name, token] as const])));
  return Object.keys(tokens).length === 0 ? undefined : tokens;
};

/**
 * `ops`, with every spawn handed the held tokens of the task's remote servers (`SpawnRequest.mcpTokens`): what an engine runs each
 * harness through. A server with no token held is left out, and reads `needs-auth` in the session as before.
 * @param ops The runner of a harness.
 * @param root The engine's store root, where the tokens are held.
 */
export const tokened = (ops: RunnerOps, root: string) =>
  ({
    ...ops,
    spawn: (r) =>
      Effect.flatMap(
        Effect.promise(() => tokensOf(root, r.config?.mcp)),
        (mcpTokens) => ops.spawn(mcpTokens === undefined ? r : { ...r, mcpTokens }),
      ),
  }) satisfies RunnerOps;

/**
 * `servers`, as a harness is handed them, with each server named in `tokens` given `Authorization: Bearer <token>` beside its own
 * headers; a server with no token is handed as it is.
 * @param servers The session's servers by name.
 * @param tokens The held access token of each server that has one, by name; undefined for none.
 */
export const withTokens = <S extends Record<string, unknown>>(servers: S, tokens: Readonly<Record<string, string>> | undefined) => {
  if (tokens === undefined) return servers;
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => {
      const token = Object.hasOwn(tokens, name) ? tokens[name] : undefined;
      if (token === undefined || typeof server !== 'object' || server === null) return [name, server];
      const headers = 'headers' in server && typeof server.headers === 'object' && server.headers !== null ? server.headers : {};
      return [name, { ...server, headers: { ...headers, Authorization: `Bearer ${token}` } }];
    }),
  ) as S;
};
