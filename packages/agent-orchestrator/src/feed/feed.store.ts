/**
 * The feed (`feed.ts`) over the store's own file: `$WF_ROOT/feed.jsonl`, and this process's one fold of it, which the tick writes through.
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports it.
 * `feed.ts` is the pure half — the line, the fold, what a pass owes — and this is the file: read, appended to and followed, each helper
 * taking the file as an argument, and the exports over the store's own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import { countRead, within } from '../meter/tally.store.ts';
import {
  DAEMON_STARTED,
  feedChanges,
  foldFeed,
  freshMemo,
  type DaemonLine,
  type FeedAppended,
  type FeedLine,
  type FeedMemo,
  type FeedWords,
  lineAsRead,
} from './feed.ts';
import { Invalid } from '../refusal/refusal.ts';

/** The workflow layer's feed (`feed.ts`): beside `runs/`, one for the store, written by the daemon alone: its tick, and `up`'s start. */
export const feedFile = (): string => path.join(HOME, 'feed.jsonl');

/** This process's fold of the feed, as far as it has read it: a restarted daemon starts from none, and reads the feed once. */
const feedMemo: FeedMemo = freshMemo();

/**
 * Write what the pass judged of every run in the store, where it is not what the feed said of it last (`recordFeedFile`): the lines
 * written, and where their bytes went (`FeedAppended`). `now` is every run the pass judged: one the feed still names that is not in it is
 * gone, and gets its `removed` — but for one of `unjudged`, which the pass read and could not judge (`feedChanges`). `memo` is for a test,
 * which starts one afresh to be a restarted daemon.
 */
export const recordFeed = (
  now: ReadonlyMap<string, FeedWords>,
  {
    at = new Date().toISOString(),
    memo = feedMemo,
    unjudged = new Set<string>(),
  }: { at?: string; memo?: FeedMemo; unjudged?: ReadonlySet<string> } = {},
): FeedAppended => within('act', () => recordFeedFile(feedFile(), now, at, memo, unjudged));

/**
 * Appends a daemon's line (`startedLine`) to the feed, after a newline where its last line was left unended, as `recordFeed` appends; the
 * fold is not moved, since a daemon's line is no run's. Answers where its bytes went (`FeedAppended`).
 */
export const recordDaemonLine = (line: DaemonLine): FeedAppended => within('act', () => appendDaemonLine(feedFile(), line));

/** `recordDaemonLine` over `file`. */
function appendDaemonLine(file: string, line: DaemonLine): FeedAppended {
  const before = statOf(file)?.size ?? 0;
  const leading = before > 0 && byteAt(file, before - 1) !== 0x0a ? '\n' : '';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${leading}${JSON.stringify(line)}\n`);
  return { lines: [line], before, after: statOf(file)?.size ?? 0, leading };
}

/** A fold of nothing, for a test that plays a restarted daemon. */
export const freshFeedMemo = freshMemo;

/**
 * The feed's lines after `after`, and the cursor to read on from (`readFeedFile`): a cursor inside a line, or past the end, is refused by
 * name.
 */
export const readFeed = (after = 0): { lines: FeedLine[]; cursor: number } => readFeedFile(feedFile(), after);

/** Why `after` cannot be read from — or undefined when it can (`cursorRefusalAt`). */
export const feedCursorRefusal = (after: number): string | undefined => cursorRefusalAt(feedFile(), after);

/** The feed's size in bytes, 0 for a feed not written yet: what a live reader compares its cursor with before it reads. */
export const feedSize = (): number => statOf(feedFile())?.size ?? 0;

/**
 * The lines after `after`, each with the byte just after it (`ends`), and the cursor to read on from (`readEnds`): what a live reader
 * hands on. A cursor that is not the start of a line, or is past the end, is refused by name (exit 2).
 */
export const readFeedEnds = (after: number): { lines: FeedLine[]; ends: number[]; cursor: number } => readEnds(feedFile(), after);

/**
 * Follow the feed from `from` until `stop()` (`watchFeedFile`), each line with the cursor just after it: refused before anything is watched
 * when the cursor cannot be read from.
 */
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
    return `cursor ${after} is past the end of the feed (${size} bytes, ${file}): the feed it came from was truncated or replaced since — read it again from the start: nemia watch --once 0`;
  }
  if (after > 0 && byteAt(file, after - 1) !== 0x0a) {
    return `cursor ${after} falls inside a line of the feed, not after one: a cursor is 0 or the number a \`cursor:\` line printed — nemia watch --once 0 reads from the start`;
  }
  return undefined;
}

/** What every key a line does not name is kept as, so a line a newer `nemia` wrote keeps it through a read and a write back. */
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/**
 * What a v1 line signs itself with (`Signal` in `feed.ts`), each key optional so a line written before this version still decodes and is
 * upgraded on read (`upgraded`) rather than dropped.
 *
 * Every one of them is as loose as the JSON it came from — a string where this version writes a literal — on purpose: a `nemia` newer
 * than this one may name a reason, a type or a source this one does not, and a closed literal here would drop its line whole and leave
 * the fold reading a feed with a hole in it.
 */
