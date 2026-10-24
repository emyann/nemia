/**
 * Which yes `nemia approve` gives (decision 7): the approval of a step at its gate (`approveRun`), or the end of a loop out of rounds as it
 * stands (`acceptRun`), which `nemia accept` gave. Read off the run as it stands, so the command and admission read it alike.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { retryable } from '../retry/index.ts';
import { hasGate } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';

/** The yes an approval gives: at a step's gate, or to a loop out of rounds. */
export type ApproveForm = 'gate' | 'loop';

/**
 * The yes `nemia approve` gives on `name` of `run`, given whether that step waits at its gate now (`atGate`, read only where it decides):
 * to a loop where no step is named — a step at its gate is always named — or where the step closes a loop and is gated at no step; at its
 * gate where it is gated and closes no loop, and where it is not there, which the gate's own refusal names. A step both gated and closing
 * a loop is approved at its gate while it waits there, and its loop ended otherwise. Pure.
 */
export function approveFormOf(
  steps: readonly Workflow[],
  run: Pick<Run, 'gates'>,
  name: string | undefined,
  atGate: () => boolean,
): ApproveForm {
  if (name === undefined) return 'loop';
  const step = steps.find((s) => s.name === name);
  if (step === undefined || !step.loop) return 'gate';
  if (!hasGate(step, run)) return 'loop';
  return atGate() ? 'gate' : 'loop';
}

/**
 * The yes `nemia approve` gives on `stepName` of the run `id` now (`approveFormOf`); for a run that is not there, as its name alone says,
 * and the verb it goes to refuses it.
 */
export const approveForm = Effect.fnUntraced(function* (id: string, stepName: string | undefined) {
  if (!(yield* tried(() => runStore.runs.exists(id)))) return approveFormOf([], {}, stepName, () => true);
  const run = yield* tried(() => runStore.runs.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const step = steps.find((s) => s.name === stepName);
  if (step === undefined || !step.loop || !hasGate(step, run)) return approveFormOf(steps, run, stepName, () => true);
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const status = retryable(
    step,
    run,
    phaseOf,
    closeoutReader(views, run),
    closeoutAsked(views),
    steps,
    harnessBlocked(views),
    spendReader(views),
    exitVerdicts(views, run),
  ).status;
  return approveFormOf(steps, run, stepName, () => status === 'awaiting approval');
});
