/**
 * The tokens of the remote MCP servers signed in to by a code (`mcp-device.ts`), held by the runtime and handed to each session.
 *
 * A token is one file under the engine's root, `mcp-tokens/<name>-<hash>.json`, written at mode 0600 and replaced by rename, filed under
 * the server's name and the sha256 of its wire bytes (`type`, `url` and `headers`, as `mcpServerOf` spells them): the identity Claude
 * Code files its own sign-ins under, so one sign-in serves every record of the same server, and a changed header asks for
 * a new one. It holds what a refresh needs, the token endpoint and the client id included, so a refresh needs no new discovery.
 *
 * A session is never handed the token. It is handed the file's path and a `headersHelper`, `bin/ae-mcp-headers.ts`, which Claude Code
 * runs at each
 * connection and when a call is refused, and which prints the current token (`heldToken`) from the file: so a session that outlives its
 * token, or whose token another process's refresh ended, reads the new one. The path rides `SpawnRequest.mcpTokenFiles` (`tokened`), never
 * the task's `config`, which is journalled; the token rides no argv, run file or request file. A refresh runs under a lock beside the
 * file, since a refresh token is used once. A refresh the provider refuses removes the file, and the server reads `needs-auth`; one that
 * could not reach the provider removes nothing.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Option, Schema } from 'effect';
import { elapsedMs } from '../core/clock.ts';
import { instantNow } from '../core/engine/now.ts';
import { alive, processStart } from '../process/alive.ts';
import type { LockHolder, RefreshLockOf } from '../../contracts/mcp-token.contract.ts';
import { refreshOnce, tokenDueOf, type TokenGrant } from './mcp-device.ts';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer, RunnerOps, SpawnRequest } from './seam.ts';

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
  const hash = createHash('sha256')
    .update(JSON.stringify({ type, url, ...(headers === undefined ? {} : { headers }) }))
    .digest('hex');
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

/** What bounds the helper's run, each a parameter a test shortens: Claude Code gives up on a `headersHelper` at 10 s, all fit inside. */
export type HelperBounds = {
  /** The longest the whole run may take, in milliseconds. */
  readonly totalMs: number;
  /** The longest the refresh request may take. */
  readonly refreshMs: number;
  /** The longest to wait on another process's refresh. */
  readonly waitMs: number;
  /** The pause between two looks at that lock. */
  readonly pollMs: number;
};

/** The helper's bounds as shipped, under Claude Code's 10 seconds. */
const HELPER_BOUNDS: HelperBounds = { totalMs: 9000, refreshMs: 6000, waitMs: 7000, pollMs: 100 };

/** The refresh lock beside a token's file. */
const lockOf = (file: string) => `${file}.lock`;

/** What a lock file says of the process that took it. */
const LockFile = Schema.Struct({ pid: Schema.Number, start: Schema.optional(Schema.String), id: Schema.String });
const readLock = Schema.decodeUnknownOption(Schema.fromJsonString(LockFile));

/** The lock file's text, or `undefined` where there is none: a lock released as it was looked at is no lock to judge or break. */
const lockText = (lock: string) => {
  try {
    return fs.readFileSync(lock, 'utf8');
  } catch {
    return undefined;
  }
};

/** Whether the process that wrote `text` into a lock is still running (`live`), is not (`gone`), or the text says none (`unreadable`). */
const holderOf = (text: string) => {
  const read = readLock(text);
  if (Option.isNone(read)) return 'unreadable' satisfies LockHolder;
  const { pid, start } = read.value;
  return (alive(pid) && processStart(pid) === start ? 'live' : 'gone') satisfies LockHolder;
};

/**
 * Whether a process that found a refresh lock taken waits for it, breaks it or hands the token as read (`contracts/mcp-token.contract.ts`).
 * @param holder What the lock file says of its holder.
 * @param waitedMs How long this process has waited on the lock.
 * @param boundMs How long it may wait.
 */
export const refreshLockOf: RefreshLockOf = (holder, waitedMs, boundMs) => {
  if (holder === 'gone') return 'break';
  if (waitedMs < boundMs) return 'wait';
  return holder === 'live' ? 'stand' : 'break';
};

/**
 * The lock at `lock` taken whole by an exclusive create: the id that says it is ours; `taken` where another process holds it;
 * `unwritable` where it cannot be made at all (a folder that refuses the write), which no wait mends.
 */
