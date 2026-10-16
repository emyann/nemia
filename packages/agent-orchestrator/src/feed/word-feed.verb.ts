/**
 * What a pass judged of one run, in the feed's words (`wordFeed`): the listing `nemia ls` prints, worded for the feed (`feedWords`), with
 * the labels a filing gives the run and each of its steps, and the calls their sessions have been denied so far.
 *
 * A controller of the feed, called by the tick's pass (`advance.verb.ts`): the pass gathers, this words, and `emitFeed` writes. It reads
 * what the pass already read — the engine's views, the run's record, the person's answers — and asks the runtime nothing of its own.
 */
import { listing } from '../list/list.ts';
import { feedPhase, feedWords, type FeedDenial, type FeedWords } from './index.ts';
import { closeoutOf, saidCount, waitingOf } from '../views/views.verb.ts';
import { engineWord } from '../views/views-words.ts';
import { runStore } from '../record/files.store.ts';
import { denialText } from '../runtime-client.ts';
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
export function wordFeed(run: Run, r: PassReads, assessed: Assessment, admission: Admitted, checkout: CheckoutHold | undefined): FeedWords {
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
    },
  );
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
