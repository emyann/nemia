/**
 * The file store's feed, under its root: read from a cursor, rotated so a forgotten task's lines go, and locked so that a rotation
 * and every append take turns.
 *
 * A cursor is the byte offset just past a line in the feed as it was first written, and stays that for ever: a rotation drops lines
 * and remembers where they were, and renumbers none. So a cursor any read ever handed out still means the same place, new lines get
 * cursors past every one before them, and a reader parked anywhere gets the lines still kept after it, in order, each once. Three
 * files:
 *
 * - `feed.jsonl`, the head, where lines are appended. One no rotation wrote has no header, and its byte at offset p has cursor p. A
 *   rotated one begins with `{"feedBase":B}`, padded to `HEADER_BYTES`, and the byte p bytes after its header has cursor B + p.
 * - `feed.sealed.jsonl`, what the rotations kept of the lines before the cursor its header names (`{"sealedTo":S}`, padded the
 *   same), one record per line or run of lines, in order and contiguous from cursor 0: a line kept, `{"c":<its end>,"entry":…}`,
 *   and a run of lines forgotten, `{"c":<the run's end>,"lines":[<each line's bytes>]}`, so a reader counts the forgotten lines
 *   after its cursor exactly.
 * - `feed.lock`, who holds the feed: `{"pid","token","at"}`, linked into place whole (`withFeedLock`).
 *
 * A rotation renames the sealed file into place before the head, and a reader opens the head before the sealed file, so a reader
 * sees either both before a rotation, or a sealed file at least as new as its head, whose lines it skips in the head by cursor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { elapsedMs } from '../clock.ts';
import { instantNow } from './now.ts';
import { countLock, countRead, countWrite } from './tally.ts';

/** How long an append or a rotation waits for the feed's lock held by a live process before it fails, naming the holder. */
export const FEED_LOCK_WAIT_MS = 2_000;

/** The bytes of a header, `{"feedBase":B}` or `{"sealedTo":S}` padded with spaces, and its line break. */
export const HEADER_BYTES = 34;

/**
 * What a rotation forgot, and the feed's bytes, both files, before and after it; and, where the store counts them, the lines it
 * forgot of each task (`linesByTask`), a task with none left out.
 */
export type ForgottenFeed = {
  linesForgotten: number;
  bytesBefore: number;
  bytesAfter: number;
  linesByTask?: Readonly<Record<string, number>>;
};

/**
 * A read of the feed: the entries after the cursor asked with, still kept, where to resume, and how many lines after it were
 * forgotten, when any.
 */
export type FeedRead = { entries: unknown[]; cursor: number; forgotten?: number };

/** The three files of the feed under `root`. */
export const feedFiles = (root: string) => ({
  head: path.join(root, 'feed.jsonl'),
  sealed: path.join(root, 'feed.sealed.jsonl'),
  lock: path.join(root, 'feed.lock'),
});

/** A header line of `key`: the JSON object, padded to `HEADER_BYTES` with its line break. */
export const headerLine = (key: 'feedBase' | 'sealedTo', value: number): string => {
  const text = `{"${key}":${value}}`;
  return `${text.padEnd(HEADER_BYTES - 1)}\n`;
};

/** A line as its JSON, or as its text where it is none — a write cut short — for the decoder to refuse by place. */
const parsed = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return line;
  }
};

/** `length` bytes of `fd` from `from`, in one positioned read, counted. */
const bytesAt = (fd: number, from: number, length: number): Buffer => {
  const buf = Buffer.alloc(Math.max(0, length));
  const read = buf.length ? fs.readSync(fd, buf, 0, buf.length, from) : 0;
  countRead(read);
  return buf.subarray(0, read);
};

