/**
 * The verbs that answer a run — `wf decide`, `wf retry`, `wf approve`, `wf round` and `wf accept` — as their flags and help: what each takes,
 * read off the command line.
 */
import {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  approvalWordsRefusal,
  budgetRefusal,
  messageRefusal,
  parseGlobs,
  type RetryHow,
  type RetryMode,
} from '../runner.ts';
import { usage, amountOf } from './flags.ts';

export const DECIDE_HELP = `wf decide <runId> [--sensitive <globs>]

What the run produced, and the choice it leaves you. It reports facts and runs nothing. On a run waiting
on you, after the run's verdicts and before each step's closeout:

  touched   what each result branch changed against the run's base: files and lines by workspace
            package or top-level directory, then, each only when true, the agent-facing files and
            the check-affecting ones
  lesson    whether the run changed a file where the next agent reads, or that it wrote nothing there
  in full   the whole diff of the check-affecting files: what a change could edit to make its check pass

and beside each step's check, what its session consumed — used, cost — or that nobody measured it, then
its timeline: for each try's session and each try's check, when it was filed, spawned and ended (UTC), how
long it queued for a slot and how long it ran; after the steps, each round's and the run's totals. Under
each step, before its closeout, what a person said to its sessions while they ran (wf say), with when.
Under a gated step's name, its gate: approved, when and with what words — or awaiting approval, with the
wf approve that lets what follows be filed and the wf retry --message that sends it back.

Last, the result: where each branch stands against the base branch — on it, ahead by N commits, gone —
and then what is left to decide. A workflow whose last step is an ending, gated, says in its own prose
what happens when the work is done; that prose is printed with the wf approve that runs it and the wf
retry --message that sends the work back. A workflow with no such step ends by handing you a branch, and
the git commands are printed instead: ship it, drop it. Neither is run.

  --sensitive <globs>  comma-separated globs whose changed files are printed in full instead, for this
                       screen; the touched lines still say which files are check-affecting

  check-affecting, the default --sensitive:  ${CHECK_AFFECTING.join(', ')}
  agent-facing:                              ${AGENT_FACING.join(', ')}
  where the next agent reads:                ${LESSON.join(', ')}, and <workspace>/docs/ for each
                                             npm workspace in the base's package.json — not any docs/

A workspace glob is read as npm reads it, ./packages/* as packages/*. One with ** is named on the screen,
and a file still counts once: in the outermost package on its way, and as a lesson only in its docs/.

A glob is a path from the repository root: * and ? stay within a directory, ** crosses any number of
them (a leading **/ crosses none as well), and a trailing / takes everything below.`;

/** `wf decide`'s one flag: `--sensitive`, once, with at least one glob. Anything else is refused before a run is read. */
export function decideHow(argv: string[]): { sensitive?: string[] } {
  let sensitive: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== '--sensitive')
      usage(`wf decide does not take ${arg}. It takes the run and, at most once, --sensitive <globs> (wf decide --help).`);
    if (sensitive) usage('wf decide takes --sensitive once: put every glob in it, comma-separated, as in --sensitive "src/**,*.json".');
    const value = argv[++i];
    const globs = value === undefined || value.startsWith('--') ? [] : parseGlobs(value);
    if (!globs.length)
      usage(
        '--sensitive takes the globs whose changed files to print in full, comma-separated: wf decide <runId> --sensitive "src/**,*.json".',
      );
    sensitive = globs;
  }
  return { sensitive };
}

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
