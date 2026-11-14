/** `nemia cancel`, an entry of the command table: what a run has in flight asked to stop, and nothing more filed (`cancelRun`). */
import { Actor, CANCEL_WORDS } from 'objects';
import { cancelRun } from './cancel.verb.ts';
import type { CancelPlan } from './cancel.ts';
import { Effect, Schema } from 'effect';
import type { Served } from '../command/entry.verb.ts';

/**
 * What `nemia cancel` takes: the run's id, which the api reads off its path; and who calls it off (`actor`, objects' `Actor`), which the
 * api hands of its caller and the cancellation keeps — none from the command line.
 */
export const CancelInput = Schema.Struct({ runId: Schema.String, actor: Schema.optionalKey(Actor) });
export type CancelInput = typeof CancelInput.Type;

/**
 * `nemia cancel`: what a run has in flight asked to stop, and nothing more filed; the plan it followed, a run already over included. The
 * api serves it as the Run's `cancel` (`POST /api/namespaces/:namespace/runs/:name/cancel`), so a seat that started a run from outside
 * can stop it. It answers who called the run off (`actor`, the run's `cancelledBy`) where the cancellation that stands says.
 */
export const CANCEL: Served<{ id: string; plan: CancelPlan; actor?: Actor }, CancelInput> = {
  ...CANCEL_WORDS,
  input: CancelInput,
  handler: Effect.fnUntraced(function* ({ runId, actor }: CancelInput) {
    const { run, plan } = yield* cancelRun(runId, actor);
    return { id: run.id, plan, ...(run.cancelledBy ? { actor: run.cancelledBy } : {}) };
  }),
};
