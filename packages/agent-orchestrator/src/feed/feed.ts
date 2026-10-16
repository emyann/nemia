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
import type { Closeout } from '../closeout/index.ts';
import { holdWord } from '../wait/wait.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';
import { takeoverLine, type DaemonStanding } from '../daemon/daemon.ts';
import {
  DAEMON_STARTED,
  DENIED,
  messageOf,
  reasonOf,
  REMOVED,
  typeOf,
  waitsOf,
  type InvolvedKind,
  type Reason,
  type SignalType,
} from './reason.ts';

export { DAEMON_STARTED, REMOVED };
export type { InvolvedKind, Reason, SignalType };

/** The version every line this `nemia` writes is stamped with; a line with none is upgraded on read (`upgraded`). */
export const FEED_VERSION = 'nemia/v1';

/** What a signal is about: a run by its id, one of its steps (`<run>/<step>`), or a daemon by its pid. */
export type Involved = { kind: InvolvedKind; name: string };

/**
 * The labels a line carries, as a filing's do (`stepLabels`): the run, its factory and its workflow, and on a step's line the step and
 * its agent. A daemon's line is of no run and carries none.
 */
export type FeedLabels = { run?: string; factory?: string; workflow?: string; step?: string; agent?: string };

/** Who wrote a line: the tick's judgement, the runtime's journal, a person's verb, or a daemon that took the store. */
export type SignalSource = 'tick' | 'runtime' | 'person' | 'daemon';

/**
 * What a v1 line says besides the four fields it keeps for one release: its version, what it is about (`involved`), its labels, the
 * `reason` a machine selects on, how serious it is (`type`), whether it waits on a person (`waits`), who wrote it (`source`) and the
 * `message` a person reads. And, on a `ToolDenied` one-shot alone, the `call` the harness denied, as `denialText` spells it, and `try`,
 * the step's try it belongs to, from 1 — the two fields a selector matches a denial by, and the two the tick counts the denials already
 * written by.
 *
 * Every one is optional on the type, because a line read off a feed written by an older `nemia` has none: `upgraded` is the one door
 * that fills them in, and every reader downstream of it sees them all.
 */
type Signal = {
  apiVersion?: typeof FEED_VERSION;
  involved?: Involved;
  labels?: FeedLabels;
  reason?: Reason;
  type?: SignalType;
  waits?: 'person';
  source?: SignalSource;
  message?: string;
  call?: string;
  try?: number;
};

/**
 * A run's line of the feed: when, which run, which step of it (none for the run's own line), the word the tick judged, and the note beside
 * it — and what a v1 line signs it with (`Signal`).
 */
export type RunLine = { at: string; run: string; step?: string; word: string; note?: string } & Signal;

/** A daemon's line of the feed: when, its pid, that it started, and how the daemon before it ended. */
export type DaemonLine = { at: string; daemon: number; word: typeof DAEMON_STARTED; note?: string } & Signal;

/** One line of the feed: a run's (`RunLine`), or a daemon's (`DaemonLine`). */
export type FeedLine = RunLine | DaemonLine;

/** Whether `line` is a run's line, which the fold, a subscription's scope and the board's events read by its run. */
export const isRunLine = (line: FeedLine): line is RunLine => !('daemon' in line);

/**
 * What `line` is about, read off its `involved` where it has one and derived from its `run` and `step` where it has not, so a v0 line and
 * the v1 line of the same thing come to the same thing: a run by its id, a step as `<run>/<step>`, a daemon by its pid. Pure.
 */
export const involvedOf = (line: FeedLine): Involved =>
  line.involved ??
  (isRunLine(line)
    ? line.step === undefined
      ? { kind: 'Run', name: line.run }
      : { kind: 'Step', name: `${line.run}/${line.step}` }
    : { kind: 'Daemon', name: String(line.daemon) });

