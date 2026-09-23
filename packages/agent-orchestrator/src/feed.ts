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
 * Pure: the line, the fold and what a pass owes. The file — read, appended to and followed — is `feed-store.ts`'s, and the controllers hand the
 * rest of the package what it needs.
 */
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
