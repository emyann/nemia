/**
 * The engine's `answerAsk` verb, and what refuses it: a call of a running session's that is held open waiting on a person
 * (`Sighting.asks`) given the person's answer, through its harness, so the call returns it to the session as its own result. It
 * journals nothing — the next pass reads the session's asks as it reads any other fact of it — and so it is no lifecycle verb: no
 * entry of it is on the record, and no state is read from one.
 *
 * It is the verb of `src/service/interrupt.ts`'s shape, and reads the same open attempt (`openAttemptOf`).
 */
import { Cause, Effect, Schema } from 'effect';
import { fold, isLive, nameFor, phaseWordOf, type Event, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import { openAttemptOf } from './interrupt.ts';
import type { Runner } from '../harness/index.ts';
import type { SeamOps } from '../a2a/index.ts';
import type { HarnessConfig } from './options.ts';

/** An ask `answerAsk` will not answer, and why, in words that say what to do instead. Nothing was answered. */
export class AnswerRefused extends Schema.TaggedError<AnswerRefused>()('AnswerRefused', {
  message: Schema.String,
}) {}

/**
 * An ask `answerAsk` could not reach, for a reason that may pass: a harness that could not be read, or one that did not take the
 * answer. `cause` is what failed, when something did. Ask again.
 */
export class AnswerUnsent extends Schema.TaggedError<AnswerUnsent>()('AnswerUnsent', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/** What failed, in words, off a cause: its error's message, or the value itself. */
const wordsOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The person's answer to an ask: the ask by the id the task's view gave it, and each question's answer by the question's own text. */
export type Answering = { id: string; answers: Record<string, string> };

/** What an ask answered came to: when it was answered, and of which attempt. Nothing of it is journalled. */
export type AskAnswered = { at: string; attempt: number };

/**
 * `answerAsk` over the engine's journal (`read`, `go`), its runners and harnesses, and the harness a task runs on (`harnessOf`), as
 * `Engine.answerAsk` describes it.
 */
export const answerVerbOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>,
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  runners: Record<string, SeamOps>,
  harnesses: Record<string, HarnessConfig>,
  harnessOf: (state: State) => string,
) =>
  Effect.fn('Engine.answerAsk')(function* (taskId: string, given: Answering) {
    const refuse = (message: string) => Effect.fail(new AnswerRefused({ message }));
    const events = yield* read(taskId);
    if (!events.length) return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
    const state = fold(taskId, events);
    const harness = harnessOf(state);
    const runner = runners[harness];
    const take = runner?.answer;
    if (!take || !runner) {
      return yield* refuse(
        `the \`${harness}\` harness holds no call open for a person to answer: a question of its session's is denied where no person is there.`,
      );
    }
    const open = openAttemptOf(taskId, state);
    if ('refused' in open) return yield* refuse(open.refused);
    const name = nameFor(taskId, open.last.n);
    const observed = yield* go(runner.observe).pipe(
      Effect.catchCause((cause: Cause.Cause<unknown>) => {
        const e = Cause.squash(cause);
        const words = `the \`${harness}\` harness could not be read (${wordsOf(e)}), so ${name} could not be found. Nothing was answered; ask again.`;
        return Effect.fail(new AnswerUnsent({ message: words, cause: e }));
      }),
    );
    const sighting = observed.get(name);
    if (!sighting) {
      return yield* refuse(
        `\`${taskId}\`'s attempt ${open.last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
      );
    }
    if (!isLive(sighting.state)) {
      return yield* refuse(
        `\`${taskId}\`'s session is \`${phaseWordOf(sighting.state)}\` on its harness, so no call of it is waiting on a person.`,
      );
    }
    if (!(sighting.asks ?? []).some((ask) => ask.id === given.id)) {
      return yield* refuse(
        `\`${taskId}\` has no ask \`${given.id}\` waiting on a person: read its asks again, and answer one its session still holds open.`,
      );
    }
    yield* go(take({ name, sessionId: sighting.sessionId }, given)).pipe(
      Effect.catchCause((cause: Cause.Cause<unknown>): Effect.Effect<never, AnswerRefused | AnswerUnsent> => {
        const e = Cause.squash(cause) as { refused?: boolean };
        if (e.refused === true) return Effect.fail(new AnswerRefused({ message: wordsOf(e) }));
        return Effect.fail(
          new AnswerUnsent({ message: `${name} was not answered (${wordsOf(e)}). Nothing was changed; ask again.`, cause: e }),
        );
      }),
    );
    return { at: new Date().toISOString(), attempt: open.last.n } satisfies AskAnswered;
  });
