/**
 * The workflow layer's feed: one line for each change in what the tick judged of a run or of a step, appended to `$WF_ROOT/feed.jsonl`.
 *
 * The engine keeps a feed of what happened to its tasks (`engine/feed.jsonl`: filed, started, ended, settled). What the workflow layer
 * decides on top of it — a step at its gate, one that signed off blocked, a loop out of rounds, a run waiting on another, a person's
 * approval — was a pass's judgement and nothing more: gone once the pass was, and learned by a watcher only by asking again. This is
 * where it is written down, as it changes.
 *
 * **A report, never an input.** The tick is its one writer and nothing reads it to decide: every pass still judges from the world
 * (`assess`), and a feed deleted by hand costs the history, not a decision.
 *
 * **What a pass compares against is the feed itself**, folded (`foldFeed`): not a copy of the last words kept in memory, which a
 * restarted daemon would not have, and not the run's record, which `wf show` prints and the tick would then rewrite on every change. A
 * process keeps the fold it has read so far with the byte it read to (`FeedMemo`), so a pass reads only the lines written since —
 * its own and any other writer's — and a process with no fold reads the whole feed once. So a restart writes nothing for what did not
 * change, and a `wf tick` typed beside `wf up` is read by the daemon's next pass rather than said again.
 *
 * **The cursor is the engine's**: a byte offset of complete lines, 0 or one a read handed out, that never expires, since the feed only
 * grows. A read stops at the last newline, so it never passes a line half written. Unlike the engine's, a cursor that is not at the start
 * of a line, or is past the end, is refused by name (`feedCursorRefusal`): read on from there and every line after it would be misread.
 *
 * It imports no engine: `runner.ts` calls it and hands the rest of the package what it needs.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FeedSaid, FeedWords } from './run.ts';

/** One line of the feed: when, which run, which step of it (none for the run's own line), the word the tick judged, and the note beside it. */
export type FeedLine = { at: string; run: string; step?: string; word: string; note?: string };

/** The word a run's line says once its record is gone from the store (`wf rm`): the fold forgets the run on reading it. */
export const REMOVED = 'removed';

/** What the feed has said last of each run it has not said is removed, and of each of its steps: its lines, folded. */
export type FeedFold = Map<string, { run?: FeedSaid; steps: Map<string, FeedSaid> }>;

/**
 * A process's fold of the feed, as far as it has read it: the byte it read to (`cursor`), and the file it read (`ino`), so a feed
 * replaced or truncated under it is read again from the start instead of compared against a fold of another file.
 */
export type FeedMemo = { cursor: number; ino?: number; fold: FeedFold };

/** A fold of nothing: what a process that has read no feed starts from. */
export const freshMemo = (): FeedMemo => ({ cursor: 0, fold: new Map() });

/** Each line folded onto what came before: the last word said of each run and step wins, and `removed` forgets a run. Pure. */
export function foldFeed(fold: FeedFold, lines: readonly FeedLine[]): FeedFold {
  for (const l of lines) {
    if (l.step === undefined && l.word === REMOVED) {
      fold.delete(l.run);
      continue;
    }
    const said: FeedSaid = { word: l.word, ...(l.note !== undefined ? { note: l.note } : {}) };
    const run = fold.get(l.run) ?? { steps: new Map<string, FeedSaid>() };
    if (l.step === undefined) run.run = said;
    else run.steps.set(l.step, said);
    fold.set(l.run, run);
  }
  return fold;
}

const same = (a: FeedSaid | undefined, b: FeedSaid): boolean => a !== undefined && a.word === b.word && a.note === b.note;

/**
 * The lines a pass owes the feed: one for each run and each step whose word or note is not what the feed said of it last — a run the feed
 * has never named says each of its words once — and one `removed` for each run the feed still names that the store no longer has. Pure.
 *
 * `now` is every run in the store, as the pass read it: a run not in it is a run that is gone. A removed run's steps get no line of their own.
 */
export function feedChanges(fold: FeedFold, now: ReadonlyMap<string, FeedWords>, at: string): FeedLine[] {
  const line = (run: string, step: string | undefined, said: FeedSaid): FeedLine =>
    ({ at, run, ...(step !== undefined ? { step } : {}), word: said.word, ...(said.note !== undefined ? { note: said.note } : {}) });
  const out: FeedLine[] = [];
  for (const [id, words] of now) {
    const before = fold.get(id);
    if (!same(before?.run, words.run)) out.push(line(id, undefined, words.run));
    for (const s of words.steps) if (!same(before?.steps.get(s.name), s)) out.push(line(id, s.name, s));
  }
  for (const id of fold.keys()) if (!now.has(id)) out.push({ at, run: id, word: REMOVED });
  return out;
}

/** One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`. Shared by `wf feed` and `wf watch`. */
export const feedLineWords = (l: FeedLine): string =>
  `${l.at.slice(11, 19)}  ${l.run}  ${l.step ?? '—'}  ${l.word}${l.note ? `  · ${l.note}` : ''}`;

// ─── the file ───────────────────────────────────────────────────────────────

const statOf = (file: string): fs.Stats | undefined => fs.statSync(file, { throwIfNoEntry: false });