/** The labels `line` carries, its own where it has them, else what a v0 line says: its run, and its step where it names one. */
const labelsOf = (line: FeedLine): FeedLabels =>
  line.labels ?? (isRunLine(line) ? { run: line.run, ...(line.step !== undefined ? { step: line.step } : {}) } : {});

/**
 * `line` as a v1 signal: a line already stamped `nemia/v1` as it is, and any other with its version, what it is about, its labels, its
 * reason, its type, whether it waits, its source and its message filled in from the word and the note it was written with. Pure, and
 * nothing on disk is rewritten — this is read, never written back.
 *
 * It is also the one stamp a new line gets: `feedChanges`, `startedLine` and `denialLines` build the fields a line is written with and
 * hand them here, so a line written and a line upgraded say the same reason, type, wait and message.
 *
 * A line that carries an `apiVersion` is trusted as written, whatever version it names. A `nemia` newer than this one may name a reason
 * this table does not have, or mark as waiting a reason this one does not: re-deriving either would answer for its writer, and a line is
 * a report of what its writer judged. Only a line with no version at all — one written before the feed was signed — is read off its word
 * and its note, and even then the fold reaches what it needs through `involvedOf` and the table where a key is still missing.
 */
export function upgraded(line: FeedLine): FeedLine {
  if (line.apiVersion !== undefined) return line;
  const involved = involvedOf(line);
  const reason = reasonOf(line, involved.kind);
  return {
    ...line,
    apiVersion: FEED_VERSION,
    involved,
    labels: labelsOf(line),
    reason,
    type: typeOf(reason),
    ...(waitsOf(reason, line.note) ? { waits: 'person' as const } : {}),
    source: involved.kind === 'Daemon' ? 'daemon' : reason === 'ToolDenied' ? 'runtime' : 'tick',
    message: messageOf(line),
  };
}

/**
 * A line as a store decoded it off disk, upgraded to a v1 signal (`upgraded`): the one door between the loose shape the JSON held — a
 * string where this version writes a literal, so a line a newer `nemia` wrote is never dropped — and the typed line every reader works
 * with. The schemas that decode a line (`FeedLineSchema`, and the digest the deliverer keeps) read through here and nowhere else.
 */
export const lineAsRead = (line: Readonly<Record<string, unknown>>): FeedLine => upgraded(line as unknown as FeedLine);

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
  return upgraded({
    at,
    daemon: pid,
    word: DAEMON_STARTED,
    ...(note ? { note } : {}),
    involved: { kind: 'Daemon', name: String(pid) },
    labels: {},
  }) as DaemonLine;
}

/**
 * What the feed has said last of each thing it has not said is removed (`said`, keyed by what the line is about), and how many one-shots
 * it holds of each step's try (`shots`): a one-shot is counted and never becomes a step's last word, or the next pass would say the
 * step's real word again.
 */
export type FeedFold = { said: Map<string, FeedSaid>; shots: Map<string, number> };

/** A fold of nothing. */
export const freshFold = (): FeedFold => ({ said: new Map(), shots: new Map() });

/**
 * A process's fold of the feed, as far as it has read it: the byte it read to (`cursor`), and the file it read (`ino`), so a feed
 * replaced or truncated under it is read again from the start instead of compared against a fold of another file.
 */
export type FeedMemo = { cursor: number; ino?: number; fold: FeedFold };

/** A fold of nothing: what a process that has read no feed starts from. */
export const freshMemo = (): FeedMemo => ({ cursor: 0, fold: freshFold() });

/** Where the fold keeps what a line is about, derived the same from a v0 line and a v1 one. */
const foldKey = (involved: Involved): string => `${involved.kind}/${involved.name}`;

/** Where the fold counts a step's one-shots: what the line is about, and the try it belongs to. */
const shotKey = (involved: Involved, tried: number | undefined): string => `${involved.name}#${tried ?? 0}`;

/** The reason `line` names, its own where it has one, else the word's by the table. */
const reasonOfLine = (line: FeedLine, involved: Involved): Reason => line.reason ?? reasonOf(line, involved.kind);

