/**
 * The runners of the run's verbs that answer a step: `nemia retry` (the Run's `retry`), `nemia approve` (`approve`) and `nemia say`
 * (`say`). A person's `--answer`s are resolved here against the questions the step's current try asks (`answers.ts`), `--budget
 * <step>=<amount>` read into the `budgets` the api takes, and who says the words is the caller the request is, by the token it presents,
 * which the api reads. Each prints the lines the old path printed, from what the api answers.
 */
import {
  APPROVE_WORDS,
  type Args,
  dollarsOf,
  RETRY_WORDS,
  type RunApproved,
  type RunAsked,
  type RunRetry,
  type RunSaid,
  SAY_WORDS,
} from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { amountArg, listArg, namespaceOfRun, said, switchArg, textArg } from '../requests.ts';
import { runOf } from './act.ts';
import { answersOf } from './answers.ts';

/** Dollars as the store prints them: two places, or three figures under a cent. */
export const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A cap in dollars as a person wrote it: whole where it is whole. */
const budgetWord = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

/**
 * The step `command` acts on: the one typed; else, for a run's only loop, the step that loops, read off the run's frozen steps; refused,
 * exit 2, naming the step to type, where the run has no loop or more than one.
 */
async function stepOf(command: string, args: Args, namespace: string, typed: string): Promise<string> {
  const step = textArg(args, 'step');
  if (step !== undefined) return step;
  const name = runOf(args);
  const run = await asked(command, (c) => c.runs.get({ params: { namespace, name } }));
  const loops = run.spec.steps.filter((s) => s.loop !== null).map((s) => s.name);
  const only = loops.length === 1 ? loops[0] : undefined;
  if (only !== undefined) return only;
  throw new Refused(
    loops.length
      ? `${name} has ${loops.length} loops (${loops.join(', ')}): name the step — ${typed.replace('<step>', loops[0] ?? '<step>')}.`
      : `${name} has no loop to name for you: name the step — ${typed}.`,
  );
}

/** The way a retry was asked, as its line says it: `--model m`, else `--continue`, `--fresh` or `--recheck`. */
const modeWord = (mode: string, model: string | undefined): string => (model !== undefined ? `--model ${model}` : `--${mode}`);

/** What `nemia retry` printed of the ask it wrote: the round asked for, or the try, how, with what, and when it is filed. */
export const retryLines = (
  { try: tryNo, file, stopFirst, step: looping, round: n, budget }: RunAsked,
  typed: {
    runId: string;
    step: string;
    round: boolean;
    mode: string;
    model?: string;
    budget?: number;
    message?: string;
    answered: boolean;
  },
): string[] => {
  if (typed.round)
    return [
      `${typed.runId}  asked: round ${n ?? ''} of ${looping ?? typed.step}'s loop${budget !== undefined ? `, its cap raised to ${budgetWord(budget)}` : ''} — the next tick files it, once`,
      `   ${file}`,
    ];
  const how = `${modeWord(typed.mode, typed.model)}${typed.budget !== undefined ? `, --budget ${typed.budget}` : ''}`;
  const then = stopFirst
    ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped'
    : 'the next tick files it, once';
  const words = typed.answered ? ', with your answers' : typed.message !== undefined ? ', with your answer' : '';
  return [`${typed.runId}  asked: try ${tryNo ?? ''} of ${typed.step} (${how})${words} — ${then}`, `   ${file}`];
};

