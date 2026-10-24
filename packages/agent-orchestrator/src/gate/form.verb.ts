/**
 * Which yes `nemia approve` gives (decision 7): the approval of a step at its gate (`approveRun`), or the end of a loop out of rounds as it
 * stands (`acceptRun`), which `nemia accept` gave. Read off the run as it stands, so the command and admission read it alike.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { retryable } from '../retry/index.ts';
import { hasGate } from '../status/status.ts';
import { approveFormOf } from './form.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';

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
