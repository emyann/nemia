/** `nemia cancel`, an entry of the command table: what a run has in flight asked to stop, and nothing more filed (`cancelRun`). */
import { renamed } from '../command/requests.verb.ts';
import { cancelRun } from './cancel.verb.ts';
import type { CancelPlan } from './cancel.ts';
import { Effect, Schema } from 'effect';
import type { Command } from '../command/entry.verb.ts';

/** What `nemia cancel` takes: the run's id, which the api reads off its path. */
export const CancelInput = Schema.Struct({ runId: Schema.String });
export type CancelInput = typeof CancelInput.Type;

/**
 * `nemia cancel`: what a run has in flight asked to stop, and nothing more filed; the plan it followed, a run already over included. The
 * api serves it as the Run's `cancel` (`POST /api/namespaces/:namespace/runs/:name/cancel`), so a seat that started a run from outside
 * can stop it.
 */
export const CANCEL: Command<{ id: string; plan: CancelPlan }, CancelInput> = {
  name: 'cancel',
  served: [{ endpoint: 'runs.cancel', request: renamed({ runId: 'name' }) }],
  usage: '<runId>',
  help: ['stop what it has in flight; file nothing more'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia cancel takes one run's id: not ${arg}.`,
  },
  writes: true,
  ticks: true,
  class: 'ask',
  input: CancelInput,
  handler: Effect.fnUntraced(function* ({ runId }: CancelInput) {
    const { run, plan } = yield* cancelRun(runId);
    return { id: run.id, plan };
  }),
  print: ({ id, plan }) => {
    if (plan.kind === 'finished') return [`${id}  already ${plan.status} — nothing to stop`];
    const head = plan.kind === 'already-cancelled' ? `${id}  already cancelled at ${plan.at}` : `${id}  cancelled`;
    if (plan.stop.length)
      return [head, `   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`];
    return plan.kind === 'cancel' ? [head, `   nothing was in flight — no further steps will be filed`] : [head];
  },
};
