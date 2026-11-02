/**
 * The Feed door: the one way a program reads and appends to the feed (`feed.ts`) — an Effect service, `FeedDoor`, whose one group,
 * `lines`, answers where the feed ends (`end`), the lines after a cursor (`read`), why a cursor cannot be read from (`cursorRefusal`) and
 * the lines written (`append`), each an Effect failing with a refusal. Its pattern is the Card door's (`src/door/door.store.ts`). The feed
 * only grows: nothing rewrites or drops a line through the door.
 *
 * Two layers: the files (`feedFiles`, `<root>/feed.jsonl`, written by the daemon alone: its tick, and `up`'s start), and the memory
 * stand-in (`feedDoorMemory`, `memory.store.ts`), which keeps the lines as the bytes they would be, so a cursor is a byte offset on both.
 * Both are built by `feedDoorOver`, so the door's checks are one on both: a read's cursor is a `FeedCursor` (`FeedCursor.OnCreate`) the
 * feed has a line boundary at (`cursorRefusalAt`'s words), or `Invalid`; each line appended decodes through the model's `FeedLine`, or
 * `Invalid` names the line and nothing of the append is written. The walks of `test/feed-walks.ts` hold both layers to one table.
 *
 * A layer carries nothing between passes: the fold of the feed a process has read so far (`FeedMemo`) is its caller's, kept by `emitFeed`
 * (`feed.verb.ts`) and handed to `feedPass` with the door, keyed on the generation the door's end answers (the file's inode) and on the
 * cursor's refusal, so a feed cut under it is read again from the start.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`). The module spellings
 * (`recordFeed`, `readFeed`, `feedSize`, …) are the same door over the module's root, run where they are called, for the synchronous
 * callers left (`test/feed-door.baseline.ts`). Following the file as it grows (`watchFeed`) is the files' alone.
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Context, Effect, Exit, Layer, Schema } from 'effect';
import { HOME } from '../record/record.store.ts';
import { countRead, within } from '../meter/tally.store.ts';
import { brokenBy, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import {
  DAEMON_STARTED,
  feedChanges,
  foldFeed,
  freshMemo,
  type DaemonLine,
  type FeedAppended,
  type FeedLine,
  type FeedMemo,
  type FeedPause,
  type FeedWords,
  lineAsRead,
} from './feed.ts';
import { FeedCursor, FeedLine as FeedLineModel } from './feed.model.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';

/** The feed of the store `root`: beside `runs/`, one for the store. */
export const feedAt = (root: string): string => path.join(root, 'feed.jsonl');

/** The root the module spellings read: the store's, as the module loaded (`test/global-roots.baseline.ts`). */
const moduleRoot = (): string => HOME;

/** The workflow layer's feed (`feed.ts`), at the module's root: written by the daemon alone, its tick and `up`'s start. */
export const feedFile = (): string => feedAt(moduleRoot());

/**
 * Where the feed ends: the cursor after its last byte, and the generation of the feed it is the end of — the file's inode on the files, the
 * stand-in's own in memory — which changes when the feed is cut and another put in its place.
 */
export type FeedEnd = { cursor: number; generation: number };

/** The lines after a cursor, each with the byte just after it (`ends`, one for each of `lines`), and the cursor to read on from. */
export type FeedRead = { lines: FeedLine[]; ends: number[]; cursor: number };

/** A layer of the Feed door, as plain synchronous methods over the feed's lines. */
export type FeedLayer = {
  readonly lines: {
    /** Where the feed ends (`FeedEnd`), or null for a feed not written yet. */
    readonly end: () => FeedEnd | null;
    /** Every complete line after `after`, never past a line with no newline yet (`FeedRead`); the door has checked the cursor. */
    readonly read: (after: number) => FeedRead;
    /** Why `after` cannot be read from, in words that say what to do (`cursorRefusalOf`) — or undefined when it can. */
    readonly cursorRefusal: (after: number) => string | undefined;
    /** `lines` appended, after a newline where the last line was left unended, and where their bytes went (`FeedAppended`). */
    readonly append: (lines: readonly FeedLine[]) => FeedAppended;
  };
};

