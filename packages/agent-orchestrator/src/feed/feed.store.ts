/**
 * The feed (`feed.ts`) over the store's own file: `$WF_ROOT/feed.jsonl`, and this process's one fold of it, which the tick writes through.
 *
 * Beneath the controllers, beside `store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports it. `feed.ts` is the pure half — the
 * line, the fold, what a pass owes — and this is the file: read, appended to and followed, each helper taking the file as an argument, and
 * the exports over the store's own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import { countRead, within } from '../meter/tally.store.ts';
import { feedChanges, foldFeed, freshMemo, type FeedLine, type FeedMemo } from './feed.ts';
import type { FeedWords } from '../run.ts';
import { Invalid } from '../refusal/refusal.ts';

/** The workflow layer's feed (`feed.ts`): beside `runs/`, one for the store, written by the tick alone. */
export const feedFile = (): string => path.join(HOME, 'feed.jsonl');

/** This process's fold of the feed, as far as it has read it: a restarted daemon starts from none, and reads the feed once. */
const feedMemo: FeedMemo = freshMemo();

/**
 * Write what the pass judged of every run in the store, where it is not what the feed said of it last (`recordFeedFile`), and the lines
 * written. `now` is every run the pass judged: one the feed still names that is not in it is gone, and gets its `removed` — but for one of
 * `unjudged`, which the pass read and could not judge (`feedChanges`). `memo` is for a test, which starts one afresh to be a restarted daemon.
 */
export const recordFeed = (
  now: ReadonlyMap<string, FeedWords>,
  {
    at = new Date().toISOString(),
    memo = feedMemo,
    unjudged = new Set<string>(),
  }: { at?: string; memo?: FeedMemo; unjudged?: ReadonlySet<string> } = {},
): FeedLine[] => within('act', () => recordFeedFile(feedFile(), now, at, memo, unjudged));

/** A fold of nothing, for a test that plays a restarted daemon. */
export const freshFeedMemo = freshMemo;

/** The feed's lines after `after`, and the cursor to read on from (`readFeedFile`): a cursor inside a line, or past the end, is refused by name. */
export const readFeed = (after = 0): { lines: FeedLine[]; cursor: number } => readFeedFile(feedFile(), after);

/** Why `after` cannot be read from — or undefined when it can (`cursorRefusalAt`). */
export const feedCursorRefusal = (after: number): string | undefined => cursorRefusalAt(feedFile(), after);

/** Follow the feed from `from` until `stop()` (`watchFeedFile`), each line with the cursor just after it: refused before anything is watched when the cursor cannot be read from. */
export const watchFeed = (opts: Parameters<typeof watchFeedFile>[1]): { stop(): void } => watchFeedFile(feedFile(), opts);

const statOf = (file: string): fs.Stats | undefined => fs.statSync(file, { throwIfNoEntry: false });

