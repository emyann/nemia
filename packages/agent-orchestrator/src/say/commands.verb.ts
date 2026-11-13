/** `nemia say`, an entry of the command table: words to a step's session, journalled on its task, or kept for its first try (`sayRun`). */
import { Effect, Schema } from 'effect';
import { RunSay, type SaidAfter, SAY_WORDS } from 'objects';
import type { Speaker } from '../chat/chat.ts';
import { type Said } from './say.ts';
import { sayRun } from './say.verb.ts';
import type { Served } from '../command/entry.verb.ts';

/** Who calls: the person, with no session's token, or a session's agent by its token (`Caller`, `sessionCaller`). */
const SayCaller = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('person') }),
  Schema.Struct({ kind: Schema.Literal('agent'), agent: Schema.String, factory: Schema.NullOr(Schema.String) }),
]);

/**
 * What `nemia say` takes: the run, the step, the words and who they say they are from as the api is sent them (`objects`' `RunSay`),
 * and the caller the request is, which the api reads off the request's token and the CLI off `WF_SESSION_TOKEN` — required, so no path
 * takes the person by default.
 */
export const SayInput = Schema.Struct({ runId: Schema.String, step: Schema.String, caller: SayCaller, ...RunSay.fields });
export type SayInput = typeof SayInput.Type;

/** The engine's `said` entry as the answer says it: when, on which attempt, the words, and what they came after (null where none). */
const pickSaid = ({ at, attempt, text, after }: Said) => ({ at, attempt, text, after: after ?? null });

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them; or, to a step not filed yet,
 * kept for its first try (`kept: true`, on no task, `taskId: null`, the attempt its first). It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
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
    const told = yield* sayRun(runId, step, given, from === undefined ? { caller } : { caller, from });
    const answer =
      'kept' in told
        ? { ...told.kept, attempt: 1, after: null, try: told.try, taskId: null, kept: true as const }
        : { ...pickSaid(told.said), try: told.try, taskId: told.taskId };
    return told.from.kind === 'agent' ? { ...answer, from: told.from, words: given } : answer;
  }),
};