const takeLock = (lock: string) => {
  const id = randomUUID();
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, start: processStart(process.pid), id }), { flag: 'wx', mode: 0o600 });
    return id;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EEXIST' ? ('taken' as const) : ('unwritable' as const);
  }
};

/** The lock at `lock` removed, but only while it still holds `text`, what its breaker judged: a lock another process took since stays. */
const breakLock = (lock: string, text: string) => {
  if (lockText(lock) === text) fs.rmSync(lock, { force: true });
};

/** The lock at `lock` removed, but only while it is still the one `id` took. */
const releaseLock = (lock: string, id: string) => {
  const read = readLock(fs.existsSync(lock) ? fs.readFileSync(lock, 'utf8') : '');
  if (Option.isSome(read) && read.value.id === id) fs.rmSync(lock, { force: true });
};

/** The file's held record, or `undefined` where there is none or it does not decode. */
const readHeld = (file: string) => {
  try {
    const read = readFile(fs.readFileSync(file, 'utf8'));
    return Option.isSome(read) ? read.value : undefined;
  } catch {
    return undefined;
  }
};

/** The token as read where it has not lapsed, else none: what a process that could not refresh hands. */
const asRead = (held: HeldFile, now: number) => (held.expiresAt === null || held.expiresAt > now ? held.accessToken : undefined);

/** `held` refreshed, its file replaced by the new grant; gone where the provider refuses, as read where it could not be reached. */
const refreshed = async (file: string, held: HeldFile, now: number, timeoutMs: number) => {
  if (held.refreshToken === null) return undefined;
  try {
    const grant = await refreshOnce(held.tokenEndpoint, held.clientId, held.refreshToken, timeoutMs);
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
    return asRead(held, now);
  }
};

/** Whether `held` is `fresh`, `due` a refresh or `gone`, at `now` (`tokenDueOf`). */
const dueOf = (held: HeldFile, now: number) =>
  tokenDueOf(
    {
      expiresAt: held.expiresAt === null ? null : Math.round(held.expiresAt),
      refreshToken: held.refreshToken !== null,
      refreshExpiresAt: held.refreshExpiresAt,
    },
    Math.round(now),
    REFRESH_MARGIN_MS,
  );

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What a process holding the lock `id` does with `held`: refreshes it where it is still the file's token, else says `again`. */
const refreshedHolding = async (
  file: string,
  lock: string,
  id: string,
  held: HeldFile,
  within: { readonly now: number; readonly left: number; readonly bounds: HelperBounds },
) => {
  try {
    const again = readHeld(file);
    if (again === undefined) return { token: undefined };
    if (again.accessToken !== held.accessToken) return 'again' as const;
    const timeoutMs = Math.min(within.bounds.refreshMs, within.left);
    return { token: timeoutMs < MIN_REFRESH_MS ? asRead(held, within.now) : await refreshed(file, held, within.now, timeoutMs) };
  } finally {
    releaseLock(lock, id);
  }
};

/** What a process that finds the lock taken does: hands the token as read once its wait is spent, else waits or breaks, then `again`. */
const waitedOn = async (lock: string, held: HeldFile, now: number, wait: { readonly waitedMs: number; readonly bounds: HelperBounds }) => {
  const text = lockText(lock);
  if (text === undefined) {
    await pause(wait.bounds.pollMs);
    return 'again' as const;
  }
  const move = refreshLockOf(holderOf(text), wait.waitedMs, wait.bounds.waitMs);
  if (move === 'stand') return { token: asRead(held, now) };
  if (move === 'break') breakLock(lock, text);
  else await pause(wait.bounds.pollMs);
  return 'again' as const;
};

/**
 * The access token to hand a session for the token held in `file`, or `undefined` where none is held or the held one is gone. One due
 * within `REFRESH_MARGIN_MS` is refreshed first (`tokenDueOf`), by one process at a time under the lock beside the file, because a provider
 * that rotates its refresh token takes each once and ends the old access token with it. A process that finds the lock taken waits, breaks
 * a lock its holder left, or hands the token as read once its wait is spent (`refreshLockOf`). A token whose refresh the provider refuses,
 * or whose refresh token lapsed, is removed; one whose refresh could not reach the provider is handed as read where it has not lapsed.
 * @param file The token's file (`tokenFileOf`).
 * @param now The time, in milliseconds since the epoch.
 * @param bounds What bounds the run, `HELPER_BOUNDS` where absent.
 */
