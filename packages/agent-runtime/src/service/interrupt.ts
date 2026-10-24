/**
 * The engine's `interrupt` verb, and what refuses it: the turn the running session of a task's attempt in flight is in ended through
 * its harness, the session left open to hear the next words. It journals nothing — the next pass reads the session's state as it reads
 * any other — and so it is no lifecycle verb: no entry of it is on the record, and no state is read from one.
 */
import type { Harnessed } from './harnessed.ts';
import { Cause, Effect, Schema } from 'effect';
import { fold, idleOf, isLive, nameFor, phaseWordOf, type Attempt, type Event, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';

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

/**
 * The attempt a verb written from outside a session acts on, read off the journal. Refused, in words that say what to do, for a task
 * settled, asked to stop, not started, or whose last attempt has ended.
 */
export const openAttemptOf = (taskId: string, state: State): { last: Attempt } | { refused: string } => {
  const last = state.attempts.at(-1);
  if (state.settled) return { refused: `\`${taskId}\` has settled (${state.settled}): no session of it is running, and no turn is in it.` };
  if (state.stopRequested) return { refused: `\`${taskId}\` has been asked to stop: its session is being stopped, not steered.` };
  if (!last) return { refused: `\`${taskId}\` has not started an attempt yet, so there is no turn to end.` };
  if (last.ended !== null) return { refused: `\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`.` };
  return { last };
};

/** What failed, in words, off a cause: its error's message, or the value itself. */
const wordsOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
    const refuse = (message: string) => Effect.fail(new InterruptRefused({ message }));
    const events = yield* read(taskId);
    if (!events.length) return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
    const state = fold(taskId, events);
    const { name: harness, runner } = harnessOf(state);
    const end = runner?.interrupt;
    if (!end) {
      return yield* refuse(
        `the \`${harness}\` harness cannot end a turn without ending its session: only a session on streaming input takes it. ${STOP}`,
      );
    }
    const open = openAttemptOf(taskId, state);
    if ('refused' in open) return yield* refuse(open.refused);
    const { last } = open;
    const name = nameFor(taskId, last.n);
    const unsent = (message: (e: unknown) => string) =>
      Effect.catchCause((cause: Cause.Cause<unknown>) => {
        const e = Cause.squash(cause);
        return Effect.fail(new InterruptUnsent({ message: message(e), cause: e }));
      });
    const observed = yield* go(runner.observe).pipe(
      unsent(
        (e) => `the \`${harness}\` harness could not be read (${wordsOf(e)}), so ${name} could not be found. Nothing was sent; ask again.`,
      ),
    );
    const sighting = observed.get(name);
    if (!sighting) {
      return yield* refuse(
        `\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
      );
    }
    if (!isLive(sighting.state)) {
      return yield* refuse(
        `\`${taskId}\`'s session is \`${phaseWordOf(sighting.state)}\` on its harness, not running: there is no turn in it. ${STOP}`,
      );
    }
    if (idleOf(state, sighting)) {
      return yield* refuse(
        `\`${taskId}\`'s session is open and waiting for its next words, not answering: there is no turn to end. ${STOP}`,
      );
    }
    yield* go(end({ name, sessionId: sighting.sessionId })).pipe(
      Effect.catchCause((cause: Cause.Cause<unknown>): Effect.Effect<never, InterruptRefused | InterruptUnsent> => {
        const e = Cause.squash(cause) as { refused?: boolean };
        if (e.refused === true) return Effect.fail(new InterruptRefused({ message: wordsOf(e) }));
        return Effect.fail(
          new InterruptUnsent({ message: `${name}'s turn was not ended (${wordsOf(e)}). Nothing was changed; ask again.`, cause: e }),
        );
      }),
    );
    return { at: new Date().toISOString(), attempt: last.n };
  });

/** What an interrupt came to: when the turn was asked to end, and of which attempt. Nothing of it is journalled. */
export type Interrupted = { at: string; attempt: number };
