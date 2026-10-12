/**
 * The workflow layer's feed: one line for each change in what the tick judged of a run or of a step, and one from each daemon once it
 * has taken the store (`startedLine`), appended to `$WF_ROOT/feed.jsonl`.
 *
 * The engine keeps a feed of what happened to its tasks (`engine/feed.jsonl`: filed, started, ended, settled). What the workflow layer
 * decides on top of it — a step at its gate, one that signed off blocked, a loop out of rounds, a run waiting on another, a person's
 * approval — is a pass's judgement, gone with the pass. This is where it is written down, as it changes, so a watcher reads it here
 * rather than asking again.
 *
 * **A report, never an input.** The daemon is its one writer — its tick, and `up` once it holds the store — and nothing reads it to
 * decide: every pass judges from the world (`assess`), and a feed deleted by hand costs the history, not a decision.
 *
 * **What a pass compares against is the feed itself**, folded (`foldFeed`): not a copy of the last words kept in memory, which a
 * restarted daemon would not have, and not the run's record, which `nemia show` prints and the tick would then rewrite on every change. A
 * process keeps the fold it has read so far with the byte it read to (`FeedMemo`), so a pass reads only the lines written since —
 * its own and any other writer's — and a process with no fold reads the whole feed once. So a restart writes nothing for what did not
 * change, and a `nemia tick` typed beside `nemia up` is read by the daemon's next pass rather than said again. A run at rest whose words
 * stand writes nothing when only its notes are worded anew, so a new wording does not say again every run long finished.
 *
 * **The cursor is the engine's**: a byte offset of complete lines, 0 or one a read handed out, that never expires, since the feed only
 * grows. A read stops at the last newline, so it never passes a line half written. Unlike the engine's, a cursor that is not at the start
 * of a line, or is past the end, is refused by name (`feedCursorRefusal`): read on from there and every line after it would be misread.
 *
 * Pure: the line, the fold, what a pass owes and what it judged of a run in the feed's words (`feedWords`). The file — read, appended to
 * and followed — is `feed.store.ts`'s, and the controllers hand the rest of the package what it needs.
 */
import { onYouWords, shownStatus, type Listing } from '../list/list.ts';
import { oneLine, type Run } from '../record/record.ts';
import type { Assessment } from '../tick/assess.ts';
import type { Closeout } from '../closeout/closeout.ts';
import { holdWord } from '../wait/wait.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';
import { takeoverLine, type DaemonStanding } from '../daemon/daemon.ts';

/**
 * A run's line of the feed: when, which run, which step of it (none for the run's own line), the word the tick judged, and the note beside
 * it.
 */
export type RunLine = { at: string; run: string; step?: string; word: string; note?: string };

/** The word of the line a daemon writes once it has taken the store (`startedLine`). */
export const DAEMON_STARTED = 'daemon started';

/** A daemon's line of the feed: when, its pid, that it started, and how the daemon before it ended. */
export type DaemonLine = { at: string; daemon: number; word: typeof DAEMON_STARTED; note?: string };

/** One line of the feed: a run's (`RunLine`), or a daemon's (`DaemonLine`). */
export type FeedLine = RunLine | DaemonLine;

/** Whether `line` is a run's line, which the fold, a subscription's scope and the board's events read by its run. */
export const isRunLine = (line: FeedLine): line is RunLine => !('daemon' in line);

/**
 * The line a daemon of pid `pid` writes once it has taken the store, at `at`, saying how the holder it `replaced` ended: stopped (when),
 * gone without a stop (`takeoverLine`'s words, `now` the clock they measure by), or none before it. Pure.
 */
export function startedLine(pid: number, replaced: DaemonStanding, at: string, now: number): DaemonLine {
  const gone = takeoverLine(replaced, 'the store', now);
  const note =
    replaced.kind === 'none'
      ? 'first daemon on this store'
      : replaced.kind === 'stopped'
        ? `last stopped at ${replaced.file.stoppedAt}`
        : gone && `last gone without a stop: ${gone}`;
  return { at, daemon: pid, word: DAEMON_STARTED, ...(note ? { note } : {}) };
}

/** The word a run's line says once its record is gone from the store (`nemia rm`): the fold forgets the run on reading it. */
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

/**
 * Each run's line folded onto what came before: the last word said of each run and step wins, and `removed` forgets a run; a daemon's line
 * is no run's. Pure.
 */