export const heldToken = async (file: string, now: number = Date.now(), bounds: HelperBounds = HELPER_BOUNDS) => {
  const began = instantNow();
  const lock = lockOf(file);
  for (;;) {
    const held = readHeld(file);
    if (held === undefined) return undefined;
    const due = dueOf(held, now);
    if (due === 'fresh') return held.accessToken;
    if (due === 'gone') {
      fs.rmSync(file, { force: true });
      return undefined;
    }
    const spent = elapsedMs(began, instantNow());
    if (spent >= bounds.totalMs) return asRead(held, now);
    const id = takeLock(lock);
    if (id === 'unwritable') return asRead(held, now);
    const done =
      id === 'taken'
        ? await waitedOn(lock, held, now, { waitedMs: spent, bounds })
        : await refreshedHolding(file, lock, id, held, { now, left: bounds.totalMs - spent, bounds });
    if (done !== 'again') return done.token;
  }
};

/** The least a refresh request is given, in milliseconds: less is a refresh that cannot answer, and the token is handed as read. */
const MIN_REFRESH_MS = 1000;

/** The recorded remote servers of a task's `mcp`, by name: those with a `url`. */
const remotesOf = (mcp: Record<string, unknown> | undefined) =>
  Object.entries(mcp ?? {}).flatMap(([name, server]) =>
    typeof server === 'object' && server !== null && 'url' in server && typeof server.url === 'string'
      ? [[name, server as RemoteMcpServer] as const]
      : [],
  );

/**
 * The token file of each remote server of `mcp` that has a token held under `root`, by name; undefined for none.
 * @param root The engine's store root, where the tokens are held.
 * @param mcp A task's servers by name, local and remote; a server with no `url` is left out.
 */
export const tokenFilesOf = (root: string, mcp: Record<string, unknown> | undefined) => {
  const files = Object.fromEntries(
    remotesOf(mcp).flatMap(([name, server]) => {
      const file = tokenFileOf(root, name, server);
      return fs.existsSync(file) ? [[name, file] as const] : [];
    }),
  );
  return Object.keys(files).length === 0 ? undefined : files;
};

/**
 * `ops`, with every spawn handed the token files of the task's remote servers (`SpawnRequest.mcpTokenFiles`): what an engine runs each
 * harness through. A server with no token held is left out, and reads `needs-auth` in the session as before.
 * No token is read here: the session reads the current one through the helper each time it connects.
 * @param ops The runner of a harness.
 * @param root The engine's store root, where the tokens are held.
 */
export const tokened = <O extends Pick<RunnerOps, 'spawn'>>(ops: O, root: string) => ({
  ...ops,
  spawn: (r: SpawnRequest) => {
    const mcpTokenFiles = tokenFilesOf(root, r.config?.mcp);
    return ops.spawn(mcpTokenFiles === undefined ? r : { ...r, mcpTokenFiles });
  },
});

/** The helper Claude Code runs to read a server's header, `bin/ae-mcp-headers.ts`, found from this folder as `CLAUDE_JOB_BIN` is. */
export const MCP_HEADERS_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'ae-mcp-headers.ts');

/** `word` as one word of a shell command. */
const quoted = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * `servers`, as a harness is handed them, with each server named in `files` given a `headersHelper`: the command Claude Code runs at
 * each connection, and again when a call is refused, to read the server's `Authorization` header (`bin/ae-mcp-headers.ts`). The helper
 * is given the token's file, never the token. A server with no file is handed as it is.
 * @param servers The session's servers by name.
 * @param files The token file of each server that has one, by name; undefined for none.
 */
export const withTokenHelpers = <S extends Record<string, unknown>>(servers: S, files: Readonly<Record<string, string>> | undefined) => {
  if (files === undefined) return servers;
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => {
      const file = Object.hasOwn(files, name) ? files[name] : undefined;
      if (file === undefined || typeof server !== 'object' || server === null) return [name, server];
      return [name, { ...server, headersHelper: [process.execPath, MCP_HEADERS_BIN, file].map(quoted).join(' ') }];
    }),
  ) as S;
};
