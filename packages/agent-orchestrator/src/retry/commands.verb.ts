/**
 * `nemia retry`, an entry of the command table: another try of a step asked for, or another round of a loop out of rounds (`--round`),
 * and the file the ask is written to.
 */
import { Effect, Schema } from 'effect';
import { Actor, RunRetry, RETRY_WORDS } from 'objects';
import { givenAnswers, recheckAnswerRefusal, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { messageRefusal, type RetryHow } from './index.ts';
import { retryRun } from './retry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { roundRun } from '../round/round.verb.ts';
import { budgetRefusal } from '../status/status.ts';
import { roundBudgetRefusal } from '../round/round.ts';
import { amountIn, commandLine, renamedValues, type Args } from '../command/command.ts';
import { checked, type Served } from '../command/entry.verb.ts';
import { writerText as textOf } from '../yours/yours.ts';

/** What `nemia retry`'s how is read off: its parsed flags, or its typed input. */
type HowGiven = { readonly mode?: unknown; readonly model?: unknown; readonly message?: unknown; readonly budget?: unknown };

/** `nemia retry`'s how, off its arguments: its way, the model a fresh session runs on, the answer and the cap. */
function howOf({ mode, model, message, budget }: HowGiven): RetryHow {
  return {
    mode: mode === 'fresh' || mode === 'recheck' ? mode : 'continue',
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof budget === 'number' ? { budget } : {}),
  };
}

/** The refusal of `nemia retry --round` given what another round does not take: answers, words, or a way to try a step. */
function roundRefusal(args: Args): string | null {
  const line = commandLine(RETRY, args, { round: true, budget: amountIn(args, 'budget') });
  if (typedOf(args).length || textOf(args, 'message') !== undefined || textOf(args, 'model') !== undefined)
    return `nemia retry --round asks for another round of a loop, which takes no answers, words or model: ${line}. To try one step again with them, name it without --round: nemia retry <runId> <step> --message "<answer>".`;
  return null;
}

/** The refusal of `nemia retry` naming no step and no round: the step to try again, or `--round` for a loop's. */
function stepRefusal(args: Args): string | null {
  if (textOf(args, 'step') !== undefined) return null;
  const runId = textOf(args, 'runId') ?? '<runId>';
  return `nemia retry takes the step to try again: nemia retry ${runId} <step>. For another round of a loop out of rounds, say --round: nemia retry ${runId} [<step>] --round.`;
}

/**
 * What `nemia retry` takes: the run and the step (none for a run's only loop, with `round`), and the ask as the api is sent it
 * (`objects`' `RunRetry`) — its way, a fresh session's model, the words, a raise of its cap, a person's `answers` by title and label, or
 * `round` — with `answer`, the `--answer`s typed at the command line by number and letter; and who asks (`actor`, objects' `Actor`), which
 * the api hands of its caller and the ask keeps — none from the command line.
 */
export const RetryInput = Schema.Struct({
  runId: Schema.String,
  step: Schema.optionalKey(Schema.String),
  ...RunRetry.fields,
  answer: Schema.optionalKey(Schema.Array(Schema.String)),
  actor: Schema.optionalKey(Actor),
});
export type RetryInput = typeof RetryInput.Type;

/** The refusal of `nemia retry`'s arguments, before anything is read (`RETRY.check`). */
const retryRefusal = (args: Args): string | null =>
  args.round === true
    ? roundRefusal(args)
    : (stepRefusal(args) ??
      messageRefusal(howOf(args), commandLine(RETRY, args)) ??
      recheckAnswerRefusal(args, commandLine(RETRY, args)) ??
      budgetRefusal(howOf(args), commandLine(RETRY, args)));

/**
 * What a typed ask carries that the command line cannot say, refused before anything is read: a blank `model`, which `--model` refuses as
 * no name, a `model` beside a way that is not fresh (`--model` sets it), and a person's `answers` on a recheck, which files no session to
 * read them.
 */
function askRefusal({ mode, model, answers }: RetryInput): string | null {
  const how = howOf({ mode });
  if (model !== undefined && !model.trim())
    return '`model` is blank, and names no model to run the new session on. Name one, as `nemia retry --model <m>` does — "model": "<m>" — or leave it out for the model the step runs on.';
  if (model !== undefined && how.mode !== 'fresh')
    return `\`model\` names the model a new session runs on, as \`nemia retry --model <m>\` does, so it goes with "mode": "fresh" — "continue" continues a session on the model it has, and a recheck files no session. This ask said "${how.mode}".`;
  if (answers !== undefined && how.mode === 'recheck')
    return '`answers` are carried into the step\'s next try, as `nemia retry --message` carries an answer, and a recheck files no session to read them. Send them with "mode": "continue" or "fresh".';
  return null;
}

/**
 * `nemia retry`: another try of a step asked for, the next tick files it once, and the file the ask is written to; or, with `--round`,
 * another round of a loop out of rounds (what `nemia round` was, decision 7), its cap raised with `--budget`. A person's `answers` are
 * checked against the questions the step's current closeout asks and written as the try's message (`givenAnswers`), as `--answer`s are
 * (`typedAnswers`); a former spelling of the way is taken as the one it now is, and `hint` names the one to send.
 */
export const RETRY: Served<
  {
    try?: number;
    file: string;
    stopFirst?: boolean;
    step?: string;
    round?: number;
    budget?: number;
    hint?: string;
  },
  RetryInput
> = {
  ...RETRY_WORDS,
  input: RetryInput,
  handler: Effect.fnUntraced(function* (input: RetryInput) {
    const home = yield* StoreRoot;
    const { answers, actor, ...flags } = input;
    yield* checked(retryRefusal(flags) ?? askRefusal(input));
    const { runId, step } = input;
    const { hint } = renamedValues('retry', input);
    const hinted = hint === undefined ? {} : { hint };
    if (input.round === true) {
      yield* checked(roundBudgetRefusal(runId, input.budget));
      const { ask, file } = yield* roundRun(runId, step, input.budget, actor);
      return { step: ask.step, round: ask.round, file, ...(ask.budget !== undefined ? { budget: ask.budget } : {}), ...hinted };
    }
    const at = step ?? '';
    const how = howOf(input);
    const typed = input.answer ?? [];
    const message =
      answers !== undefined
        ? { message: yield* givenAnswers(runId, at, answers, { note: how.message, home, actor }) }
        : typed.length
          ? { message: yield* typedAnswers(runId, at, typed, { note: how.message, actor }) }
          : {};
    const { ask, file, stopFirst } = yield* retryRun(runId, at, { ...how, ...message }, { stopBlocked: true, actor }).pipe(
      Effect.provideService(StoreRoot, home),
    );
    return { try: ask.try, file, stopFirst, ...hinted };
  }),
};
