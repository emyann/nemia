/** `nemia say`, an entry of the command table: words to a step's session, journalled on its task, or kept for its first try (`sayRun`). */
import { Effect, Schema } from 'effect';
import { RunSay, type SaidAfter, SAY_WORDS } from 'objects';
import { fromRefusal, type Speaker } from '../chat/chat.ts';
import { Invalid } from '../refusal/refusal.ts';
import { type Said } from './say.ts';
import { sayRun } from './say.verb.ts';
import type { Served } from '../command/entry.verb.ts';

/** Who calls: the person, or an agent by a session's token or a standing one minted for it (`Caller`, `sessionCaller`). */
const SayCaller = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person') }),
  Schema.Struct({ kind: Schema.Literal('agent'), agent: Schema.String, factory: Schema.NullOr(Schema.String) }),
]);

/**
 * What `nemia say` takes: the run, the step and the words as the api is sent them (`objects`' `RunSay`, whose `from` is retired: one
 * naming an agent is refused, any other read no further), and the caller the request is, which the api reads off the request's token —
 * required, so no path takes the person by default.
 */
export const SayInput = Schema.Struct({ runId: Schema.String, step: Schema.String, caller: SayCaller, ...RunSay.fields });
export type SayInput = typeof SayInput.Type;

/** The engine's `said` entry as the answer says it: when, on which attempt, the words, and what they came after (null where none). */
const pickSaid = ({ at, attempt, text, after }: Said) => ({ at, attempt, text, after: after ?? null });

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them; or, to a step not filed yet,
 * kept for its first try (`kept: true`, on no task, `taskId: null`, the attempt its first). It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse. The words are the caller's (`sayRun`): a
 * `from` naming an agent is refused `Invalid` (`fromRefusal`), naming the token an agent speaks with instead.
 */
export const SAY: Served<
  {
    at: string;
    attempt: number;
    text: string;
    after: { kind: SaidAfter; id: string } | null;
    try: number;
    taskId: string | null;
    kept?: true;
    from?: Speaker;
    words?: string;
  },
  SayInput
> = {
  ...SAY_WORDS,
  input: SayInput,
  handler: Effect.fnUntraced(function* ({ runId, step, text: given, caller, from }: SayInput) {
    const refused = fromRefusal(from);
    if (refused !== null) return yield* Effect.fail(new Invalid({ message: refused.message }));
    const told = yield* sayRun(runId, step, given, { caller });
    const answer =
      'kept' in told
        ? { ...told.kept, attempt: 1, after: null, try: told.try, taskId: null, kept: true as const }
        : { ...pickSaid(told.said), try: told.try, taskId: told.taskId };
    return told.from.kind === 'agent' ? { ...answer, from: told.from, words: given } : answer;
  }),
};
