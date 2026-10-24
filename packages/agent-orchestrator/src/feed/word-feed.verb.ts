/**
 * What a pass judged of one run, in the feed's words (`wordFeed`): the listing `nemia ls` prints, worded for the feed (`feedWords`), with
 * the labels a filing gives the run and each of its steps, and the calls their sessions have been denied so far.
 *
 * A controller of the feed, called by the tick's pass (`advance.verb.ts`): the pass gathers, this words, and `emitFeed` writes. It reads
 * what the pass already read — the engine's views, the run's record, the person's answers — and asks the runtime nothing of its own.
 */
import { listing } from '../list/list.ts';
import { feedPhase, feedWords, LINE_WORDS, type FeedCloseout, type FeedDenial, type FeedWords, type Once } from './index.ts';
import { closeoutOf, closeoutTold, saidCount, waitingOf } from '../views/views.verb.ts';
import { engineWord } from '../views/views-words.ts';
import { runStore } from '../record/files.store.ts';
import { denialText, type TaskView } from '../runtime-client.ts';
import { taskTryOf, turnTryOf, type Run } from '../record/record.ts';
import { holdsOf, type ParentRun, type Wait } from '../wait/wait.ts';
import { runLabels, stepLabels } from '../telemetry/telemetry.ts';
import type { Assessment } from '../tick/assess.ts';
import type { CheckoutHold, RunSlot } from '../cap/cap.ts';
import type { PassReads } from '../tick/file.verb.ts';
import { driftWords } from '../revisions/revisions.ts';
import type { Behind } from '../revisions/pin.verb.ts';

/** What `wordFeed` reads of the pass's admission (`Admission` in advance.verb.ts): who the run waits on, the slot that holds it, and the
 * runs it is held until. */
type Admitted = { waiting: Wait[]; held: RunSlot | undefined; parent: (id: string) => ParentRun };

/**
 * The feed's words for the run and each step (`feedWords`), off what the pass read before it filed anything: `behind` is what the pass
 * read of a pinned run's next filing against its pins (`behindNow`), offered as a one-shot (`behindOf`).
 */
export function wordFeed(
  run: Run,
  r: PassReads,
  assessed: Assessment,
  admission: Admitted,
  checkout: CheckoutHold | undefined,
  lifted?: string,
  behind: readonly Behind[] = [],
): FeedWords {
  const { views, steps } = r;
  return feedWords(
    listing({
      steps,
      run,
      phaseOf: (taskId) => feedPhase(engineWord(views)(taskId)),
      closeoutOf: (name) => closeoutOf(views, run, name),
      askedCloseout: r.asked,
      verdictOf: r.verdictOf,
      asks: r.asks,
      roundAsks: r.roundAsks,
      answers: runStore.asks.answers(run.id),
      waits: admission.waiting,
      saidTo: saidCount(views, run),
      spendOf: r.spendOf,
      slot: admission.held,
      standings: [],
      checkout,
      waitingOf: waitingOf(views),
      holds: holdsOf(run, admission.parent),
    }),
    run,
    assessed,
    (name) => closeoutOf(views, run, name),
    {
      run: runLabels(run),
      step: (name) => {
        const step = steps.find((s) => s.name === name);
        return step ? stepLabels(run, step) : { run: run.id, step: name };
      },
      denials: denialsOf(run, r),
      acts: [...actsOf(run), ...behindOf(behind)],
      faults: faultsOf(run, r),
      closeouts: closeoutsOf(run, r),
      ...(run.hold ? { held: run.hold.at } : {}),
      ...(lifted !== undefined ? { lifted } : {}),
    },
  );
}

/**
 * Every act a person took on `run`, as the pass reads it off the record: each approval at a gate (`nemia approve`), keyed by the step and
 * the try it opens, and the call-off (`nemia cancel`), keyed by the moment it was asked. Each carries the person's own moment in its note,
 * which is what tells one occurrence from another — the line's own `at` is the pass's, as a denial's is.
 *
 * Each fact is already on the record as the pass read it, composed on read from the person's own file and never written into the record
 * (`readRun`): so the feed keeps its one writer, the daemon, and no verb is touched. The hold is not here — it is answered by its put and
 * its lift together (`holdOnce`), off `FeedWords.held`, since `nemia hold --off` leaves only an absence to read.
 *
 * It is the whole of what a person has done, not what is new: the feed's own lines say which have been written already (`oncePast`), so
 * the pass carries nothing between passes and a restarted daemon writes an act neither again nor never.
 */
function actsOf(run: Run): Once[] {
  return [
    ...(run.approvals ?? []).map((a): Once => ({
      step: a.step,
      word: LINE_WORDS.Approved,
      note: `try ${a.try} · at ${a.at}`,
      try: a.try,
    })),
    ...(run.cancelledAt !== undefined ? [{ word: LINE_WORDS.CancelAsked, note: `at ${run.cancelledAt}` }] : []),
  ];
}