const SIGNAL_KEYS = {
  apiVersion: Schema.optionalKey(Schema.String),
  involved: Schema.optionalKey(Schema.Struct({ kind: Schema.String, name: Schema.String })),
  labels: Schema.optionalKey(
    Schema.Struct({
      run: Schema.optionalKey(Schema.String),
      factory: Schema.optionalKey(Schema.String),
      workflow: Schema.optionalKey(Schema.String),
      step: Schema.optionalKey(Schema.String),
      agent: Schema.optionalKey(Schema.String),
    }),
  ),
  reason: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  waits: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  call: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Finite),
};

/**
 * A line of the feed as `recordFeed` and `recordDaemonLine` write one (`FeedLine`): a run's, or a daemon's, each with what a v1 line signs
 * itself with. `StructWithRest`, so a key this version does not name survives a read and a write back — a digest the deliverer keeps holds
 * whole lines (`subscription.store.ts`, which decodes with this very schema).
 */
export const FeedLineSchema = Schema.Union([
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      run: Schema.String,
      step: Schema.optionalKey(Schema.String),
      word: Schema.String,
      note: Schema.optionalKey(Schema.String),
      ...SIGNAL_KEYS,
    }),
    Rest,
  ),
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      daemon: Schema.Finite,
      word: Schema.Literal(DAEMON_STARTED),
      note: Schema.optionalKey(Schema.String),
      ...SIGNAL_KEYS,
    }),
    Rest,
  ),
]);

/** Whether a value read off the feed is one of its lines; a key the line does not name is kept, as a newer `nemia` may write one. */
const isFeedLine = Schema.is(FeedLineSchema);

/**
 * A line of the feed as it was written, upgraded to a v1 signal (`upgraded`) — or nothing for text that is no line: one a writer died in
 * the middle of, ended by the next one.
 *
 * **Every reader downstream of this sees v1 alone**, the fold included, so a feed of old lines and one of new fold to the same state and
 * no reader upgrades a line a second way. Nothing on disk is rewritten: the line read is left exactly as it lies, and the cursor it was
 * read at means what it always meant.
 *
 * The decoded line goes through the one door between the loose shape the JSON held and the typed line (`lineAsRead`), which fills in from
 * the word and the note every key that is missing, and passes on a line a newer `nemia` signed as its writer judged it.
 */
function parseLine(text: string): FeedLine[] {
  if (!text) return [];
  try {
    const line: unknown = JSON.parse(text);
    return isFeedLine(line) ? [lineAsRead(line)] : [];
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
 * The pass's words written where they changed (`feedChanges`), in one append: the lines written, the file's size before and after the
 * append, and the newline written before them, if any (`FeedAppended`).
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
): FeedAppended {
  const stat = statOf(file);
  const size = stat?.size ?? 0;
  if ((memo.ino !== undefined && stat?.ino !== memo.ino) || cursorRefusalAt(file, memo.cursor) !== undefined)
    Object.assign(memo, freshMemo());
  const read = linesFrom(file, memo.cursor, size);
  foldFeed(memo.fold, read.lines);
  memo.cursor = read.cursor;
  memo.ino = stat?.ino;
  const lines = feedChanges(memo.fold, now, at, unjudged);
  if (!lines.length) return { lines, before: size, after: size, leading: '' };
  const leading = read.cursor < size ? '\n' : '';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${leading}${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  const after = statOf(file);
  if (memo.ino === undefined) memo.ino = after?.ino;
  return { lines, before: size, after: after?.size ?? 0, leading };
}

/**
 * Whether the feed was cut under a reader at `cursor`, in words — or undefined, when the cursor is still one of this file's: it was
 * deleted, a file was put in its place (`ino`, the inode the cursor was read in), or it is shorter than the cursor or has no line boundary
 * there (`cursorRefusalAt`): truncated, and perhaps written again. A feed truncated and written past the cursor again, a line ending just
 * there, is not seen: nothing on disk tells it from the same feed grown.
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
 * one it was handed out by (`feedCut`). Given `onCut`, the watch says so there once, in words, and reads on from the start of the feed
 * there is now. From the start and not from its end: a cut feed is one the tick has no fold of, so its next pass writes every run's words
 * again (`recordFeedFile`) — the lines a watcher that lost its place needs, and they would be skipped from the end, as would every
 * transition written between the cut and the watch noticing it. The cost is a line the watcher had before may be said again, which at least
 * once already allows. Without `onCut`, the cut is refused (exit 2) to `onError` on every beat, and the caller ends the watch — the api's
 * stream does, and a reader opens it again from the feed it has now.
 *
 * A directory `fs.watch` cannot watch leaves the timer alone. The timer is not unref'd: a watch keeps its process alive, as `nemia watch`
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