/** A run and every step and one-shot of it taken out of the fold: what a `removed` line says the store no longer has. */
function forget(fold: FeedFold, run: string): void {
  fold.said.delete(foldKey({ kind: 'Run', name: run }));
  for (const key of [...fold.said.keys()]) if (key.startsWith(`Step/${run}/`)) fold.said.delete(key);
  for (const key of [...fold.shots.keys()]) if (key.startsWith(`${run}/`)) fold.shots.delete(key);
}

/**
 * Each run's line folded onto what came before, keyed by what it is about (`involvedOf`), so a feed of v0 lines and one of v1 lines fold
 * to the same state: the last word said of each run and step wins, a `removed` forgets a run and everything of it, and a one-shot goes to
 * its own count and never to a step's last word. A daemon's line is no run's. Pure.
 */
export function foldFeed(fold: FeedFold, lines: readonly FeedLine[]): FeedFold {
  for (const l of lines.filter(isRunLine)) {
    const involved = involvedOf(l);
    const reason = reasonOfLine(l, involved);
    if (reason === 'ToolDenied') {
      const key = shotKey(involved, l.try);
      fold.shots.set(key, (fold.shots.get(key) ?? 0) + 1);
      continue;
    }
    if (reason === 'Removed' && involved.kind === 'Run') {
      forget(fold, involved.name);
      continue;
    }
    fold.said.set(foldKey(involved), { word: l.word, ...(l.note !== undefined ? { note: l.note } : {}) });
  }
  return fold;
}

/**
 * Whether the feed owes no line for `b`, having said `a` of it last: the same word and the same note — or, of a run at rest, the same word,
 * whatever the note, since a note moving on a run nothing moves is a change of wording.
 */
const same = (a: FeedSaid | undefined, b: FeedSaid, atRest: boolean): boolean =>
  a !== undefined && a.word === b.word && (atRest || a.note === b.note);

/** The word and the note of a said, as a line carries them. */
const saidKeys = (said: FeedSaid): { word: string; note?: string } => ({
  word: said.word,
  ...(said.note !== undefined ? { note: said.note } : {}),
});

/**
 * The one-shots a pass owes the feed for what `words` says the run's steps were denied: one line for each denial the feed does not hold
 * already, with the `call` denied and the `try` it belongs to as fields of its own. Pure.
 *
 * **The count is read off the feed, not remembered.** A denial has no stamp of its own in the runtime's journal, so what identifies one
 * is the step, its try, and its place among that try's denials; the fold counts the lines already written under that step and that try
 * (`shots`), and this writes the rest, in the order the runtime journalled them. So a pass writes a denial once however many passes read
 * it, and a restarted daemon, which reads the whole feed, writes it neither again nor never.
 */
function denialLines(fold: FeedFold, at: string, run: string, words: FeedWords): RunLine[] {
  const out: RunLine[] = [];
  const walked = new Map<string, number>();
  for (const d of words.denials ?? []) {
    const involved: Involved = { kind: 'Step', name: `${run}/${d.step}` };
    const key = shotKey(involved, d.try);
    const nth = walked.get(key) ?? 0;
    walked.set(key, nth + 1);
    if (nth < (fold.shots.get(key) ?? 0)) continue;
    out.push(
      upgraded({
        at,
        run,
        step: d.step,
        word: `${DENIED}${d.call}`,
        note: `try ${d.try}`,
        involved,
        labels: words.steps.find((s) => s.name === d.step)?.labels ?? { run, step: d.step },
        call: d.call,
        try: d.try,
      }) as RunLine,
    );
  }
  return out;
}

