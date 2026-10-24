/** The engine's `follow` verb, and what refuses it: the session of a task's latest attempt, followed live by its harness. */
import type { Harnessed } from './harnessed.ts';
import { Effect, Schema } from 'effect';
import { fold, nameFor, type Event, type State } from '../core/index.ts';
import type { JournalError } from '../core/engine/index.ts';

/** A session `follow` will not follow, and why: a task the journal has no record of, a harness that does not stream. */
export class FollowRefused extends Schema.TaggedError<FollowRefused>()('FollowRefused', {
  message: Schema.String,
}) {}

/**
 * `follow` over the engine's journal and runners: refuses, in this order, a task the journal has no record of and a harness without
 * `follow`. Then the session of the task's latest attempt, by the name the engine chose for it, followed by its harness: its state
 * first, then each moment once and in order, until it is over; `undefined` before an attempt. Observes nothing.
 */
export const followVerbOf = (
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  harnessOf: (state: State) => Harnessed,
) =>
  Effect.fn('Engine.follow')(function* (taskId: string) {
    const refuse = (message: string) => Effect.fail(new FollowRefused({ message }));
    const events = yield* read(taskId);
    if (!events.length) return yield* refuse(`\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`);
    const state = fold(taskId, events);
    const { name: harness, runner } = harnessOf(state);
    const follow = runner.follow;
    if (!follow)
      return yield* refuse(
        `the \`${harness}\` harness does not stream its sessions: read its transcript again (\`transcript\`) for what is new.`,
      );
    const last = state.attempts.at(-1);
    return last ? follow(nameFor(taskId, last.n)) : undefined;
  });
