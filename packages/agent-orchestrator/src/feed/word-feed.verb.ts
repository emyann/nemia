/**
 * What a pass judged of one run, in the feed's words (`wordFeed`): the listing `nemia ls` prints, worded for the feed (`feedWords`), with
 * the labels a filing gives the run and each of its steps, and the calls their sessions have been denied so far.
 *
 * A controller of the feed, called by the tick's pass (`advance.verb.ts`): the pass gathers, this words, and `emitFeed` writes. It reads
 * what the pass already read — the engine's views, the run's record, the person's answers — and asks the runtime nothing of its own.
 */
import { listing } from '../list/list.ts';
import { feedPhase, feedWords, SIGNAL_WORDS, type FeedDenial, type FeedWords, type Once } from './index.ts';
import { closeoutOf, saidCount, waitingOf } from '../views/views.verb.ts';
import { engineWord } from '../views/views-words.ts';
import { runStore } from '../record/files.store.ts';
import { denialText, type TaskView } from '../runtime-client.ts';
import { taskTryOf, type Run } from '../record/record.ts';
import { holdsOf, type ParentRun, type Wait } from '../wait/wait.ts';
import { runLabels, stepLabels } from '../telemetry/telemetry.ts';
import type { Assessment } from '../tick/assess.ts';
import type { CheckoutHold, RunSlot } from '../cap/cap.ts';
import type { PassReads } from '../tick/file.verb.ts';

/** What `wordFeed` reads of the pass's admission (`Admission` in advance.verb.ts): who the run waits on, the slot that holds it, and the
 * runs it is held until. */
type Admitted = { waiting: Wait[]; held: RunSlot | undefined; parent: (id: string) => ParentRun };

/** The feed's words for the run and each step (`feedWords`), off what the pass read before it filed anything. */
export function wordFeed(
  run: Run,
  r: PassReads,
  assessed: Assessment,
  admission: Admitted,
  checkout: CheckoutHold | undefined,
  lifted?: string,
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
      acts: actsOf(run),
      faults: faultsOf(run, r),
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
      word: SIGNAL_WORDS.Approved,
      note: `try ${a.try} · at ${a.at}`,
      try: a.try,
    })),
    ...(run.cancelledAt !== undefined ? [{ word: SIGNAL_WORDS.CancelAsked, note: `at ${run.cancelledAt}` }] : []),
  ];
}

/**
 * The two ends of the runtime's that are the workflow layer's news, in the workflow layer's own words: a spawn its harness refused, so
 * nothing started, and a session the runtime lost. **This table is the only place in the package's feed code that names either of the
 * runtime's words** — nothing is passed through, and the words above it are the owner's (`SIGNAL_WORDS`).
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
  unstartable: SIGNAL_WORDS.SpawnFailed,
  lost: SIGNAL_WORDS.SessionLost,
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
