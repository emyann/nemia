/**
 * `nemia cancel`: call a run off. It stops what the run has in flight, then writes the person's own file, never the run's record, which the
 * tick owns. A controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a
 * service (`cancelRun`, over `EngineService`), run by a caller with `runWith`. It adopts what a
 * pass filed and never wrote down as the tick does (`tick/advance.verb.ts`).
 */
import { Effect } from 'effect';
import { EngineService, tried } from '../runtime-client.ts';
import { type Run } from '../record/record.ts';
import { cancelPlan, type CancelPlan } from './cancel.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { adoptChecks, adoptRounds, adoptTries } from '../tick/advance.verb.ts';
import { closeWaitingTasks } from '../tick/held.verb.ts';
import { stopAsked } from '../tick/held.verb.ts';

export type Cancelled = { run: Run; plan: CancelPlan };

/**
 * Call a run off: stop what it has in flight, and write down that it is cancelled. Returns the run and the plan, whose `stop` is what it
 * ASKED to stop: `e.stop` records the intent, and the engine carries it out on its next tick and confirms on the one after.
 *
 * Both halves matter. Stopping the session ends the work running now; the mark on the run is what stops the NEXT step being filed, which
 * the engine cannot know to do — it has tasks, not runs. The stop is asked for BEFORE the run is marked: if the engine refuses, the run is
 * left uncancelled and asking again does both, where the other order would leave a run that reads as cancelled while its session runs on.
 *
 * A check, a try or a round filed by a pass that died before writing the run down is in flight too: it is adopted first (`adoptRounds`,
 * `adoptTries`, `adoptChecks`), so it is stopped at once, and is on the record only in memory. A task held open that waits for a person's
 * word — a gate, a blocked sign-off — runs nothing, so it is closed as it signed, not stopped (`closeWaitingTasks`); a close the engine
 * refuses is the next pass's to make again.
 *
 * Never writes the run's json: a tick may be halfway through a pass over the same run. The cancellation goes in a file only this verb
 * writes (`runStore.runs.cancel`), and `advanceRun` enforces it on every pass, which also covers a step filed after the stop list was
 * taken. A task the engine's record says was asked to stop is not asked again, and a stop it refuses — the task settled, or was asked to
 * stop, since the read — is nothing left to do (`stopAsked`). Fails with a refusal a read threw; dies of anything else, any other failure
 * of the engine included (`tried`, `awaited`).
 */
export const cancelRun = Effect.fn('cancel')(function* (id: string) {
  const e = yield* EngineService;
  const run = yield* tried(() => runStore.runs.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const { asks, rounds } = yield* tried(() => runStore.asks.read(id));
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  yield* adoptRounds(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), rounds, spendOf);
  yield* adoptTries(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks, spendOf);
  yield* adoptChecks(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), spendOf);

  const plan = cancelPlan(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks, rounds, spendOf);
  if (plan.kind === 'finished') return { run, plan } satisfies Cancelled;

  for (const { taskId } of plan.stop) {
    if (!views.get(taskId)?.state.stopRequested) yield* stopAsked(e, taskId);
  }
  yield* closeWaitingTasks(e, run, views);
  if (plan.kind === 'already-cancelled') return { run, plan } satisfies Cancelled;

  return { run: { ...run, cancelledAt: yield* tried(() => runStore.runs.cancel(id)) }, plan } satisfies Cancelled;
});