/** The Feed door's shape: each method of `FeedLayer` answering an Effect. The feed has no id. */
export type FeedDoorShape = DoorOf<FeedLayer, string>;

/**
 * Why a cursor cannot be read from, in words that say what to do — or undefined when it can: 0, or the byte just after a line, at most the
 * feed's `size`. A cursor inside a line would have the reader take the rest of that line for one; one past the end was handed out by a
 * feed that has been truncated or replaced, and nothing after it means what the reader thinks. `byteBefore(at)` is the byte at `at`, and
 * `where` the feed a message names. Both layers say it.
 */
export function cursorRefusalOf(after: number, size: number, byteBefore: (at: number) => number, where: string): string | undefined {
  if (!Number.isSafeInteger(after) || after < 0)
    return `a feed cursor is a whole number of bytes — 0, or one a \`cursor:\` line printed — not ${after}`;
  if (after > size) {
    return `cursor ${after} is past the end of the feed (${size} bytes, ${where}): the feed it came from was truncated or replaced since — read it again from the start: nemia watch --once 0`;
  }
  if (after > 0 && byteBefore(after - 1) !== 0x0a) {
    return `cursor ${after} falls inside a line of the feed, not after one: a cursor is 0 or the number a \`cursor:\` line printed — nemia watch --once 0 reads from the start`;
  }
  return undefined;
}

/**
 * Every complete line of `buf`, which holds the feed's bytes from `after` on, each with the byte just after its newline (`ends`), and the
 * byte after the last complete line: never past a line with no newline yet. The ends are counted in bytes, on the buffer, not in
 * characters of the text — a note with a dash in it is three bytes of one character. A line nobody can read keeps no end, and moves the
 * cursor all the same. Both layers read by it.
 */
export function linesIn(buf: Buffer, after: number): FeedRead {
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

/**
 * The text an append of `lines` writes after the feed's `last` byte (undefined for an empty feed): one JSON line each, after a newline
 * where the last line was left unended — one a writer died in, which then ends as the line nobody can read (`parseLine`) and the lines
 * after it are whole. Both layers write by it.
 */
export function appendedText(lines: readonly FeedLine[], last: number | undefined): { text: string; leading: string } {
  const leading = last !== undefined && last !== 0x0a ? '\n' : '';
  return { text: `${leading}${lines.map((l) => `${JSON.stringify(l)}\n`).join('')}`, leading };
}

/** A read's cursor, as `FeedCursor.OnCreate` checks it: a whole number of bytes, at least 0. */
const cursorChecked = (after: number): Effect.Effect<void, Invalid> => {
  const broken = brokenBy(FeedCursor.OnCreate, after);
  return broken === null
    ? Effect.void
    : Effect.fail(
        new Invalid({
          message: `a feed cursor is a whole number of bytes — 0, or one a \`cursor:\` line printed — not ${after} (${broken}): nemia watch --once 0 reads from the start`,
        }),
      );
};

/** Each line of an append, decoded through the model's `FeedLine`: `Invalid` naming the first that breaks it, before any is written. */
const linesChecked = (lines: readonly FeedLine[]): Effect.Effect<void, Invalid> => {
  for (const [i, line] of lines.entries()) {
    const broken = brokenBy(FeedLineModel, line);
    if (broken !== null)
      return Effect.fail(
        new Invalid({
          message: `line ${i + 1} of ${lines.length} is no line of the feed, so none of them is written: ${broken} — a line is a run's, a daemon's or the store's (FeedLine, src/feed/feed.model.ts)`,
        }),
      );
  }
  return Effect.void;
};

/** The door over `layer`: each method as `doorOf` makes it, a read's cursor checked first and each appended line before any is written. */
export function feedDoorOver(layer: FeedLayer): FeedDoorShape {
  const door = doorOf<FeedLayer, string>(layer);
  return {
    lines: {
      ...door.lines,
      read: (after) =>
        Effect.gen(function* () {
          yield* cursorChecked(after);
          const refusal = yield* door.lines.cursorRefusal(after);
          if (refusal !== undefined) return yield* Effect.fail(new Invalid({ message: refusal }));
          return yield* door.lines.read(after);
        }),
      append: (lines) => Effect.andThen(linesChecked(lines), door.lines.append(lines)),
    },
  };
}

const statOf = (file: string): fs.Stats | undefined => fs.statSync(file, { throwIfNoEntry: false });

/** The byte at `at` in the file, read alone. */
function byteAt(file: string, at: number): number {
  const fd = fs.openSync(file, 'r');
  try {
    const one = Buffer.alloc(1);
    countRead(fs.readSync(fd, one, 0, 1, at));
    return one.readUInt8(0);
  } finally {
    fs.closeSync(fd);
  }
}

/** Why a cursor cannot be read from the file — or undefined when it can (`cursorRefusalOf`). */
const cursorRefusalAt = (file: string, after: number): string | undefined =>
  cursorRefusalOf(after, statOf(file)?.size ?? 0, (at) => byteAt(file, at), file);

/** The file's complete lines from `after` to `size` (`linesIn`). */
function linesFrom(file: string, after: number, size: number): FeedRead {
  if (after >= size) return { lines: [], ends: [], cursor: after };
  const buf = Buffer.alloc(size - after);
  const fd = fs.openSync(file, 'r');
  try {
    countRead(fs.readSync(fd, buf, 0, buf.length, after));
  } finally {
    fs.closeSync(fd);
  }
  return linesIn(buf, after);
}

/** `lines` appended to the file in one write (`appendedText`): the file's size before and after, and the newline written first, if any. */
function appendLines(file: string, lines: readonly FeedLine[]): FeedAppended {
  const before = statOf(file)?.size ?? 0;
  if (!lines.length) return { lines: [...lines], before, after: before, leading: '' };
  const { text, leading } = appendedText(lines, before > 0 ? byteAt(file, before - 1) : undefined);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text);
  return { lines: [...lines], before, after: statOf(file)?.size ?? 0, leading };
}

