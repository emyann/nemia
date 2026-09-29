/**
 * The verbs that answer a run — `wf retry`, `wf approve`, `wf round`, `wf accept` and `wf say` — their flags, read off the command line, and
 * what each prints.
 */
import {
  accept,
  approvalWordsRefusal,
  approve,
  budgetRefusal,
  budgetWord,
  messageRefusal,
  readRun,
  retry,
  round,
  saidLines,
  say,
  stepsOf,
  type RetryHow,
  type RetryMode,
} from '../runner.ts';
import { HELP, usage, amountOf, type Engine } from './flags.ts';

/** `wf retry`'s own flags: after `--message`, one of these alone is an answer left out, not an answer. */
const RETRY_FLAGS: readonly string[] = ['--nudge', '--fresh', '--recheck', '--model', '--message', '--budget'];

/**
 * `wf retry`'s one choice of how, read off its flags: at most one way, `--model` with a name, and `--message` at most once, with what
 * to tell the step — refused, before a run is read, when it is empty or rides on `--recheck` (`messageRefusal`). The argument after
 * `--message` is the answer whatever it starts with, since an answer about a flag names it ("--flag stays"): only one of this verb's own
 * flags, alone, reads as the answer left out, and `--message=<answer>` carries even that.
 */
export function retryHow(argv: string[]): RetryHow {
  const given: Array<{ mode: RetryMode; model?: string }> = [];
  let message: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--nudge' || arg === '--fresh' || arg === '--recheck') given.push({ mode: arg.slice(2) as RetryMode });
    else if (arg === '--model') {
      const model = argv[++i];
      if (!model || model.startsWith('--')) usage('--model takes the model to run the new session on: wf retry <runId> <step> --model <m>');
      given.push({ mode: 'fresh', model });
    } else if (arg === '--message' || arg.startsWith('--message=')) {
      if (message !== undefined)
        usage('wf retry takes --message once: put the whole answer in it, quoted — wf retry <runId> <step> --message "<answer>".');
      const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
      if (text === undefined) return usage('--message takes what to tell the step, quoted: wf retry <runId> <step> --message "<answer>"');
      if (arg === '--message' && RETRY_FLAGS.includes(text)) {
        usage(
          `--message takes what to tell the step, and ${text} is one of wf retry's own flags, so the answer was left out: wf retry <runId> <step> --message "<answer>". If ${text} is the whole answer, give it as --message=${text}.`,
        );
      }
      message = text;
    } else if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined)
        usage('wf retry takes --budget once: the cap to raise the step to, in dollars — wf retry <runId> <step> --budget <amount>.');
      budget = amountOf(
        arg === '--budget' ? argv[++i] : arg.slice('--budget='.length),
        "the most the step's tries may cost together, in dollars, above what they have cost",
        'wf retry <runId> <step> --budget <amount>',
      );
    } else
      usage(
        `wf retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck, and --message "<answer>" and --budget <amount>.`,
      );
  }
  if (given.length > 1) usage('wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.');
  const how: RetryHow = {
    ...(given[0] ?? { mode: 'nudge' }),
    ...(message !== undefined ? { message } : {}),
    ...(budget !== undefined ? { budget } : {}),
  };
  const wrong = messageRefusal(how) ?? budgetRefusal(how);
  if (wrong) usage(wrong);
  return how;
}

/**
 * `wf approve`'s one flag, after the run and the step: `--message "<words>"`, or `--message=<words>`, once — the next argument is the words
 * whatever it starts with, as `wf retry`'s is — refused before a run is read when it is missing or empty (`approvalWordsRefusal`). Anything
 * else is refused.
 */
export function approveHow(argv: string[]): string | undefined {
  let message: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== '--message' && !arg.startsWith('--message=')) {
      usage(
        `wf approve does not take ${arg}. It takes the run, the step, and --message "<words>": wf approve <runId> <step> [--message "<words>"].`,
      );
    }
    if (message !== undefined)
      usage('wf approve takes --message once: put all your words in it, quoted — wf approve <runId> <step> --message "<words>".');
    const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
    if (text === undefined)
      usage('--message takes the words that go with your approval, quoted: wf approve <runId> <step> --message "<words>".');
    message = text;
  }
  const wrong = approvalWordsRefusal(message);
  if (wrong) usage(wrong);
  return message;
}

/** `wf round`'s arguments after the run: the step that closes the loop, when there is more than one, and `--budget <amount>`, at most once each. */
export function roundHow(argv: string[]): { stepName?: string; budget?: number } {
  let stepName: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined)
        usage(
          'wf round takes --budget once: the cap to raise the steps of the loop over their budget to, in dollars — wf round <runId> [<step>] --budget <amount>.',
        );
      budget = amountOf(
        arg === '--budget' ? argv[++i] : arg.slice('--budget='.length),
        'the most a step of the loop may cost together, in dollars, above what it has cost',
        'wf round <runId> [<step>] --budget <amount>',
      );
    } else if (arg.startsWith('--') || stepName !== undefined) {
      usage(
        'wf round takes the run and, when the run has more than one loop, the step that closes the one to go round: wf round <runId> [<step>] — and --budget <amount>, to raise the cap of a step of the loop over its budget.',
      );
    } else stepName = arg;
  }
  return { ...(stepName !== undefined ? { stepName } : {}), ...(budget !== undefined ? { budget } : {}) };
}