/** The value of the header `key` that `start`, a file's first bytes, begins with, or `undefined` when it begins with none. */
const headerIn = (start: Buffer, key: 'feedBase' | 'sealedTo'): number | undefined => {
  if (start.length < HEADER_BYTES) return undefined;
  const text = start.subarray(0, HEADER_BYTES).toString('utf8');
  if (!text.startsWith(`{"${key}":`) || !text.endsWith('\n')) return undefined;
  const value: unknown = (parsed(text.trim()) as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

/** A file's identity: its device, inode and birth, which a file written in its place by a rename never shares. */
type Identity = { dev: number; ino: number; born: number };

/** The header each feed file was last read with, by path and identity: a header is written before its file is in place, and never again. */
const headers = new Map<string, Identity & { base: number | undefined }>();

/** An open file's identity, size and header, read through one descriptor, and its bytes from 0 where they were read whole. */
type Opened = Identity & { fd: number; size: number; at: number; base: number; whole?: Buffer };

/** The header of `file`, open on `fd`, of the identity `id` and `size` bytes: known, read whole when `whole`, or its first bytes read. */
const headerOf = (file: string, fd: number, id: Identity & { size: number }, key: 'feedBase' | 'sealedTo', whole: boolean) => {
  const known = headers.get(file);
  if (known && known.dev === id.dev && known.ino === id.ino && known.born === id.born) return { base: known.base };
  if (id.size < HEADER_BYTES) return { base: undefined };
  const read = bytesAt(fd, 0, whole ? id.size : HEADER_BYTES);
  const base = headerIn(read, key);
  if (id.born > 0) headers.set(file, { dev: id.dev, ino: id.ino, born: id.born, base });
  return whole ? { base, whole: read } : { base };
};

/**
 * `file` opened for reading, with its header `key` (`at`, where its lines begin; `base`, their first cursor); none, when absent.
 * A header already read off the same file costs no byte; `whole` reads the file from 0 in the read that learns its header.
 */
const openFeedFile = (file: string, key: 'feedBase' | 'sealedTo', whole = false): Opened | undefined => {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  const { dev, ino, size, birthtimeMs: born } = fs.fstatSync(fd);
  const id = { dev, ino, born, size };
  const { base, whole: bytes } = headerOf(file, fd, id, key, whole);
  const at = base === undefined ? 0 : HEADER_BYTES;
  return { fd, ...id, at, base: base ?? 0, ...(bytes ? { whole: bytes } : {}) };
};

/** `length` bytes of the open file `o` from `from`: off what was read whole, or read now. */
const bytesOf = (o: Opened, from: number, length: number): Buffer =>
  o.whole ? o.whole.subarray(from, from + Math.max(0, length)) : bytesAt(o.fd, from, length);

/** A sealed record: a line kept (`entry`), or a run of lines forgotten (`lines`, each one's bytes), ending at cursor `c`. */
type Sealed = { c: number; entry?: unknown; lines?: number[] };

/** The records of an open sealed file, in order. */
const sealedRecords = (sealed: Opened): Sealed[] =>
  bytesOf(sealed, sealed.at, sealed.size - sealed.at)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => parsed(line) as Sealed);

/** How many of the forgotten lines of `run`, which ends at `c`, end after `after`. */
const forgottenAfter = (run: readonly number[], c: number, after: number): number => {
  let end = c;
  let count = 0;
  for (let i = run.length - 1; end > after; i--) {
    const length = run[i];
    if (length === undefined) break;
    count++;
    end -= length;
  }
  return count;
};

/** The complete lines of the head from cursor `from`, each with its end cursor, and where the last complete one ends. */
const headLines = (head: Opened, from: number): { lines: { text: string; c: number }[]; end: number } => {
  const buf = bytesOf(head, head.at + from - head.base, head.size - head.at - (from - head.base));
  const last = buf.lastIndexOf(0x0a) + 1;
  const lines: { text: string; c: number }[] = [];
  let c = from;
  let start = 0;
  for (let i = buf.indexOf(0x0a); i >= 0 && i < last; i = buf.indexOf(0x0a, start)) {
    c += i + 1 - start;
    const text = buf.subarray(start, i).toString('utf8');
    if (text) lines.push({ text, c });
    start = i + 1;
  }
  return { lines, end: from + last };
};

/** A read's answer, `forgotten` said only when a line was. */
const answer = (entries: unknown[], cursor: number, forgotten: number): FeedRead => ({
  entries,
  cursor,
  ...(forgotten ? { forgotten } : {}),
});

/** No line read, at `cursor`. */
const nothingAt = (cursor: number) => ({ entries: [] as unknown[], cursor, forgotten: 0 });

/** The sealed file's records after `after`: the lines kept, the cursor past the last record, and the lines forgotten. */
const readSealed = (sealed: Opened, after: number) => {
  const entries: unknown[] = [];
  let cursor = after;
  let forgotten = 0;
  for (const record of sealedRecords(sealed)) {
    if (record.c <= after) continue;
    if (record.lines) forgotten += forgottenAfter(record.lines, record.c, after);
    else entries.push(record.entry);
    cursor = record.c;
  }
  return { entries, cursor, forgotten };
};

/**
 * The feed under `root` after `after`: the sealed lines kept past it, then the head's complete lines past it, in order; the cursor
 * past the last read, or the end of the feed for a cursor past it (a store wiped since), never before what the sealed file holds,
 * though the head was opened before a rotation; and how many lines after `after` were forgotten. No feed at all is nothing, at the
 * cursor given.
 */
export const readFeed = (root: string, after: number): FeedRead => {
  const files = feedFiles(root);
  const head = openFeedFile(files.head, 'feedBase', after === 0);
  const sealed = openFeedFile(files.sealed, 'sealedTo', after === 0);
  try {
    if (!head && !sealed) return answer([], after, 0);
    const { entries, cursor, forgotten } = sealed && after < sealed.base ? readSealed(sealed, after) : nothingAt(after);
    const base = head?.base ?? sealed?.base ?? 0;
    const end = Math.max(head ? base + head.size - head.at : base, sealed?.base ?? 0);
    const from = Math.max(cursor, base);
    if (!head || from >= end) return answer(entries, Math.min(cursor, end), forgotten);
    const read = headLines(head, from);
    for (const line of read.lines) entries.push(parsed(line.text));
    return answer(entries, read.end > from ? read.end : cursor, forgotten);
  } finally {
    if (head) fs.closeSync(head.fd);
    if (sealed) fs.closeSync(sealed.fd);
  }
};

/** Who holds the feed's lock: its process, the token it took the lock with, and when. */
type Holder = { pid: number; token: string; at: string };

/** The holder `file` names, or `undefined` when there is none or it is not one this runtime wrote. */
const holderIn = (file: string): Holder | undefined => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const holder = parsed(text) as Partial<Holder> | undefined;
  return typeof holder === 'object' && holder !== null && Number.isSafeInteger(holder.pid) && typeof holder.token === 'string'
    ? (holder as Holder)
    : undefined;
};