/** The Feed door's files layer over the store `root`'s feed: its end by the file's size and inode. */
export function feedFiles(root: string): FeedLayer {
  const file = feedAt(root);
  return {
    lines: {
      end: () => {
        const stat = statOf(file);
        return stat ? { cursor: stat.size, generation: stat.ino } : null;
      },
      read: (after) => linesFrom(file, after, statOf(file)?.size ?? 0),
      cursorRefusal: (after) => cursorRefusalAt(file, after),
      append: (lines) => appendLines(file, lines),
    },
  };
}

/**
 * The Feed door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — and a test gives `feedDoorMemory()` with no root at all.
 */
export const FeedDoor = Context.Reference<FeedDoorShape>('agent-orchestrator/FeedDoor', {
  defaultValue: () => rootedDoor((root) => feedDoorOver(feedFiles(root)), 'Feed door'),
});

/** The Feed door over the files of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`. */
export const feedDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(FeedDoor)(feedDoorOver(feedFiles(root)));

/**
 * One pass's words written on `door` where they are not what the feed said of them last: the lines written, and where their bytes went
 * (`FeedAppended`). `now` is every run the pass judged: one the feed still names that is not in it is gone, and gets its `removed` — but
 * for one of `unjudged`, which the pass read and could not judge (`feedChanges`). `pause` is the store's pause as the pass read it
 * (`readPause`), whose put and lift the feed says once each; a caller that read none gives none, and nothing is said of the store.
 *
 * `memo` is the fold its caller has read so far, which this moves: it is read on to the end of the feed first — the lines the caller wrote
 * last pass, and any another wrote — and read again from the start when it does not fit the feed: another generation (a file cut and put
 * back), or a cursor the feed has no line boundary at. It is not moved past what this call writes: the next call reads those lines back,
 * so what it compares against is always what the feed says.
 */