/** The byte at `at` in the file, read alone. */
function byteAt(file: string, at: number): number {
  const fd = fs.openSync(file, 'r');
  try {
    const one = Buffer.alloc(1);
    countRead(fs.readSync(fd, one, 0, 1, at));
    return one[0];
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Why a cursor cannot be read from, in words that say what to do — or undefined when it can: 0, or the byte just after a line, at most the
 * feed's size. A cursor inside a line would have the reader take the rest of that line for one; one past the end was handed out by a feed
 * that has been truncated or replaced, and nothing after it means what the reader thinks.
 */
function cursorRefusalAt(file: string, after: number): string | undefined {
  if (!Number.isSafeInteger(after) || after < 0)
    return `a feed cursor is a whole number of bytes — 0, or one a \`cursor:\` line printed — not ${after}`;
  const size = statOf(file)?.size ?? 0;
  if (after > size) {
    return `cursor ${after} is past the end of the feed (${size} bytes, ${file}): the feed it came from was truncated or replaced since — read it again from the start: wf feed 0`;
  }
  if (after > 0 && byteAt(file, after - 1) !== 0x0a) {
    return `cursor ${after} falls inside a line of the feed, not after one: a cursor is 0 or the number a \`cursor:\` line printed — wf feed 0 reads from the start`;
  }
  return undefined;
}

/** A line of the feed as `recordFeed` writes one (`FeedLine`); a key it does not name is kept, as a newer `wf` may write one. */
const isFeedLine = Schema.is(
  Schema.Struct({
    at: Schema.String,
    run: Schema.String,
    step: Schema.optionalKey(Schema.String),
    word: Schema.String,
    note: Schema.optionalKey(Schema.String),
  }),
);

/** A line of the feed as it was written, or nothing for one that is not: a line a writer died in the middle of, ended by the next one. */
function parseLine(text: string): FeedLine[] {
  if (!text) return [];
  try {
    const line: unknown = JSON.parse(text);
    return isFeedLine(line) ? [line] : [];
  } catch {
    return [];
  }
}

/**
 * Every complete line from `after` to `size`, each with the byte just after its newline (`ends`, one for each of `lines`), and the byte
 * after the last complete line: never past a line with no newline yet. The ends are counted in bytes, on the buffer, not in characters
 * of the text — a note with a dash in it is three bytes of one character. A line nobody can read keeps no end, and moves the cursor all
 * the same.
 */
function linesFrom(file: string, after: number, size: number): { lines: FeedLine[]; ends: number[]; cursor: number } {
  if (after >= size) return { lines: [], ends: [], cursor: after };
  const buf = Buffer.alloc(size - after);
  const fd = fs.openSync(file, 'r');
  try {
    countRead(fs.readSync(fd, buf, 0, buf.length, after));
  } finally {
    fs.closeSync(fd);
  }
  const lines: FeedLine[] = [];
  const ends: number[] = [];
  let start = 0;
  for (let nl = buf.indexOf(0x0a); nl >= 0; start = nl + 1, nl = buf.indexOf(0x0a, start)) {
    for (const line of parseLine(buf.subarray(start, nl).toString('utf8'))) {
      lines.push(line);
      ends.push(after + nl + 1);
    }
  }
  return { lines, ends, cursor: after + start };
}

const refused = (message: string): Invalid => new Invalid({ message });

/**
 * The lines written since `after`, and the cursor to read on from: the byte after the last complete line. A feed not written yet reads as
 * none, at 0. A cursor that is not the start of a line, or is past the end, is refused by name (exit 2).
 */
function readFeedFile(file: string, after = 0): { lines: FeedLine[]; cursor: number } {
  const { lines, cursor } = readEnds(file, after);
  return { lines, cursor };
}

/** `readFeedFile`, with the byte after each line (`linesFrom`'s `ends`): what a watch hands on with each line. */
function readEnds(file: string, after: number): { lines: FeedLine[]; ends: number[]; cursor: number } {
  const refusal = cursorRefusalAt(file, after);
  if (refusal) throw refused(refusal);
  return linesFrom(file, after, statOf(file)?.size ?? 0);
}

/**
 * The pass's words written where they changed (`feedChanges`), in one append, and the lines written.
 *
 * `memo` is the fold this process has read so far. It is read on to the end of the feed first — the lines this process wrote last pass,
 * and any another wrote — and read again from the start when it does not fit the file: another file, or a cursor the file has no line
 * boundary at. It is not moved past what this call writes: the next call reads those lines back, so what it compares against is
 * always what the feed says.
 *
 * A line with no newline at the end of the feed is one a writer died in: the append starts with a newline, so that line ends as the one
 * nobody can read (`parseLine`) and the lines after it are whole.
 */
function recordFeedFile(
  file: string,
  now: ReadonlyMap<string, FeedWords>,
  at: string,
  memo: FeedMemo,
  unjudged: ReadonlySet<string>,
): FeedLine[] {
  const stat = statOf(file);
  const size = stat?.size ?? 0;
  if ((memo.ino !== undefined && stat?.ino !== memo.ino) || cursorRefusalAt(file, memo.cursor) !== undefined)
    Object.assign(memo, freshMemo());
  const read = linesFrom(file, memo.cursor, size);
  foldFeed(memo.fold, read.lines);
  memo.cursor = read.cursor;
  memo.ino = stat?.ino;
  const lines = feedChanges(memo.fold, now, at, unjudged);
  if (!lines.length) return [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${read.cursor < size ? '\n' : ''}${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  if (memo.ino === undefined) memo.ino = statOf(file)?.ino;
  return lines;
}

/**
 * Whether the feed was cut under a reader at `cursor`, in words — or undefined, when the cursor is still one of this file's: it was deleted, a
 * file was put in its place (`ino`, the inode the cursor was read in), or it is shorter than the cursor or has no line boundary there
 * (`cursorRefusalAt`): truncated, and perhaps written again. A feed truncated and written past the cursor again, a line ending just there,
 * is not seen: nothing on disk tells it from the same feed grown.
 */
function feedCut(file: string, cursor: number, ino: number | undefined, stat: fs.Stats | undefined): string | undefined {
  if (cursor === 0) return undefined;
  const from = `reading the feed there is now from its start — a line said before may be said again`;
  if (!stat) return `the feed was deleted under this watch at cursor ${cursor} (${file}): ${from}`;
  if (ino !== undefined && stat.ino !== ino) return `the feed was replaced under this watch at cursor ${cursor} (${file}): ${from}`;
  if (cursorRefusalAt(file, cursor) !== undefined)
    return `the feed was truncated under this watch at cursor ${cursor}, and is ${stat.size} bytes now (${file}): ${from}`;
  return undefined;
}

/**
 * Follow the feed from `from`: every line already there, then each as it is written, in order and at least once, until `stop()`.
 *
 * As the engine's `watch` follows its own: pushed by `fs.watch` on the directory the feed is in, and backed by a timer, so an event the OS
 * drops costs latency and not a line. One read at a time: a push and a tick landing together must not deliver a line twice — and a push
 * that lands during a read has the read go round once more rather than be lost to it.
 *
 * Each line comes with its cursor: the byte just after it, where a reader that has taken that line and no other resumes — so a follower
 * that hands each line on (the api's stream, an event's id) can be picked up after the last line it handed on, not after the last read.
 *
 * A cursor that cannot be read from is refused before anything is watched (`cursorRefusalAt`, exit 2); an error after that — a file that
 * could not be opened this beat — goes to `onError`, and the watch goes on. `onRead` hears of each read that works, before the lines it
 * found are handed on, and whether it found any: so a follower that said a read failed can say it works again on the next beat that reads,
 * not only when the next line is written.
 *
 * **A feed cut under the watch** — deleted, truncated, or replaced by another file — leaves the cursor pointing into a file that is not the
 * one it was handed out by (`feedCut`). Given `onCut`, the watch says so there once, in words, and reads on from the start of the feed there
 * is now. From the start and not from its end: a cut feed is one the tick has no fold of, so its next pass writes every run's words again
 * (`recordFeedFile`) — the lines a watcher that lost its place needs, and they would be skipped from the end, as would every transition
 * written between the cut and the watch noticing it. The cost is a line the watcher had before may be said again, which at least once
 * already allows. Without `onCut`, the cut is refused (exit 2) to `onError` on every beat, and the caller ends the watch — the api's stream
 * does, and a reader opens it again from the feed it has now.
 *
 * A directory `fs.watch` cannot watch leaves the timer alone. The timer is not unref'd: a watch keeps its process alive, as `wf watch`
 * needs.
 */
function watchFeedFile(
  file: string,
  {
    from = 0,
    onLine,
    intervalMs = 1_000,
    onError,
    onRead,
    onCut,
  }: {
    from?: number;
    onLine: (line: FeedLine, cursor: number) => void | Promise<void>;
    intervalMs?: number;
    onError?: (e: unknown) => void;
    onRead?: () => void | Promise<void>;
    /** The feed was cut under the watch, in words (`feedCut`): the watch reads on from 0, the start of the feed there is now. */
    onCut?: (said: string) => void | Promise<void>;
  },
): { stop(): void } {
  const refusal = cursorRefusalAt(file, from);
  if (refusal) throw refused(refusal);
  let cursor = from;
  let ino = statOf(file)?.ino;
  let stopped = false;
  let draining = false;
  let again = false;

  const drain = async (): Promise<void> => {
    if (stopped) return;
    if (draining) {
      again = true;
      return;
    }
    draining = true;
    try {
      do {
        again = false;
        for (;;) {
          if (onCut) {
            const stat = statOf(file);
            const cut = feedCut(file, cursor, ino, stat);
            ino = stat?.ino;
            if (cut) {
              cursor = 0;
              await onCut(cut);
              if (stopped) return;
            }
          }
          const got = readEnds(file, cursor);
          if (stopped) return;
          await onRead?.();
          if (got.cursor === cursor) break;
          cursor = got.cursor;
          for (const [i, line] of got.lines.entries()) {
            if (stopped) return;
            await onLine(line, got.ends[i]);
          }
        }
        // oxlint-disable-next-line no-unmodified-loop-condition -- a drain called during an await sets `again`, and `stop()` sets `stopped`
      } while (again && !stopped);
    } catch (e) {
      onError?.(e);
    } finally {
      draining = false;
    }
  };

  const dir = path.dirname(file);
  const name = path.basename(file);
  let watcher: fs.FSWatcher | undefined;
  try {
    fs.mkdirSync(dir, { recursive: true });
    watcher = fs.watch(dir, (_event, changed) => {
      if (!changed || changed === name) void drain();
    });
  } catch {}
  const timer = setInterval(() => void drain(), intervalMs);
  void drain();
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      watcher?.close();
    },
  };
}
