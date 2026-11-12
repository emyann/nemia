/**
 * `nemia retry`, an entry of the command table: another try of a step asked for, or another round of a loop out of rounds (`--round`),
 * and the file the ask is written to.
 */
import { refusing, renamed, requiring } from '../command/requests.verb.ts';
import { Effect, Schema } from 'effect';
import { RunRetry } from 'objects';
import { ANSWER_HELP, answerFlag, givenAnswers, recheckAnswerRefusal, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { messageRefusal, modeWord, type RetryHow } from './index.ts';
import { retryRun } from './retry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { roundRun } from '../round/round.verb.ts';
import { budgetRefusal } from '../status/status.ts';
import { budgetWord } from '../money/money.ts';
import { roundBudgetRefusal } from '../round/round.ts';
import { amountIn, commandLine, renamedValues, type Args } from '../command/command.ts';
import { checked, type Command } from '../command/entry.verb.ts';
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

/** The run's id and the step, as `nemia retry`, `nemia approve` and `nemia refresh` take them: no step for a run's only loop. */
const RUN_LOOP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'optional', kind: 'name' },
] as const;

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
 * `round` — with `answer`, the `--answer`s typed at the command line by number and letter.
 */
export const RetryInput = Schema.Struct({
  runId: Schema.String,
  step: Schema.optionalKey(Schema.String),
  ...RunRetry.fields,
  answer: Schema.optionalKey(Schema.Array(Schema.String)),
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
export const RETRY: Command<
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
  name: 'retry',
  served: [
    {
      endpoint: 'runs.retry',
      request: refusing('retry', ['answer'], requiring('step', 'nemia retry <runId> <step>', renamed({ runId: 'name' }))),
    },
  ],
  usage:
    '<runId> [<step>] [--continue | --fresh | --model <m> | --recheck | --round] [--answer <n>=<letter>]... [--message "<answer>"] [--budget <amount>]',
  help: [
    'try a step waiting on you again, once, on the next tick:',
    '--continue (default) continues its session, told what happened;',
    '--fresh a new session on its branch; --model <m> the same, on m;',
    '--recheck runs its check again, and files no session;',
    '--round: once more — a loop out of rounds goes round again, once,',
    'the step it loops to continued, then a new reviewer; the step is the',
    'one that closes the loop, left out where the run has one loop;',
    '--message "<answer>" goes into the try\'s brief, as ## Your answer:',
    'for a step that signed off blocked, the answer to its needs — or',
    'what you have to say to any step you try again; not with --recheck',
    'or --round. The next argument is the answer, whatever it starts with;',
    "an answer that is only one of these flags' names goes as --message=<answer>;",
    '--budget <amount>: for a step with a budget that waits on you, its',
    'cap raised to that many dollars, above its cap and what it has cost;',
    'with --round, the cap of a step of the loop over its budget;',
    ...ANSWER_HELP,
  ],
  spec: {
    positionals: RUN_LOOP,
    flags: [
      { flag: '--continue', kind: 'switch', sets: { mode: 'continue' }, way: true },
      { flag: '--fresh', kind: 'switch', sets: { mode: 'fresh' }, way: true },
      { flag: '--recheck', kind: 'switch', sets: { mode: 'recheck' }, way: true },
      {
        flag: '--model',
        kind: 'name',
        key: 'model',
        sets: { mode: 'fresh' },
        way: true,
        takes: '--model takes the model to run the new session on: nemia retry <runId> <step> --model <m>',
      },
      { flag: '--round', kind: 'switch', key: 'round', way: true },
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: '--message takes what to tell the step, quoted: nemia retry <runId> <step> --message "<answer>"',
        twice: 'nemia retry takes --message once: put the whole answer in it, quoted — nemia retry <runId> <step> --message "<answer>".',
      },
      answerFlag('retry'),
      {
        flag: '--budget',
        kind: 'amount',
        key: 'budget',
        takes: "the most the step's tries may cost together, in dollars, above what they have cost",
        form: 'nemia retry <runId> <step> --budget <amount>, or for a round nemia retry <runId> [<step>] --round --budget <amount>',
        twice: 'nemia retry takes --budget once: the cap to raise the step to, in dollars — nemia retry <runId> <step> --budget <amount>.',
      },
    ],
    defaults: { mode: 'continue' },
    unknown: (arg) =>
      `nemia retry does not take ${arg}. It takes one of --continue, --fresh, --model <m>, --recheck, --round, and --message "<answer>" and --budget <amount>.`,
    oneWay: 'nemia retry asks for one try, one way: pick one of --continue, --fresh, --model <m>, --recheck, --round.',
    apart: (flag) =>
      `--message takes what to tell the step, and ${flag} is one of nemia retry's own flags, so the answer was left out: nemia retry <runId> <step> --message "<answer>". If ${flag} is the whole answer, give it as --message=${flag}.`,
  },
  check: retryRefusal,
  writes: true,
  ticks: true,
  class: 'answer',
  only: { side: 'cli', why: "the api serves it as the Run's `retry` of `objects`' Api, calling this handler" },
  input: RetryInput,
  handler: Effect.fnUntraced(function* (input: RetryInput) {
    const home = yield* StoreRoot;
    const { answers, ...flags } = input;
    yield* checked(retryRefusal(flags) ?? askRefusal(input));
    const { runId, step } = input;
    const { hint } = renamedValues('retry', input);
    const hinted = hint === undefined ? {} : { hint };
    if (input.round === true) {
      yield* checked(roundBudgetRefusal(runId, input.budget));
      const { ask, file } = yield* roundRun(runId, step, input.budget);
      return { step: ask.step, round: ask.round, file, ...(ask.budget !== undefined ? { budget: ask.budget } : {}), ...hinted };
    }
    const at = step ?? '';
    const how = howOf(input);
    const typed = input.answer ?? [];
    const message =
      answers !== undefined
        ? { message: yield* givenAnswers(runId, at, answers, { note: how.message, home }) }
        : typed.length
          ? { message: yield* typedAnswers(runId, at, typed, { note: how.message }) }
          : {};
    const { ask, file, stopFirst } = yield* retryRun(runId, at, { ...how, ...message }, { stopBlocked: true }).pipe(
      Effect.provideService(StoreRoot, home),
    );
    return { try: ask.try, file, stopFirst, ...hinted };
  }),
  print({ try: tryNo, file, stopFirst, step: looping, round: n, budget }, input) {
    const { runId, step } = input;
    if (input.round === true)
      return [
        `${runId}  asked: round ${n} of ${looping}'s loop${budget !== undefined ? `, its cap raised to ${budgetWord(budget)}` : ''} — the next tick files it, once`,
        `   ${file}`,
      ];
    const ask = howOf(input);
    const how = `${modeWord(ask)}${ask.budget !== undefined ? `, --budget ${ask.budget}` : ''}`;
    const then = stopFirst
      ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped'
      : 'the next tick files it, once';
    const answered = input.answer?.length || input.answers?.length;
    return [
      `${runId}  asked: try ${tryNo} of ${step ?? ''} (${how})${answered ? ', with your answers' : ask.message !== undefined ? ', with your answer' : ''} — ${then}`,
      `   ${file}`,
    ];
  },
};