/**
 * The lines a pass owes the feed: one for each run and each step whose word or note is not what the feed said of it last — a run the feed
 * has never named says each of its words once — one one-shot for each denial the feed does not hold yet (`denialLines`), and one `removed`
 * for each run the feed still names that the store no longer has. Pure.
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
  const line = (run: string, step: string | undefined, said: FeedSaid, labels: FeedLabels): RunLine =>
    upgraded({
      at,
      run,
      ...(step !== undefined ? { step } : {}),
      ...saidKeys(said),
      involved: step === undefined ? { kind: 'Run', name: run } : { kind: 'Step', name: `${run}/${step}` },
      labels,
    }) as RunLine;
  const out: RunLine[] = [];
  for (const [id, words] of now) {
    const atRest = words.atRest === true;
    const runLabels = words.labels ?? { run: id };
    if (!same(fold.said.get(`Run/${id}`), words.run, atRest)) out.push(line(id, undefined, words.run, runLabels));
    for (const s of words.steps)
      if (!same(fold.said.get(`Step/${id}/${s.name}`), s, atRest))
        out.push(line(id, s.name, s, s.labels ?? { ...runLabels, step: s.name }));
    out.push(...denialLines(fold, at, id, words));
  }
  for (const key of fold.said.keys()) {
    const id = key.startsWith('Run/') ? key.slice('Run/'.length) : undefined;
    if (id !== undefined && !now.has(id) && !unjudged.has(id)) out.push(line(id, undefined, { word: REMOVED }, { run: id }));
  }
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
export type FeedWords = {
  run: FeedSaid;
  steps: Array<FeedSaid & { name: string; labels?: FeedLabels }>;
  atRest?: true;
  labels?: FeedLabels;
  denials?: readonly FeedDenial[];
};

/**
 * One call a step's sessions were denied, as a pass read it off the task's view: the step, the try it belongs to (from 1, as the task's
 * attempts are ordered), and the call in the runtime's words (`denialText`). What a `ToolDenied` one-shot is written from
 * (`denialLines`), in the order the runtime journalled them.
 */
export type FeedDenial = { step: string; try: number; call: string };

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
 * What a step's sessions were denied is no part of its word: each denial is a one-shot signal of its own (`denialLines`), written once
 * per denial, and `labelled.denials` is what the pass read of them.
 *
 * @param closeoutOf How each step signed off, as `listing` was handed it: a step that signed off blocked says what it needs beside its
 *   word.
 * @param labelled The labels of the run and of each of its steps, from the one source a filing's labels come from (`stepLabels`), and the
 *   calls its steps were denied so far. The labels have one writer, the pass that files the steps: nothing here decides what a label is.
 */
export function feedWords(
  l: Listing,
  run: Pick<Run, 'pruned' | 'hold'>,
  { status }: Pick<Assessment, 'status'>,
  closeoutOf: (step: string) => Closeout | { error: string } | undefined = () => undefined,
  labelled: { run?: FeedLabels; step?: (step: string) => FeedLabels; denials?: readonly FeedDenial[] } = {},
): FeedWords {
  const onYou = onYouWords(l);
  return {
    ...(labelled.run ? { labels: labelled.run } : {}),
    ...(labelled.denials?.length ? { denials: labelled.denials } : {}),
    run: {
      word: `${status}${run.pruned ? ' (pruned)' : ''}`,
      ...(run.hold && status !== 'cancelled'
        ? { note: holdWord(l.holding ?? [], run.hold) }
        : onYou.length
          ? { note: `waiting on you: ${onYou.join(', ')}` }
          : {}),
    },
    steps: l.steps.map((s) => {
      const note = [needsNote(closeoutOf(s.name)), s.note].filter(Boolean).join(' · ');
      const labels = labelled.step?.(s.name);
      return {
        name: s.name,
        word: l.slot && s.status === slotWord(l.slot) ? SLOT_WAIT : shownStatus(s),
        ...(note ? { note } : {}),
        ...(labels ? { labels } : {}),
      };
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

/** The refusal of a cursor `nemia feed` or `nemia watch` does not take: a second, or anything but a whole number of bytes. */
export const cursorTakes = (verb: 'feed' | 'watch'): string =>
  `nemia ${verb} takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: nemia ${verb} [cursor]${verb === 'watch' ? ' [--json] [--wake] [--wake-word <word>]...' : ''}`;