export function foldFeed(fold: FeedFold, lines: readonly FeedLine[]): FeedFold {
  for (const l of lines.filter(isRunLine)) {
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

/**
 * Whether the feed owes no line for `b`, having said `a` of it last: the same word and the same note — or, of a run at rest, the same word,
 * whatever the note, since a note moving on a run nothing moves is a change of wording.
 */
const same = (a: FeedSaid | undefined, b: FeedSaid, atRest: boolean): boolean =>
  a !== undefined && a.word === b.word && (atRest || a.note === b.note);

/**
 * The lines a pass owes the feed: one for each run and each step whose word or note is not what the feed said of it last — a run the feed
 * has never named says each of its words once — and one `removed` for each run the feed still names that the store no longer has. Pure.
 *
 * A run the pass found at rest (`FeedWords.atRest`) owes a line only where a word moved: a note that moved alone, as a new wording of
 * the listing moves every finished run's, is not news of the run, and the feed keeps the note it said last.
 *
 * `now` is every run in the store, as the pass read it: a run not in it is a run that is gone — but for one of `unjudged`, which the pass
 * read and could not judge, and of which it says nothing. A removed run's steps get no line of their own.
 */
export function feedChanges(
  fold: FeedFold,
  now: ReadonlyMap<string, FeedWords>,
  at: string,
  unjudged: ReadonlySet<string> = new Set(),
): RunLine[] {
  const line = (run: string, step: string | undefined, said: FeedSaid): RunLine => ({
    at,
    run,
    ...(step !== undefined ? { step } : {}),
    word: said.word,
    ...(said.note !== undefined ? { note: said.note } : {}),
  });
  const out: RunLine[] = [];
  for (const [id, words] of now) {
    const before = fold.get(id);
    const atRest = words.atRest === true;
    if (!same(before?.run, words.run, atRest)) out.push(line(id, undefined, words.run));
    for (const s of words.steps) if (!same(before?.steps.get(s.name), s, atRest)) out.push(line(id, s.name, s));
  }
  for (const id of fold.keys()) if (!now.has(id) && !unjudged.has(id)) out.push({ at, run: id, word: REMOVED });
  return out;
}

/**
 * What one line of the feed says, without its time: `r-1  plan  awaiting approval  · approve it: …`, or a daemon's `pid 4242  daemon
 * started  · …`; the message `emitFeed` logs.
 */
export const feedSaidWords = (l: FeedLine): string =>
  `${isRunLine(l) ? `${l.run}  ${l.step ?? '—'}` : `pid ${l.daemon}`}  ${l.word}${l.note ? `  · ${l.note}` : ''}`;

/**
 * One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`. Shared by `nemia feed` and `nemia watch`.
 */
export const feedLineWords = (l: FeedLine): string => `${l.at.slice(11, 19)}  ${feedSaidWords(l)}`;

/**
 * A line of the feed as its writer publishes it to the live readers in its process (`FeedHub`): the line, and the bytes it was written
 * at, from `from` to `to`, the cursor just after its newline.
 */
export type FeedPublished = { from: number; to: number; line: FeedLine };

/**
 * Where an append put its bytes, as its writer measured them (`recordFeed`): the file's size before it (`before`) and after it (`after`),
 * the lines it wrote, and `leading`, the newline it wrote first to end a line a writer died in, or `''`.
 */
export type FeedAppended = { lines: FeedLine[]; before: number; after: number; leading: string };

/**
 * Each line of an append with the bytes it was written at, for the live readers to take without reading the file (`FeedPublished`) — or
 * none, when the file grew by more than the append wrote: another writer appended between the size read before and the one after, and
 * where in that range this append's lines landed is not known, so nothing is vouched for and a reader reads the file. Pure.
 */
export function publishedOf({ lines, before, after, leading }: FeedAppended): FeedPublished[] {
  const sizes = lines.map((l) => Buffer.byteLength(`${JSON.stringify(l)}\n`));
  const written = Buffer.byteLength(leading) + sizes.reduce((a, b) => a + b, 0);
  if (after !== before + written) return [];
  let at = before + Buffer.byteLength(leading);
  return lines.map((line, i) => {
    const from = at;
    at += sizes[i];
    return { from, to: at, line };
  });
}

/** A word the feed keeps, and the note beside it, when there is one: what one line of it says of a run or of a step. */
export type FeedSaid = { word: string; note?: string };

/**
 * What a pass judged of one run, in the words the feed keeps (`feedWords`): the run's, and each step's in the order they run; and
 * `atRest` when the pass found the run at rest (`atRest` in rest.ts), whose notes moving alone owe the feed no line (`feedChanges`).
 */
export type FeedWords = { run: FeedSaid; steps: Array<FeedSaid & { name: string }>; atRest?: true };

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
 * What the feed says of a run as a pass judged it: the listing `nemia ls` prints (`listing`, handed the engine's words through
 * `feedPhase`), in the feed's words. Pure.
 *
 * Each step's word is its status as `nemia ls` prints it (`shownStatus`), and its note the note beside it there — the try due or on, the
 * gate and what answers it, how many times it was said to — which is where a person's writes show. Not its cost, which moves while nothing
 * is decided. A step that signed off blocked puts what it needs before that note (`needsNote`). The run's word is `assess`'s status —
 * `awaiting approval` at a gate, as `nemia decide` says it, and `failed` only where a step broke —
 * `(pruned)` beside it as `nemia ls` says it, and its note who it waits on you for (`onYouWords`) — or, on a held run, what it is held
 * until (`holdWord`), and nobody is waited on.
 *
 * One more departure from `nemia ls`: a root the cap on runs in flight holds says `waiting for a run slot`, without the count in flight,
 * which moves with every other run's start and end while nothing of this one does.
 *
 * @param closeoutOf How each step signed off, as `listing` was handed it: a step that signed off blocked says what it needs beside its
 *   word.
 * @param deniedOf What a step's task was denied so far, in the runtime's words (`denialText`): every call of its ended attempts (`ended`),
 *   and each distinct call of one still running (`running`, `deniedSoFarOf`). A step denied a call says which beside its word
 *   (`deniedNote`).
 */
export function feedWords(
  l: Listing,
  run: Pick<Run, 'pruned' | 'hold'>,
  { status }: Pick<Assessment, 'status'>,
  closeoutOf: (step: string) => Closeout | { error: string } | undefined = () => undefined,
  deniedOf: (step: string) => { ended: readonly string[]; running: readonly string[] } = () => ({ ended: [], running: [] }),
): FeedWords {
  const onYou = onYouWords(l);
  return {
    run: {
      word: `${status}${run.pruned ? ' (pruned)' : ''}`,
      ...(run.hold && status !== 'cancelled'
        ? { note: holdWord(l.holding ?? [], run.hold) }
        : onYou.length
          ? { note: `waiting on you: ${onYou.join(', ')}` }
          : {}),
    },
    steps: l.steps.map((s) => {
      const denied = deniedOf(s.name);
      const note = [needsNote(closeoutOf(s.name)), deniedNote(denied.ended, denied.running), s.note].filter(Boolean).join(' · ');
      return { name: s.name, word: l.slot && s.status === slotWord(l.slot) ? SLOT_WAIT : shownStatus(s), ...(note ? { note } : {}) };
    }),
  };
}

/**
 * The longest `needs` the feed carries. A feed line is one line of `nemia watch`, and a step's `needs` is the agent's, of any length: past
 * this it is clipped, and `nemia decide` has it whole.
 */
const NEEDS_CAP = 200;

/**
 * What a step that signed off blocked needs, for its line in the feed: `needs: <its closeout's needs>`, one line (`oneLine`) — or nothing,
 * for a step that did not sign off blocked or said nothing it needs. Its word says `BLOCKED` already (`listing`); this is the question, so
 * a watcher does not have to run `nemia decide` to read it. Pure.
 */
const needsNote = (c: Closeout | { error: string } | undefined): string => {
  const needs = c && !('error' in c) && c.outcome === 'blocked' && typeof c.needs === 'string' ? oneLine(c.needs, NEEDS_CAP) : '';
  return needs ? `needs: ${needs}` : '';
};

/** The most distinct calls a step's `denied:` note names; the rest are counted. */
const DENIED_CAP = 5;

/**
 * The calls a step's task was denied, for its line in the feed: `denied: <call> ×<n>, …`, each distinct call of its ended attempts
 * (`calls`) once with how many times they denied it, then each call a running attempt was denied that they did not (`running`) by its
 * name alone, with no count until its attempt ends; in the order first denied, at most `DENIED_CAP` named and the rest counted — or
 * nothing, for a step denied nothing. The note changes, and wakes a subscriber, on a running call not yet named, and once more with the
 * counts when the attempt ends. A subscriber woken by `denied:` reads the call a grant would have let through.
 */
export const deniedNote = (calls: readonly string[], running: readonly string[] = []): string => {
  const counts = new Map<string, number | null>();
  for (const call of calls.map((c) => oneLine(c, NEEDS_CAP))) counts.set(call, (counts.get(call) ?? 0) + 1);
  for (const call of running.map((c) => oneLine(c, NEEDS_CAP))) if (!counts.has(call)) counts.set(call, null);
  if (!counts.size) return '';
  const named = [...counts].slice(0, DENIED_CAP).map(([call, n]) => (n === null ? call : `${call} ×${n}`));
  const more = counts.size > DENIED_CAP ? [`and ${counts.size - DENIED_CAP} more`] : [];
  return `denied: ${[...named, ...more].join(', ')}`;
};

/** The refusal of a cursor `nemia feed` or `nemia watch` does not take: a second, or anything but a whole number of bytes. */
export const cursorTakes = (verb: 'feed' | 'watch'): string =>
  `nemia ${verb} takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: nemia ${verb} [cursor]${verb === 'watch' ? ' [--json] [--wake] [--wake-word <word>]...' : ''}`;