export const feedPass = (
  door: FeedDoorShape,
  memo: FeedMemo,
  now: ReadonlyMap<string, FeedWords>,
  {
    at = new Date().toISOString(),
    unjudged = new Set<string>(),
    pause,
  }: { at?: string; unjudged?: ReadonlySet<string>; pause?: FeedPause } = {},
): Effect.Effect<FeedAppended, Refusal> =>
  Effect.gen(function* () {
    const end = yield* door.lines.end();
    if (
      (memo.generation !== undefined && end?.generation !== memo.generation) ||
      (yield* door.lines.cursorRefusal(memo.cursor)) !== undefined
    )
      Object.assign(memo, freshMemo());
    const read = yield* door.lines.read(memo.cursor);
    foldFeed(memo.fold, read.lines);
    memo.cursor = read.cursor;
    memo.generation = end?.generation;
    const lines = feedChanges(memo.fold, now, at, unjudged, pause);
    const size = end?.cursor ?? 0;
    if (!lines.length) return { lines, before: size, after: size, leading: '' };
    const appended = yield* door.lines.append(lines);
    if (memo.generation === undefined) memo.generation = (yield* door.lines.end())?.generation;
    return appended;
  });

/** The door over the module's root, for the module spellings. */
const moduleDoor = (): FeedDoorShape => feedDoorOver(feedFiles(moduleRoot()));