/** Whether process `pid` lives: `kill(pid, 0)` answers anything but ESRCH. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/** Wait `ms` without leaving the call: the store's writes are synchronous. */
const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Take away the lock `lock` that `dead`, a holder whose process is gone, holds: moved aside by a rename, then read, and removed when
 * it is still the dead one's; a lock a live process took meanwhile is linked back. One taken by a third process in that moment
 * cannot be put back, and that is said, never passed over.
 */
const breakDead = (lock: string, dead: Holder): void => {
  const aside = `${lock}.${randomUUID()}.broken`;
  try {
    fs.renameSync(lock, aside);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  try {
    const moved = holderIn(aside);
    if (moved?.token === dead.token) return;
    try {
      fs.linkSync(aside, lock);
    } catch {
      throw new Error(
        `the feed's lock, ${lock}, was taken by process ${moved?.pid ?? '(unknown)'} while the lock of process ${dead.pid}, which is gone, was being broken, and taken again by another before it could be put back: two writers may hold it. Stop every \`ae\` and engine on this store, remove ${lock}, and start them again.`,
      );
    }
  } finally {
    fs.rmSync(aside, { force: true });
  }
};

/** The words of a lock held past `waitMs` by a live process, saying what to do: the bound it names is the one it waited. */
const heldWords = (lock: string, holder: Holder | undefined, waitMs: number): string =>
  holder
    ? `the feed's lock, ${lock}, is held by process ${holder.pid} since ${holder.at}, alive, past ${waitMs} ms: if it is stopped, continue it or end it, then write again. Nothing was written.`
    : `the feed's lock, ${lock}, is not one this runtime wrote, and nobody has let it go in ${waitMs} ms: if no \`ae\` and no engine runs on this store, remove it, then write again. Nothing was written.`;

/**
 * Take the lock `lock`: linked from a file of this take's own, so it is whole when it is there. Answers the token it was taken
 * with. A live holder is waited for up to `waitMs`, then named in the refusal.
 */
const takeLock = (lock: string, waitMs: number): string => {
  const token = randomUUID();
  const mine = `${lock}.${token}`;
  fs.writeFileSync(mine, JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }));
  const t0 = instantNow();
  const w0 = performance.now();
  try {
    for (;;) {
      try {
        fs.linkSync(mine, lock);
        countLock(performance.now() - w0);
        return token;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      const holder = holderIn(lock);
      if (holder && !alive(holder.pid)) {
        breakDead(lock, holder);
        continue;
      }
      if (elapsedMs(t0, instantNow()) >= waitMs) throw new Error(heldWords(lock, holder, waitMs));
      pause(2);
    }
  } finally {
    fs.rmSync(mine, { force: true });
  }
};

