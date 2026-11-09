/**
 * The engine's `interrupt` verb, and what refuses it: the turn the running session of a task's attempt in flight is in ended through
 * its harness, the session left open to hear the next words. It journals nothing — the next pass reads the session's state as it reads
 * any other — and so it is no lifecycle verb: no entry of it is on the record, and no state is read from one.
 */
import type { Harnessed } from './harnessed.ts';
import { Effect, Schema } from 'effect';
import { idleOf, isLive, type Event, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';
import { handedOver, sessionReached, type WrittenVerb } from './written-verb.ts';

/** A turn `interrupt` will not end, and why, in words that say what to do instead. Nothing was sent. */
export class InterruptRefused extends Schema.TaggedError<InterruptRefused>()('InterruptRefused', {
  message: Schema.String,
}) {}

/**
 * A turn `interrupt` could not reach, for a reason that may pass: a harness that could not be read, or one that did not take the
 * request. `cause` is what failed, when something did. Ask again.
 */
export class InterruptUnsent extends Schema.TaggedError<InterruptUnsent>()('InterruptUnsent', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/** What to do instead of ending a turn that cannot be ended. */
const STOP = 'Stop the task (`ae stop`) to end its session, or leave the turn to finish.';

/** Why the harness `name` is refused an interrupt: it declares none, or its runner has none. */
export const notInterruptible = (name: string): string =>
  `the \`${name}\` harness cannot end a turn without ending its session: only a session on streaming input takes it. ${STOP}`;

/** `interrupt`'s refusal, in its words. */
const refused = (message: string) => new InterruptRefused({ message });

/** `interrupt` as a verb written to a session: its reach is the runner's `interrupt`, which only a session on streaming input has. */
const INTERRUPT: WrittenVerb<InterruptRefused, InterruptUnsent, NonNullable<Harnessed['runner']['interrupt']>> = {
  capability: 'interrupt',
  refused,
  unsent: (message, cause) => new InterruptUnsent({ message, cause }),
  reachOf: ({ runner }) => runner.interrupt,
  unreached: ({ name }) => notInterruptible(name),
  looked: 'harness',
  undone: 'sent',
  open: { settled: ', and no turn is in it', unstarted: 'no turn to end.' },
};

/**
 * `interrupt` over the engine's journal (`read`, `go`), its runners and harnesses, and the harness a task runs on (`harnessOf`), as
 * `Engine.interrupt` describes it.
 */
export const interruptVerbOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>,
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  harnessOf: (state: State) => Harnessed,
) =>
  Effect.fn('Engine.interrupt')(function* (taskId: string) {
    const { state, reach: end, last, name, sighting } = yield* sessionReached({ go, read, harnessOf }, INTERRUPT, taskId);
    if (!isLive(sighting.state)) {
      return yield* Effect.fail(
        refused(`\`${taskId}\`'s session is \`${sighting.state}\` on its harness, not running: there is no turn in it. ${STOP}`),
      );
    }
    if (idleOf(state, sighting)) {
      return yield* Effect.fail(
        refused(`\`${taskId}\`'s session is open and waiting for its next words, not answering: there is no turn to end. ${STOP}`),
      );
    }
    yield* go(end({ name, sessionId: sighting.sessionId })).pipe(
      handedOver(INTERRUPT, (words) => `${name}'s turn was not ended (${words}). Nothing was changed; ask again.`),
    );
    return { at: new Date().toISOString(), attempt: last.n };
  });

/** What an interrupt came to: when the turn was asked to end, and of which attempt. Nothing of it is journalled. */
export type Interrupted = { at: string; attempt: number };