/** `effect` run where it is called: what it succeeds with, or the refusal it failed with thrown, or the defect it died of. */
function ran<A>(effect: Effect.Effect<A, Refusal>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/**
 * Write what the pass judged of every run in the store, where it is not what the feed said of it last (`feedPass`), on the module's feed:
 * the lines written, and where their bytes went (`FeedAppended`). `memo` is the fold the caller has read so far, a fresh one where it
 * gives none — a caller that keeps none reads the whole feed, and writes what a restarted daemon would.
 */
export const recordFeed = (
  now: ReadonlyMap<string, FeedWords>,
  { memo = freshMemo(), ...pass }: { at?: string; memo?: FeedMemo; unjudged?: ReadonlySet<string>; pause?: FeedPause } = {},
): FeedAppended => within('act', () => ran(feedPass(moduleDoor(), memo, now, pass)));

/**
 * Appends a daemon's line (`startedLine`) to the feed, after a newline where its last line was left unended, as `recordFeed` appends; no
 * fold is moved, since a daemon's line is no run's. Answers where its bytes went (`FeedAppended`).
 */
export const recordDaemonLine = (line: DaemonLine): FeedAppended => within('act', () => ran(moduleDoor().lines.append([line])));

/** A fold of nothing, for a test that plays a restarted daemon. */
export const freshFeedMemo = freshMemo;

/**
 * The feed's lines after `after`, and the cursor to read on from: a cursor inside a line, or past the end, is refused by name (exit 2).
 */
export const readFeed = (after = 0): { lines: FeedLine[]; cursor: number } => {
  const { lines, cursor } = ran(moduleDoor().lines.read(after));
  return { lines, cursor };
};

/** Why `after` cannot be read from — or undefined when it can (`cursorRefusalOf`). */
export const feedCursorRefusal = (after: number): string | undefined => ran(moduleDoor().lines.cursorRefusal(after));

/** The feed's size in bytes, 0 for a feed not written yet: what a live reader compares its cursor with before it reads. */
export const feedSize = (): number => ran(moduleDoor().lines.end())?.cursor ?? 0;

/**
 * The lines after `after`, each with the byte just after it (`ends`), and the cursor to read on from: what a live reader hands on. A
 * cursor that is not the start of a line, or is past the end, is refused by name (exit 2).
 */
export const readFeedEnds = (after: number): FeedRead => ran(moduleDoor().lines.read(after));

/**
 * Follow the feed from `from` until `stop()` (`watchFeedFile`), each line with the cursor just after it: refused before anything is watched
 * when the cursor cannot be read from.
 */
export const watchFeed = (opts: Parameters<typeof watchFeedFile>[1]): { stop(): void } => watchFeedFile(feedFile(), opts);

/** What every key a line does not name is kept as, so a line a newer `nemia` wrote keeps it through a read and a write back. */
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/**
 * What a v1 line signs itself with (`Line` in `feed.ts`), each key optional so a line written before this version still decodes and is
 * upgraded on read (`upgraded`) rather than dropped.
 *
 * Every one of them is as loose as the JSON it came from — a string where this version writes a literal — on purpose: a `nemia` newer
 * than this one may name a reason, a type or a source this one does not, and a closed literal here would drop its line whole and leave
 * the fold reading a feed with a hole in it.
 */
const LINE_KEYS = {
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
 * A line of the feed as `recordFeed` and `recordDaemonLine` write one (`FeedLine`): a run's, a daemon's or the store's, each with what a
 * v1 line signs itself with. `StructWithRest`, so a key this version does not name survives a read and a write back — a digest the
 * deliverer keeps holds whole lines (`subscription.store.ts`, which decodes with this very schema).
 */
export const FeedLineSchema = Schema.Union([
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      run: Schema.String,
      step: Schema.optionalKey(Schema.String),
      word: Schema.String,
      note: Schema.optionalKey(Schema.String),
      ...LINE_KEYS,
    }),
    Rest,
  ),
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      daemon: Schema.Finite,
      word: Schema.Literal(DAEMON_STARTED),
      note: Schema.optionalKey(Schema.String),
      ...LINE_KEYS,
    }),
    Rest,
  ),
  Schema.StructWithRest(
    Schema.Struct({
      at: Schema.String,
      store: Schema.String,
      word: Schema.String,
      note: Schema.optionalKey(Schema.String),
      ...LINE_KEYS,
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

const refused = (message: string): Invalid => new Invalid({ message });

/** The file's lines after `after`, its cursor refused by name first (exit 2): what a watch given no `onCut` reads by. */
function readEnds(file: string, after: number): FeedRead {
  const refusal = cursorRefusalAt(file, after);
  if (refusal) throw refused(refusal);
  return linesFrom(file, after, statOf(file)?.size ?? 0);
}

/**
 * Whether the feed was cut under a reader at `cursor`, in words — or undefined, when the cursor is still one of this file's: it was
 * deleted, a file was put in its place (`ino`, the inode the cursor was read in), or it is shorter than the cursor or has no line boundary
 * there: truncated, and perhaps written again. A feed truncated and written past the cursor again, a line ending just
 * there, is not seen: nothing on disk tells it from the same feed grown.
 *
 * Judged of the one `stat` its beat took and of the byte before the cursor, never of a stat of its own: a feed that goes between two stats
 * of one beat is seen by the later one alone, and the beat then says a cut the earlier one's size does not fit. The read of that byte
 * throws where the file has just gone, and the beat takes itself again (`cutOrRead`).
 */
function feedCut(file: string, cursor: number, ino: number | undefined, stat: fs.Stats | undefined): string | undefined {
  if (cursor === 0) return undefined;
  const from = `reading the feed there is now from its start — a line said before may be said again`;
  if (!stat) return `the feed was deleted under this watch at cursor ${cursor} (${file}): ${from}`;
  if (ino !== undefined && stat.ino !== ino) return `the feed was replaced under this watch at cursor ${cursor} (${file}): ${from}`;
  if (cursor > stat.size || byteAt(file, cursor - 1) !== 0x0a)
    return `the feed was truncated under this watch at cursor ${cursor}, and is ${stat.size} bytes now (${file}): ${from}`;
  return undefined;
}

/**
 * What one beat of a watch found: the cut that happened under it, in words (`feedCut`), or the lines at its cursor, and the inode it read
 * them in.
 */
type WatchBeat =
  | { cut: string; ino: number | undefined }
  | { cut?: undefined; ino: number | undefined; got: { lines: FeedLine[]; ends: number[]; cursor: number } };

/**
 * One beat of a watch at `cursor`: the cut that happened under it (`feedCut`), or the lines from `cursor` to the size that same stat said.
 *
 * Read by that stat's size, never through `readEnds`: `readEnds` stats again, and a feed that goes between the two refuses the cursor as
 * one given by hand is refused (`cursorRefusalAt`) — `past the end`, where the truth is a feed deleted or truncated under the watch. A
 * read that cannot open the file is a feed that went just then, and is taken again, up to `tries`, so the stat of the next try says which
 * cut it was; a file that keeps failing for another reason throws its last failure, which the watch hands to `onError`.
 */
function cutOrRead(file: string, cursor: number, ino: number | undefined, tries = 3): WatchBeat {
  let seen = ino;
  for (let i = 1; ; i++) {
    const stat = statOf(file);
    try {
      const cut = feedCut(file, cursor, seen, stat);
      return cut !== undefined ? { cut, ino: stat?.ino } : { ino: stat?.ino, got: linesFrom(file, cursor, stat?.size ?? 0) };
    } catch (e) {
      if (i >= tries) throw e;
      seen = stat?.ino;
    }
  }
}

/** Where a watch is: the cursor it has read to, the inode it read it in, and whether it has stopped (`stop()`). */
type WatchAt = { cursor: number; ino: number | undefined; stopped: boolean };

/** What a watch hands on, as `watchFeedFile` is given them. */
type WatchHands = {
  onLine: (line: FeedLine, cursor: number) => void | Promise<void>;
  onError?: (e: unknown) => void;
  onRead?: () => void | Promise<void>;
  /** The feed was cut under the watch, in words (`feedCut`): the watch reads on from 0, the start of the feed there is now. */
  onCut?: (said: string) => void | Promise<void>;
};

/**
 * One pass of a watch at `at`: the cut under it said and its cursor moved to the start of the feed there is now (`cutOrRead`), or every
 * line from its cursor handed on, its cursor moved with them. Whether there is more to read — false where the read found nothing new, and
 * where the watch stopped during it.
 *
 * Given no `onCut`, it reads through `readEnds`, whose refusal of a cursor the feed no longer has (exit 2) is the caller's to take: the
 * api's stream ends on it, and its reader opens the feed again. Given one, no read of a watch already following ever says that refusal.
 */
async function passOf(file: string, at: WatchAt, { onLine, onRead, onCut }: WatchHands): Promise<boolean> {
  let got: { lines: FeedLine[]; ends: number[]; cursor: number };
  if (onCut) {
    const beat = cutOrRead(file, at.cursor, at.ino);
    at.ino = beat.ino;
    if (beat.cut !== undefined) {
      at.cursor = 0;
      await onCut(beat.cut);
      return !at.stopped;
    }
    got = beat.got;
  } else got = readEnds(file, at.cursor);
  if (at.stopped) return false;
  await onRead?.();
  if (got.cursor === at.cursor) return false;
  at.cursor = got.cursor;
  for (const [i, line] of got.lines.entries()) {
    if (at.stopped) return false;
    const end = got.ends[i];
    if (end !== undefined) await onLine(line, end);
  }
  return !at.stopped;
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
 * again (`feedPass`) — the lines a watcher that lost its place needs, and they would be skipped from the end, as would every
 * transition written between the cut and the watch noticing it. The cost is a line the watcher had before may be said again, which at least
 * once already allows. Without `onCut`, the cut is refused (exit 2) to `onError` on every beat, and the caller ends the watch — the api's
 * stream does, and a reader opens it again from the feed it has now.
 *
 * A directory `fs.watch` cannot watch leaves the timer alone. The timer is not unref'd: a watch keeps its process alive, as `nemia watch`
 * needs.
 */
function watchFeedFile(
  file: string,
  { from = 0, intervalMs = 1_000, onLine, onError, onRead, onCut }: { from?: number; intervalMs?: number } & WatchHands,
): { stop(): void } {
  const refusal = cursorRefusalAt(file, from);
  if (refusal) throw refused(refusal);
  const at: WatchAt = { cursor: from, ino: statOf(file)?.ino, stopped: false };
  const hands: WatchHands = { onLine, onError, onRead, onCut };
  let draining = false;
  let again = false;

  const drain = async (): Promise<void> => {
    if (at.stopped) return;
    if (draining) {
      again = true;
      return;
    }
    draining = true;
    try {
      do {
        again = false;
        let more = true;
        while (more) more = await passOf(file, at, hands);
        // oxlint-disable-next-line no-unmodified-loop-condition -- a drain called during an await sets `again`, and `stop()` sets `stopped`
      } while (again && !at.stopped);
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
      at.stopped = true;
      clearInterval(timer);
      watcher?.close();
    },
  };
}