/** Let go of the lock `lock` taken with `token`, only while it is still that take's. */
const releaseLock = (lock: string, token: string): void => {
  if (holderIn(lock)?.token === token) fs.rmSync(lock, { force: true });
};

/**
 * `fn`, run holding the feed's lock under `root`, which every append and every rotation takes: one at a time, across processes.
 * Waits for a live holder up to `waitMs`, by default the shipped `FEED_LOCK_WAIT_MS`, then throws naming the bound it waited; a
 * holder whose process is gone is broken. Not re-entrant: `fn` takes it again only to wait out the bound.
 *
 * The bound is a parameter so that a test of what a held lock does can shorten it rather than wait the shipped one out, and still
 * measure its floor at the bound it gave (`test/feed-rotation.test.ts`). Its default is the shipped constant, so no caller changes.
 */
export const withFeedLock = <A>(root: string, fn: () => A, waitMs = FEED_LOCK_WAIT_MS): A => {
  fs.mkdirSync(root, { recursive: true });
  const { lock } = feedFiles(root);
  const token = takeLock(lock, waitMs);
  try {
    return fn();
  } finally {
    releaseLock(lock, token);
  }
};

/** The id of the task a feed line names, or `undefined`. */
const taskIdOf = (entry: unknown): unknown => (typeof entry === 'object' && entry !== null && 'taskId' in entry ? entry.taskId : undefined);

/**
 * How many of the feed's lines under `root` name each task of `taskIds`, the feed read once (`readFeed`), each line parsed for its
 * `taskId` alone and no body resolved, so a line no runtime wrote is counted as a rotation forgets it; a line a rotation forgot is
 * not counted, and a task with none counts 0.
 */
export const feedLinesOf = (root: string, taskIds: readonly string[]): Record<string, number> => {
  const counts = new Map(taskIds.map((id) => [id, 0]));
  for (const entry of readFeed(root, 0).entries) {
    const id = taskIdOf(entry);
    const n = typeof id === 'string' ? counts.get(id) : undefined;
    if (n !== undefined) counts.set(id as string, n + 1);
  }
  return Object.fromEntries(counts);
};

/**
 * Where a sealed file being written stands: its descriptor, the run of lines forgotten not yet written, the last cursor, the count,
 * and the count by task (`byTask`).
 */
type Writing = { fd: number; at: number; prev: number; run: number[]; forgotten: number; byTask: Map<string, number> };

/** Write `text` at the end of what `w` has written. */
const put = (w: Writing, text: string): void => {
  const buf = Buffer.from(text);
  fs.writeSync(w.fd, buf, 0, buf.length, w.at);
  w.at += buf.length;
};

