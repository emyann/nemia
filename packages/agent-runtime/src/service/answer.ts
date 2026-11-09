/**
 * The engine's `answerAsk` verb, and what refuses it: a call of a running session's that is held open waiting on a person
 * (`Sighting.asks`) given the person's answer, through its harness, so the call returns it to the session as its own result. It
 * journals nothing — the next pass reads the session's asks as it reads any other fact of it — and so it is no lifecycle verb: no
 * entry of it is on the record, and no state is read from one.
 *
 * It is a verb written to a session (`src/service/written-verb.ts`), as `say` and `interrupt` are.
 */
import type { Harnessed } from './harnessed.ts';
import { Effect, Schema } from 'effect';
import { isLive, type Event, type State } from '../core/index.ts';
import { Journal, type JournalError } from '../core/engine/index.ts';
import type { Runner } from '../harness/index.ts';
import { handedOver, sessionReached, type WrittenVerb } from './written-verb.ts';

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

/** The person's answer to an ask: the ask by the id the task's view gave it, and each question's answer by the question's own text. */
export type Answering = { id: string; answers: Record<string, string> };

/** What an ask answered came to: when it was answered, and of which attempt. Nothing of it is journalled. */
export type AskAnswered = { at: string; attempt: number };

/** Why the harness `name` is refused an answer to an ask: it declares none, or its runner holds no call open. */
export const noCallHeld = (name: string): string =>
  `the \`${name}\` harness holds no call open for a person to answer: a question of its session's is denied where no person is there.`;

/** `answerAsk`'s refusal, in its words. */
const refused = (message: string) => new AnswerRefused({ message });

/** `answerAsk` as a verb written to a session: its reach is the runner's `answer`, which only a harness that holds a call open has. */
const ANSWER: WrittenVerb<AnswerRefused, AnswerUnsent, NonNullable<Harnessed['runner']['answer']>> = {
  capability: 'answerAsk',
  refused,
  unsent: (message, cause) => new AnswerUnsent({ message, cause }),
  reachOf: ({ runner }) => runner.answer,
  unreached: ({ name }) => noCallHeld(name),
  looked: 'harness',
  undone: 'answered',
  open: {
    settled: ', so no call of it is waiting on a person',
    unstarted: 'no call of it waiting on a person. Answer its asks once its view shows one.',
  },
};

/**
 * `answerAsk` over the engine's journal (`read`, `go`), its runners and harnesses, and the harness a task runs on (`harnessOf`), as
 * `Engine.answerAsk` describes it.
 */
export const answerVerbOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.Effect<A, E>,
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  harnessOf: (state: State) => Harnessed,
) =>
  Effect.fn('Engine.answerAsk')(function* (taskId: string, given: Answering) {
    const { reach: take, last, name, sighting } = yield* sessionReached({ go, read, harnessOf }, ANSWER, taskId);
    if (!isLive(sighting.state)) {
      return yield* Effect.fail(
        refused(`\`${taskId}\`'s session is \`${sighting.state}\` on its harness, so no call of it is waiting on a person.`),
      );
    }
    if (!(sighting.asks ?? []).some((ask) => ask.id === given.id)) {
      return yield* Effect.fail(
        refused(
          `\`${taskId}\` has no ask \`${given.id}\` waiting on a person: read its asks again, and answer one its session still holds open.`,
        ),
      );
    }
    yield* go(take({ name, sessionId: sighting.sessionId }, given)).pipe(
      handedOver(ANSWER, (words) => `${name} was not answered (${words}). Nothing was changed; ask again.`),
    );
    return { at: new Date().toISOString(), attempt: last.n } satisfies AskAnswered;
  });