/**
 * A pinned run whose next filing would take other revisions than its pins, said as one line about the run (`revisions behind`), offered on
 * every pass that reads it so: which kinds are behind are in the note (`driftWords`, with the first characters of the content's digest),
 * since `kind` is a selector's own key. The note is what tells one drift from another (`oncePast`), so the line is written once per
 * drift, and a new edit writes one more, though two edits nobody resolved read as the one next number. None where nothing is behind.
 */
function behindOf(behind: readonly Behind[]): Once[] {
  const note = behind.map((b) => `${driftWords(b)} (${b.hash.slice(0, BEHIND_DIGEST)})`).join(' · ');
  return behind.length ? [{ word: LINE_WORDS.RevisionsBehind, note }] : [];
}

/** How many characters of a content's digest a `revisions behind` note carries: enough to tell two edits of one kind apart. */
const BEHIND_DIGEST = 8;

/**
 * The two ends of the runtime's that are the workflow layer's news, in the workflow layer's own words: a spawn its harness refused, so
 * nothing started, and a session the runtime lost. **This table is the only place in the package's feed code that names either of the
 * runtime's words** — nothing is passed through, and the words above it are the owner's (`LINE_WORDS`).
 *
 * The rest of an attempt's ends are no news of their own: what they came to is the step's own word, which the feed already says.
 *
 * Keyed by the attempt's own `reason` as the client types it (`AttemptEnd`), never by `string`: a reason renamed in the runtime fails this
 * typecheck here, as it does at the two sibling readers that compare the literal (`views/took.ts`, `status/status.ts`). Typed loosely, a
 * rename would answer `undefined` for every attempt and both signals would vanish with a green suite, since a test plants the reason by
 * hand rather than taking it from the runtime's type.
 */
type AttemptEnd = NonNullable<TaskView['state']['attempts'][number]['reason']>;

const FAULTS: Partial<Record<AttemptEnd, string>> = {
  unstartable: LINE_WORDS.SpawnFailed,
  lost: LINE_WORDS.SessionLost,
};

/**
 * Every fault the runtime journalled of `run`'s steps, as the pass read their views: one per attempt that ended for a reason `FAULTS`
 * translates, of the step and the try its task was filed for (`taskTryOf`, from 1), in the order the runtime journalled them — each
 * attempt of the step's task in order, and nothing of an attempt still running.
 *
 * Two attempts of one try lost are two occurrences, told apart by being two and counted off the feed's own lines (`oncePast`), as a call
 * denied twice in one try is. Neither waits on a person, by the table (`REASONS`): the step's own status is what wakes you.
 */
function faultsOf(run: Run, r: PassReads): Once[] {
  const out: Once[] = [];
  for (const step of r.steps) {
    const view = r.views.get(run.steps[step.name]?.taskId ?? '');
    const tried = taskTryOf(run, step.name);
    for (const attempt of view?.state.attempts ?? []) {
      const word = attempt.reason == null ? undefined : FAULTS[attempt.reason];
      if (word !== undefined) out.push({ step: step.name, word, note: `try ${tried}`, try: tried });
    }
  }
  return out;
}

/**
 * Every call the sessions of `run`'s steps have been denied, as the pass read their views: the step, the try its task was filed for
 * (`taskTryOf`, from 1) and the call in the runtime's words (`denialText`), in the order the runtime journalled them — each attempt of
 * the step's task in order, ended or not, and each denial of it.
 *
 * It is the whole of what the step's task was denied, not what is new: the feed's own lines say which have been written already
 * (`denialLines`), so the pass carries nothing between passes and a restarted daemon writes a denial neither again nor never. An earlier
 * task's denials were said on the passes it was the current one, and the try that filed the task is part of what counts them — the try
 * the task was filed for, never the try the step has since reached, or a recheck would say every denial of that task again.
 */
function denialsOf(run: Run, r: PassReads): FeedDenial[] {
  const out: FeedDenial[] = [];
  for (const step of r.steps) {
    const view = r.views.get(run.steps[step.name]?.taskId ?? '');
    const tried = taskTryOf(run, step.name);
    for (const attempt of view?.state.attempts ?? [])
      for (const denial of attempt.denials ?? []) out.push({ step: step.name, try: tried, call: denialText(denial) });
  }
  return out;
}

/**
 * The closeout each of `run`'s steps gave on its task's current turn, as the pass read their views (`closeoutTold`): the step, the try the
 * turn was given (`turnTryOf`), what came back and what the run read of it — a closeout, or `parseCloseout`'s error. A step whose turn
 * gave none has none here.
 *
 * It is every closeout standing, not what is new: the feed's own lines say which have been written already (`oncePast`, under the step and
 * its try), so the pass carries nothing between passes and a restarted daemon logs a closeout neither again nor never. A try's turn gives
 * one closeout, and the pass that reads it before the step moves on is the pass that files what comes next, so none is passed over.
 */
function closeoutsOf(run: Run, r: PassReads): FeedCloseout[] {
  const out: FeedCloseout[] = [];
  for (const step of r.steps) {
    const told = closeoutTold(r.views, run, step.name);
    if (told) out.push({ step: step.name, try: turnTryOf(run, step.name), ...told });
  }
  return out;
}