/** Write the run of forgotten lines `w` holds, if any. */
const flushRun = (w: Writing): void => {
  if (!w.run.length) return;
  put(w, `${JSON.stringify({ c: w.prev, lines: w.run })}\n`);
  w.run = [];
};

/** One line, ending at cursor `c`, written kept or added to the run forgotten, as `forget` says. */
const sealLine = (w: Writing, entry: unknown, c: number, forget: ReadonlySet<string>): void => {
  const id = taskIdOf(entry);
  if (typeof id === 'string' && forget.has(id)) {
    w.run.push(c - w.prev);
    w.forgotten++;
    w.byTask.set(id, (w.byTask.get(id) ?? 0) + 1);
  } else {
    flushRun(w);
    put(w, `${JSON.stringify({ c, entry })}\n`);
  }
  w.prev = c;
};

/** A run of lines a former rotation forgot, carried on, merged with the run before it. */
const sealRun = (w: Writing, run: readonly number[], c: number): void => {
  w.run.push(...run);
  w.prev = c;
};

/** The head's complete lines from cursor `from`, sealed into `w`; answers the cursor past the last. */
const sealHead = (w: Writing, head: Opened, from: number, forget: ReadonlySet<string>): number => {
  const read = headLines(head, from);
  for (const line of read.lines) sealLine(w, parsed(line.text), line.c, forget);
  return read.end;
};

/** The feed's files as one rotation found them: the head and the sealed file, open, with their identities. */
type Seen = { head: Opened | undefined; sealed: Opened | undefined };

/** Close what `seen` holds open. */
const closeSeen = (seen: Seen) => {
  if (seen.head) fs.closeSync(seen.head.fd);
  if (seen.sealed) fs.closeSync(seen.sealed.fd);
};

/** Whether `a` and `b` are the same files, with the same headers: no rotation came between. */
const sameFiles = (a: Seen, b: Seen) =>
  a.head?.ino === b.head?.ino && a.head?.base === b.head?.base && a.sealed?.ino === b.sealed?.ino && a.sealed?.base === b.sealed?.base;

/** The feed's files under `root`, open as they are now. */
const seeFeed = (root: string, whole = false): Seen => {
  const files = feedFiles(root);
  return { head: openFeedFile(files.head, 'feedBase', whole), sealed: openFeedFile(files.sealed, 'sealedTo', whole) };
};

/** The bytes of both files, as `seen` found them. */
const sizeOf = (seen: Seen) => (seen.head?.size ?? 0) + (seen.sealed?.size ?? 0);

/** A sealed file being written beside the sealed one: where it stands, its path, and the cursor it reached. */
type Built = { w: Writing; tmp: string; reached: number };

/** What `write` writes, to a new file beside `file`, flushed, and renamed over `file`. */
const replaceWith = (file: string, write: (fd: number) => void): void => {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      write(fd);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
    countWrite();
  } finally {
    fs.rmSync(tmp, { force: true });
  }
};

/**
 * The sealed file up to the end of the head's complete lines, written beside it with every line of a task in `forget` dropped
 * into a run: the records already sealed carried on, then the head's lines. Answers where it stands, and the cursor it reached.
 */
const sealUpTo = (root: string, seen: Seen, forget: ReadonlySet<string>): Built => {
  const tmp = `${feedFiles(root).sealed}.${randomUUID()}.tmp`;
  const w: Writing = { fd: fs.openSync(tmp, 'w'), at: 0, prev: 0, run: [], forgotten: 0, byTask: new Map() };
  put(w, headerLine('sealedTo', 0));
  if (seen.sealed) {
    for (const record of sealedRecords(seen.sealed)) {
      if (record.lines) sealRun(w, record.lines, record.c);
      else sealLine(w, record.entry, record.c, forget);
    }
  }
  const sealedTo = seen.sealed?.base ?? 0;
  const reached = seen.head ? sealHead(w, seen.head, Math.max(sealedTo, seen.head.base), forget) : sealedTo;
  return { w, tmp, reached };
};

