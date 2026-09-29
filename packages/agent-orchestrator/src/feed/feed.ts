/**
 * The workflow layer's feed: one line for each change in what the tick judged of a run or of a step, appended to `$WF_ROOT/feed.jsonl`.
 *
 * The engine keeps a feed of what happened to its tasks (`engine/feed.jsonl`: filed, started, ended, settled). What the workflow layer
 * decides on top of it — a step at its gate, one that signed off blocked, a loop out of rounds, a run waiting on another, a person's
 * approval — is a pass's judgement, gone with the pass. This is where it is written down, as it changes, so a watcher reads it here
 * rather than asking again.
 *
 * **A report, never an input.** The tick is its one writer and nothing reads it to decide: every pass judges from the world
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
 * Pure: the line, the fold, what a pass owes and what it judged of a run in the feed's words (`feedWords`). The file — read, appended to
 * and followed — is `feed.store.ts`'s, and the controllers hand the rest of the package what it needs.
 */
import { onYouWords, type Listing } from '../list/list.ts';
import { oneLine, type Run } from '../record/record.ts';
import type { Assessment } from '../tick/assess.ts';
import type { Closeout } from '../closeout/closeout.ts';
import { holdWord } from '../wait/wait.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';

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
 * `now` is every run in the store, as the pass read it: a run not in it is a run that is gone — but for one of `unjudged`, which the pass
 * read and could not judge, and of which it says nothing. A removed run's steps get no line of their own.
 */
export function feedChanges(
  fold: FeedFold,
  now: ReadonlyMap<string, FeedWords>,
  at: string,
  unjudged: ReadonlySet<string> = new Set(),
): FeedLine[] {
  const line = (run: string, step: string | undefined, said: FeedSaid): FeedLine => ({
    at,
    run,
    ...(step !== undefined ? { step } : {}),
    word: said.word,
    ...(said.note !== undefined ? { note: said.note } : {}),
  });
  const out: FeedLine[] = [];
  for (const [id, words] of now) {
    const before = fold.get(id);
    if (!same(before?.run, words.run)) out.push(line(id, undefined, words.run));
    for (const s of words.steps) if (!same(before?.steps.get(s.name), s)) out.push(line(id, s.name, s));
  }
  for (const id of fold.keys()) if (!now.has(id) && !unjudged.has(id)) out.push({ at, run: id, word: REMOVED });
  return out;
}

/** One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`. Shared by `wf feed` and `wf watch`. */
export const feedLineWords = (l: FeedLine): string =>
  `${l.at.slice(11, 19)}  ${l.run}  ${l.step ?? '—'}  ${l.word}${l.note ? `  · ${l.note}` : ''}`;

/** A word the feed keeps, and the note beside it, when there is one: what one line of it says of a run or of a step. */
export type FeedSaid = { word: string; note?: string };

/** What a pass judged of one run, in the words the feed keeps (`feedWords`): the run's, and each step's in the order they run. */
export type FeedWords = { run: FeedSaid; steps: Array<FeedSaid & { name: string }> };

/**
 * The engine's word for a task, as the feed keeps it: every word of a session at work — `running (working)`, `running (idle)`,
 * `working (quiescent)`, `starting`, `between attempts` — is `running`, and every other word is itself. Pure.
 *
 * A session's live state moves between those words on its own, many times a step, and nothing of the run's judgement moves with it: a
 * feed that wrote each would write a line every few passes for every step at work, and a watcher waiting for a gate would read through
 * them. `ae watch` is where a session's own life is followed. `pending` (filed, waiting for a session slot), `needs-human` and the settled
 * words are kept: each is something the run decides on.
 */
export const feedPhase = (word: string): string =>
  word.startsWith('running (') || word === 'working (quiescent)' || word === 'starting' || word === 'between attempts' ? 'running' : word;

/**
 * What the feed says of a run as a pass judged it: the listing `wf ls` prints (`listing`, handed the engine's words through `feedPhase`),
 * in the feed's words. Pure.
 *
 * Each step's word is its status on `wf ls`, and its note the note beside it there — the try due or on, the gate and what answers it, how
 * many times it was said to — which is where a person's writes show. Not its cost, which moves while nothing is decided. A step that signed
 * off blocked puts what it needs before that note (`needsNote`). The run's word is `assess`'s status — or, for a run `failed` that nothing
 * failed in, what stopped it (`stoppedOn`: `awaiting approval` at a gate, as `wf decide` says it) — `(pruned)` beside it as `wf ls` says
 * it, and its note who it waits on you for (`onYouWords`) — or, on a held run, what it is held until (`holdWord`), and nobody is waited on.
 *
 * One more departure from `wf ls`: a root the cap on runs in flight holds says `waiting for a run slot`, without the count in flight, which
 * moves with every other run's start and end while nothing of this one does.
 *
 * @param closeoutOf How each step signed off, as `listing` was handed it: a step that signed off blocked says what it needs beside its
 *   word.
 */
export function feedWords(
  l: Listing,
  run: Pick<Run, 'pruned' | 'hold'>,
  { status, stoppedOn }: Pick<Assessment, 'status' | 'stoppedOn'>,
  closeoutOf: (step: string) => Closeout | { error: string } | undefined = () => undefined,
): FeedWords {
  const onYou = onYouWords(l);
  return {
    run: {
      word: `${stoppedOn ?? status}${run.pruned ? ' (pruned)' : ''}`,
      ...(run.hold && status !== 'cancelled'
        ? { note: holdWord(l.holding ?? []) }
        : onYou.length
          ? { note: `waiting on you: ${onYou.join(', ')}` }
          : {}),
    },
    steps: l.steps.map((s) => {
      const note = [needsNote(closeoutOf(s.name)), s.note].filter(Boolean).join(' · ');
      return { name: s.name, word: l.slot && s.status === slotWord(l.slot) ? SLOT_WAIT : s.status, ...(note ? { note } : {}) };
    }),
  };
}

/**
 * The longest `needs` the feed carries. A feed line is one line of `wf watch`, and a step's `needs` is the agent's, of any length: past this
 * it is clipped, and `wf decide` has it whole.
 */
const NEEDS_CAP = 200;

/**
 * What a step that signed off blocked needs, for its line in the feed: `needs: <its closeout's needs>`, one line (`oneLine`) — or nothing, for
 * a step that did not sign off blocked or said nothing it needs. Its word says `BLOCKED` already (`listing`); this is the question, so a
 * watcher does not have to run `wf decide` to read it. Pure.
 */
const needsNote = (c: Closeout | { error: string } | undefined): string => {
  const needs = c && !('error' in c) && c.outcome === 'blocked' && typeof c.needs === 'string' ? oneLine(c.needs, NEEDS_CAP) : '';
  return needs ? `needs: ${needs}` : '';
};