/** `nemia retry <runId> [<step>] [--continue | --fresh | --model <m> | --recheck | --round] [--answer]... [--message] [--budget]`. */
export async function retry(args: Args): Promise<number> {
  const command = RETRY_WORDS.name;
  const runId = runOf(args);
  const round = switchArg(args, 'round');
  const namespace = await namespaceOfRun(command, runId);
  const step = await stepOf(command, args, namespace, `nemia retry ${runId} <step> --round`);
  const typedAnswers = listArg(args, 'answer');
  const mode = textArg(args, 'mode') ?? 'continue';
  const model = textArg(args, 'model');
  const message = textArg(args, 'message');
  const budget = amountArg(args, 'budget');
  const way: RunRetry['mode'] = mode === 'fresh' || mode === 'recheck' ? mode : 'continue';
  const payload = {
    mode: way,
    ...(model !== undefined ? { model } : {}),
    ...(round ? { round } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(round ? {} : await answersOf(command, runId, step, typedAnswers)),
  };
  const answer = await asked(command, (c) => c.runs.retry({ params: { namespace, name: runId, step }, payload }));
  said(
    retryLines(answer, {
      runId,
      step,
      round,
      mode: payload.mode,
      ...(model !== undefined ? { model } : {}),
      ...(budget !== undefined ? { budget } : {}),
      ...(message !== undefined ? { message } : {}),
      answered: typedAnswers.length > 0,
    }),
  );
  return 0;
}

/**
 * The budgets `--budget <step>=<amount>` gives, each the step's name and dollars above zero (`dollarsOf`); refused, exit 2, showing the
 * line to type. Which steps they may name is the approval's.
 */
export function budgetsOf(typed: readonly string[], runId: string, step: string): { step: string; usd: number }[] {
  return typed.map((value) => {
    const at = value.lastIndexOf('=');
    const name = at > 0 ? value.slice(0, at).trim() : '';
    const usd = at > 0 ? dollarsOf(value.slice(at + 1).trim()) : undefined;
    if (!name || usd === undefined)
      throw new Refused(
        `--budget ${value} is not a step and an amount: give the step after the gate and its cap in dollars above zero, in digits — nemia approve ${runId} ${step} --budget <step>=<amount>, like --budget implement=60.`,
      );
    return { step: name, usd };
  });
}

/** What the next tick files once a step is approved, in words. */
const thenWords = ({ step, next }: RunApproved): string =>
  next === 'step'
    ? `the next tick files ${step}`
    : next === 'waiting'
      ? 'the next tick files what waits on it'
      : 'nothing waits on it: its run can be decided';

/** What `nemia approve` printed: the loop accepted as it stands, or the try approved, with what, each cap it set, and the file. */
export const approveLines = (approved: RunApproved, runId: string, answered: boolean): string[] => {
  const { step, try: tryNo, message, file, loop, caps } = approved;
  if (loop) return [`${runId}  accepted: try ${tryNo} of ${step} as it stands, its findings open — ${thenWords(approved)}`, `   ${file}`];
  const words = answered ? ', with your answers' : message !== null ? ', with your words' : '';
  return [
    `${runId}  approved: try ${tryNo} of ${step}${words} — ${thenWords(approved)}`,
    ...(caps ?? []).map(
      (c) => `   cap  ${c.step} ${dollars(c.usd)}${c.above && c.workflow !== null ? ` (above the workflow's ${dollars(c.workflow)})` : ''}`,
    ),
    `   ${file}`,
  ];
};

/** `nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"]`. */
export async function approve(args: Args): Promise<number> {
  const command = APPROVE_WORDS.name;
  const runId = runOf(args);
  const namespace = await namespaceOfRun(command, runId);
  const step = await stepOf(command, args, namespace, `nemia approve ${runId} <step>`);
  const typedAnswers = listArg(args, 'answer');
  const typedBudgets = listArg(args, 'budget');
  const message = textArg(args, 'message');
  const payload = {
    ...(message !== undefined ? { message } : {}),
    ...(typedBudgets.length ? { budgets: budgetsOf(typedBudgets, runId, step) } : {}),
    ...(await answersOf(command, runId, step, typedAnswers)),
  };
  const approved = await asked(command, (c) => c.runs.approve({ params: { namespace, name: runId, step }, payload }));
  said(approveLines(approved, runId, typedAnswers.length > 0));
  return 0;
}

/** `text` in a fence longer than any run of backticks inside it, so what it quotes cannot close it. */
const fenced = (text: string, info: string): string[] => {
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((ticks) => ticks.length + 1)));
  return [`${fence}${info}`, text, fence];
};

/** What `nemia say` printed: the words kept for a first try, or said to which try and journalled where; then the words, fenced. */
export const sayLines = ({ at, attempt, text, try: tryNo, taskId, kept }: RunSaid, runId: string, step: string): string[] => [
  kept
    ? `${runId}  kept for ${step}'s first try, at ${at} — not delivered: no session of ${step} runs yet, and its first try's brief carries the words`
    : `${runId}  said to ${step}, try ${tryNo ?? ''}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${taskId ?? ''}: nemia decide ${runId} prints it under the step`,
  ...fenced(text, 'text')
    .flatMap((l) => l.split('\n'))
    .map((line) => `   ${line}`),
];

/**
 * `nemia say <runId> <step> <words...>`: the words to the step's running session, from the caller the token says. `--as`, retired, never
 * reaches here: its words' check refuses it (`SAY_WORDS`).
 */
export async function say(args: Args): Promise<number> {
  const command = SAY_WORDS.name;
  const runId = runOf(args);
  const step = textArg(args, 'step') ?? '';
  const namespace = await namespaceOfRun(command, runId);
  const payload = { text: textArg(args, 'text') ?? '' };
  said(sayLines(await asked(command, (c) => c.runs.say({ params: { namespace, name: runId, step }, payload })), runId, step));
  return 0;
}