/** The byte at `at` in the file, read alone. */
function byteAt(file: string, at: number): number {
  const fd = fs.openSync(file, 'r');
  try {
    const one = Buffer.alloc(1);
    fs.readSync(fd, one, 0, 1, at);
    return one[0]!;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Why a cursor cannot be read from, in words that say what to do — or undefined when it can: 0, or the byte just after a line, at most the
 * feed's size. A cursor inside a line would have the reader take the rest of that line for one; one past the end was handed out by a feed
 * since truncated or replaced, and nothing after it means what the reader thinks.
 */
export function feedCursorRefusal(file: string, after: number): string | undefined {
  if (!Number.isSafeInteger(after) || after < 0) return `a feed cursor is a whole number of bytes — 0, or one a \`cursor:\` line printed — not ${after}`;
  const size = statOf(file)?.size ?? 0;
  if (after > size) {
    return `cursor ${after} is past the end of the feed (${size} bytes, ${file}): the feed it came from was truncated or replaced since — read it again from the start: wf feed 0`;
  }
  if (after > 0 && byteAt(file, after - 1) !== 0x0a) {
    return `cursor ${after} falls inside a line of the feed, not after one: a cursor is 0 or the number a \`cursor:\` line printed — wf feed 0 reads from the start`;
  }
  return undefined;
}

/** A line of the feed as it was written, or nothing for one that is not: a line a writer died in the middle of, ended by the next one. */
function parseLine(text: string): FeedLine[] {
  if (!text) return [];
  try {
    const l = JSON.parse(text) as Partial<FeedLine>;
    return typeof l === 'object' && l !== null && typeof l.at === 'string' && typeof l.run === 'string' && typeof l.word === 'string' ? [l as FeedLine] : [];
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
    fs.readSync(fd, buf, 0, buf.length, after);
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

const refused = (message: string): Error => Object.assign(new Error(message), { exitCode: 2 });

/**
 * The lines written since `after`, and the cursor to read on from: the byte after the last complete line. A feed not written yet reads as
 * none, at 0. A cursor that is not the start of a line, or is past the end, is refused by name (exit 2).
 */
export function readFeedFile(file: string, after = 0): { lines: FeedLine[]; cursor: number } {
  const { lines, cursor } = readEnds(file, after);
  return { lines, cursor };
}

/** `readFeedFile`, with the byte after each line (`linesFrom`'s `ends`): what a watch hands on with each line. */
function readEnds(file: string, after: number): { lines: FeedLine[]; ends: number[]; cursor: number } {
  const refusal = feedCursorRefusal(file, after);
  if (refusal) throw refused(refusal);
  return linesFrom(file, after, statOf(file)?.size ?? 0);
}

/**
 * The pass's words written where they changed (`feedChanges`), in one append, and the lines written.
 *
 * `memo` is the fold this process has read so far. It is read on to the end of the feed first — the lines this process wrote last pass,
 * and any another wrote — and read again from the start when it does not fit the file: another file, or a cursor the file no longer has a
 * line boundary at. It is not moved past what this call writes: the next call reads those lines back, so what it compares against is
 * always what the feed says.
 *
 * A line with no newline at the end of the feed is one a writer died in: the append starts with a newline, so that line ends as the one
 * nobody can read (`parseLine`) and the lines after it are whole.
 */
export function recordFeedFile(file: string, now: ReadonlyMap<string, FeedWords>, at: string, memo: FeedMemo): FeedLine[] {
  const stat = statOf(file);
  const size = stat?.size ?? 0;
  if ((memo.ino !== undefined && stat?.ino !== memo.ino) || feedCursorRefusal(file, memo.cursor) !== undefined) Object.assign(memo, freshMemo());
  const read = linesFrom(file, memo.cursor, size);
  foldFeed(memo.fold, read.lines);
  memo.cursor = read.cursor;
  memo.ino = stat?.ino;
  const lines = feedChanges(memo.fold, now, at);
  if (!lines.length) return [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${read.cursor < size ? '\n' : ''}${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  if (memo.ino === undefined) memo.ino = statOf(file)?.ino;
  return lines;
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
 * A cursor that cannot be read from is refused before anything is watched (`feedCursorRefusal`, exit 2); an error after that — a feed
 * truncated under the watcher, a file that could not be opened this beat — goes to `onError`, and the watch goes on. `onRead` hears of
 * each read that works, before the lines it found are handed on, and whether it found any: so a follower that said a read failed can
 * say it works again on the next beat that reads, not only when the next line is written.
 */
export function watchFeedFile(file: string, { from = 0, onLine, intervalMs = 1_000, onError, onRead }: {
  from?: number;
  onLine: (line: FeedLine, cursor: number) => void | Promise<void>;
  intervalMs?: number;
  onError?: (e: unknown) => void;
  onRead?: () => void | Promise<void>;
}): { stop(): void } {
  const refusal = feedCursorRefusal(file, from);
  if (refusal) throw refused(refusal);
  let cursor = from;
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
          const got = readEnds(file, cursor);
          if (stopped) return;
          await onRead?.();
          if (got.cursor === cursor) break;
          cursor = got.cursor;
          for (const [i, line] of got.lines.entries()) {
            if (stopped) return;
            await onLine(line, got.ends[i]!);
          }
        }
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
    watcher = fs.watch(dir, (_event, changed) => { if (!changed || changed === name) void drain(); });
  } catch { /* the timer alone, then */ }
  // Not unref'd: a watch is what keeps `wf watch` alive, as the engine's timer keeps `ae watch`.
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
