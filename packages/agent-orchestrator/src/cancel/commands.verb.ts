/** `nemia cancel`, an entry of the command table: what a run has in flight asked to stop, and nothing more filed (`cancelRun`). */
import { cancelRun } from './cancel.verb.ts';
import type { CancelPlan } from './cancel.ts';
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `nemia cancel`: what a run has in flight asked to stop, and nothing more filed; the plan it followed, a run already over included. */
export const CANCEL: Command<{ id: string; plan: CancelPlan }> = {
  name: 'cancel',
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
  only: { side: 'cli', why: 'the board offers no cancel: a person stops a run at the command line' },
  handler: Effect.fnUntraced(function* (args: Args) {
    const { run, plan } = yield* cancelRun(textOf(args, 'runId') ?? '');
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
