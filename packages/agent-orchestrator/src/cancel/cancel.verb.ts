/**
 * `nemia cancel`: call a run off. It stops what the run has in flight, then writes the person's own file, never the run's record, which the
 * tick owns. A controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a
 * service (`cancelRun`, over `EngineService`), run by a caller with `runWith`. It reads the run and adopts what a pass filed and never
 * wrote down as the tick does (`readAndAdopt`).
 */
import { Effect } from 'effect';
import type { Actor } from 'objects';
import { EngineService } from '../runtime-client.ts';
import { type Run } from '../record/record.ts';
import { cancelPlan, type CancelPlan } from './cancel.ts';
import { readAndAdopt } from '../adopt/run-adopt.verb.ts';
import { closeWaitingTasks } from '../tick/held.verb.ts';
import { stopAsked } from '../tick/held.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

export type Cancelled = { run: Run; plan: CancelPlan };

/**
 * Call a run off: stop what it has in flight, and write down that it is cancelled. Returns the run and the plan, whose `stop` is what it
 * ASKED to stop: `e.stop` records the intent, and the engine carries it out on its next tick and confirms on the one after.
 *
 * Both halves matter. Stopping the session ends the work running now; the mark on the run is what stops the NEXT step being filed, which
 * the engine cannot know to do — it has tasks, not runs. The stop is asked for BEFORE the run is marked: if the engine refuses, the run is
 * left uncancelled and asking again does both, where the other order would leave a run that reads as cancelled while its session runs on.
 *
 * A check, a try, a round or a step filed by a pass that died before writing the run down is in flight too: it is adopted first
 * (`readAndAdopt`), so it is stopped at once, and is on the record only in memory. A task held open that waits for a person's
 * word — a gate, a blocked sign-off — runs nothing, so it is closed as it signed, not stopped (`closeWaitingTasks`); a close the engine
 * refuses is the next pass's to make again.
 *
 * Never writes the run's json: a tick may be halfway through a pass over the same run. The cancellation goes in a file only this verb
 * writes (the Run door's `runs.cancel`), and `advanceRun` enforces it on every pass, which also covers a step filed after the stop list was
 * taken. A task the engine's record says was asked to stop is not asked again, and a stop it refuses — the task settled, or was asked to
 * stop, since the read — is nothing left to do (`stopAsked`). Fails with a refusal a read threw; dies of anything else, any other failure
 * of the engine included (`tried`, `awaited`).
 *
 * Who calls it off (`actor`, the caller where it is known) is written with the time, and the first cancellation's is kept as its time is:
 * the run answered is read again after the mark, so its `cancelledAt` and `cancelledBy` are the ones that stand.
 */
export const cancelRun = Effect.fn('cancel')(function* (id: string, actor?: Actor) {
  const e = yield* EngineService;
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const { read } = yield* readAndAdopt(e, run);
  const { views } = read;
  const plan = cancelPlan(read);
  if (plan.kind === 'finished') return { run, plan } satisfies Cancelled;

  for (const { taskId } of plan.stop) {
    if (!views.get(taskId)?.state.stopRequested) yield* stopAsked(e, taskId);
  }
  yield* closeWaitingTasks(e, run, views);
  if (plan.kind === 'already-cancelled') return { run, plan } satisfies Cancelled;

  const at = yield* (yield* RunDoor).runs.cancel(RunId.read(id), actor);
  const { cancelledBy } = yield* (yield* RunDoor).runs.read(RunId.read(id));
  return { run: { ...run, cancelledAt: at, ...(cancelledBy ? { cancelledBy } : {}) }, plan } satisfies Cancelled;
});