/** Whether the head begins before the sealed file ends: a rotation stopped between its two renames, the head's renaming left to do. */
const staleHead = (now: Seen): boolean => now.head !== undefined && now.sealed !== undefined && now.head.base < now.sealed.base;

/**
 * Under the lock, with `now` the files as the lock found them: the head's lines written since `sealUpTo` read it sealed too, then,
 * when a line was forgotten or the head is stale (`staleHead`), the sealed file renamed into place with its cursor, and a new head
 * that begins there (with any bytes of a write cut short after its last line, so no cursor goes back). Answers how many lines
 * were forgotten; the file written beside the sealed one is gone either way.
 */
const sealTail = (root: string, now: Seen, built: Built, forget: ReadonlySet<string>): number => {
  const { w } = built;
  const head = now.head;
  let renamed = false;
  try {
    const end = head ? sealHead(w, head, built.reached, forget) : built.reached;
    if (!w.forgotten && !staleHead(now)) return 0;
    flushRun(w);
    const header = Buffer.from(headerLine('sealedTo', end));
    fs.writeSync(w.fd, header, 0, header.length, 0);
    fs.fsyncSync(w.fd);
    fs.closeSync(w.fd);
    w.fd = -1;
    const files = feedFiles(root);
    fs.renameSync(built.tmp, files.sealed);
    renamed = true;
    countWrite();
    const rest = head ? bytesOf(head, head.at + end - head.base, head.size - head.at - (end - head.base)) : Buffer.alloc(0);
    replaceWith(files.head, (fd) => {
      fs.writeSync(fd, headerLine('feedBase', end));
      if (rest.length) fs.writeSync(fd, rest);
    });
    return w.forgotten;
  } finally {
    if (w.fd >= 0) fs.closeSync(w.fd);
    if (!renamed) fs.rmSync(built.tmp, { force: true });
  }
};

/**
 * One attempt at a rotation (`rotateFeed`): the sealed file built outside the lock, then, under it, finished and renamed into place
 * unless another rotation changed the files meanwhile, which answers `undefined`; and `then`, under the same lock.
 */
const rotateOnce = (root: string, forget: ReadonlySet<string>, then: () => void, waitMs: number): ForgottenFeed | undefined => {
  const seen = seeFeed(root, true);
  let built: Built | undefined;
  try {
    built = sealUpTo(root, seen, forget);
    const b = built;
    return withFeedLock(
      root,
      () => {
        const now = seeFeed(root);
        try {
          if (!sameFiles(seen, now)) return undefined;
          const bytesBefore = sizeOf(now);
          built = undefined;
          const linesForgotten = sealTail(root, now, b, forget);
          then();
          const after = seeFeed(root);
          const bytesAfter = sizeOf(after);
          closeSeen(after);
          return { linesForgotten, bytesBefore, bytesAfter, linesByTask: Object.fromEntries(b.w.byTask) };
        } finally {
          closeSeen(now);
        }
      },
      waitMs,
    );
  } finally {
    if (built) {
      if (built.w.fd >= 0) fs.closeSync(built.w.fd);
      fs.rmSync(built.tmp, { force: true });
    }
    closeSeen(seen);
  }
};

/**
 * Rotate the feed under `root` so that no line of a task in `forget` is left, every cursor keeping its place, then run `then`
 * under the same lock. The history is read and the sealed file written outside the lock; under it, only the lines appended
 * since, and two renames: a rotation that met another's work done meanwhile starts again, ten times at most. Nothing is renamed
 * when no line was forgotten.
 */
export const rotateFeed = (root: string, forget: ReadonlySet<string>, then: () => void, waitMs = FEED_LOCK_WAIT_MS): ForgottenFeed => {
  for (let round = 0; round < 10; round++) {
    const done = rotateOnce(root, forget, then, waitMs);
    if (done) return done;
  }
  throw new Error(`the feed under ${root} was rotated by another ten times while this one ran: nothing was forgotten; forget again.`);
};