/**
 * `wf accept`'s arguments after the run: the step that closes the loop, when there is more than one, and `--message "<why>"`, at most once
 * each — the next argument is the words whatever it starts with, as `wf approve`'s is. Words that are missing or empty are refused where
 * every other refusal of this verb is (`acceptAsk`), which knows the run and can name it.
 */
export function acceptHow(argv: string[]): { stepName?: string; message?: string } {
  let stepName: string | undefined;
  let message: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--message' || arg.startsWith('--message=')) {
      if (message !== undefined)
        usage('wf accept takes --message once: put all your words in it, quoted — wf accept <runId> [<step>] --message "<why>".');
      const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
      if (text === undefined)
        usage('--message takes why the work is good enough with its findings open, quoted: wf accept <runId> [<step>] --message "<why>".');
      message = text;
    } else if (arg.startsWith('--') || stepName !== undefined) {
      usage(
        'wf accept takes the run and, when the run has more than one loop, the step that closes the one to end: wf accept <runId> [<step>] --message "<why>".',
      );
    } else stepName = arg;
  }
  return { ...(stepName !== undefined ? { stepName } : {}), ...(message !== undefined ? { message } : {}) };
}

/** `wf retry`: another try of a step asked for, the next tick files it once, and the file the ask is written to. */
export async function retryVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, stepName] = rest;
  if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
  const { ask, file, stopFirst } = await retry(e, runId, stepName, retryHow(rest.slice(2)), { stopBlocked: true });
  const how = `${ask.model ? `--model ${ask.model}` : `--${ask.mode}`}${ask.budget !== undefined ? `, --budget ${ask.budget}` : ''}`;
  const then = stopFirst
    ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped'
    : 'the next tick files it, once';
  console.log(`${runId}  asked: try ${ask.try} of ${stepName} (${how})${ask.message !== undefined ? ', with your answer' : ''} — ${then}`);
  console.log(`   ${file}`);
  return;
}

/** `wf approve`: a step's try approved at its gate, what the next tick files because of it, and the file the approval is written to. */
export async function approveVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, stepName, ...more] = rest;
  if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
  const { approval, file } = await approve(e, runId, stepName, approveHow(more));
  const after = readRun(runId);
  const waited = stepsOf(after).some((s) => s.after.includes(stepName));
  const files = !after.steps[stepName]?.taskId;
  console.log(
    `${runId}  approved: try ${approval.try} of ${stepName}${approval.message !== undefined ? ', with your words' : ''} — ${files ? `the next tick files ${stepName}` : waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`,
  );
  console.log(`   ${file}`);
  return;
}

/** `wf round`: another round of a loop out of rounds asked for, its cap raised with `--budget`, and the file the ask is written to. */
export async function roundVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, ...more] = rest;
  if (!runId || runId.startsWith('--')) return console.log(HELP);
  const { stepName, budget } = roundHow(more);
  const { ask, file } = await round(e, runId, stepName, budget);
  console.log(
    `${runId}  asked: round ${ask.round} of ${ask.step}'s loop${ask.budget !== undefined ? `, its cap raised to ${budgetWord(ask.budget)}` : ''} — the next tick files it, once`,
  );
  console.log(`   ${file}`);
  return;
}

/** `wf accept`: a loop out of rounds closed on its last try as it stands, its findings open, and the file the acceptance is written to. */
export async function acceptVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, ...more] = rest;
  if (!runId || runId.startsWith('--')) return console.log(HELP);
  const { stepName, message } = acceptHow(more);
  const { acceptance, file } = await accept(e, runId, stepName, message);
  const waited = stepsOf(readRun(runId)).some((s) => s.after.includes(acceptance.step));
  console.log(
    `${runId}  accepted: try ${acceptance.try} of ${acceptance.step} as it stands, its findings open — ${waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`,
  );
  console.log(`   ${file}`);
  return;
}

/**
 * `wf say`: words to a step's session, journalled on its task, and printed as `wf decide` prints them. It takes every word after the step
 * as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 */
export async function sayVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, stepName, ...words] = rest;
  if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
  const told = await say(e, runId, stepName, words.join(' '));
  const { at, attempt, text } = told.said;
  console.log(
    `${runId}  said to ${stepName}, try ${told.try}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${told.taskId}: wf decide ${runId} prints it under the step`,
  );
  for (const line of saidLines([{ at, attempt, text, try: told.try }])
    .slice(1)
    .flatMap((l) => l.split('\n')))
    console.log(`   ${line}`);
  return;
}
