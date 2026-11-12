/**
 * The words of the run's verbs that answer what waits on a person: `nemia retry` (another try of a step, or another round of a loop),
 * `nemia approve` (a step at its gate, or a loop out of rounds ended) and `nemia say` (words to a step's session); and the `--answer` flag
 * retry and approve take (`answerFlag`, `ANSWER_HELP`), whose values the client resolves into the `answers` the api takes. What a check
 * needs of the orchestrator (a message's or a budget's own refusal) is the handler's to refuse. Pure.
 */
import { type Args, type CommandWords, commandLine, type Flag } from './command.ts';

/** What `nemia retry`'s and `nemia approve`'s help say of `--answer`. */
export const ANSWER_HELP = [
  '--answer <n>=<letter>: answer question n, numbered as nemia decide',
  '<runId> prints them, with the option its letter names; once for each',
  'question: "<n>=a,c" chooses several where it takes several,',
  '"<n>=a: <words>" adds your own words, "<n>: <words>" says words',
  'alone; --message is then the note under your answers',
] as const;

/** The `--answer` flag of `nemia <verb>`, given once for each question: the command line's alone, the api taking `answers` as data. */
export const answerFlag = (verb: 'retry' | 'approve'): Flag => ({
  flag: '--answer',
  kind: 'text',
  key: 'answer',
  many: true,
  takes: `--answer takes a question's number and the letter of its option, as nemia decide <runId> prints them: nemia ${verb} <runId> <step> --answer 1=a`,
  only: { side: 'cli', why: 'the api takes the answers as data, by question title and option label (`answers`)' },
});

/** The `--answer` values typed, in the order given: none where none were. */
const typedOf = (args: Args): readonly string[] => {
  const value = args.answer;
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The refusal of `nemia retry --round` given what another round does not take: answers, words, or a model. */
function roundRefusal(args: Args): string | null {
  const budget = typeof args.budget === 'number' ? { budget: args.budget } : {};
  const line = commandLine(RETRY_WORDS, args, { round: true, ...budget });
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

/** The refusal of `--answer` beside `--recheck`, which files no session to read the answers, or null. */
function recheckAnswerRefusal(args: Args): string | null {
  const command = commandLine(RETRY_WORDS, args);
  return args.mode === 'recheck' && typedOf(args).length
    ? `--answer carries your answers into the try's brief, and --recheck files no session to read them — it runs the check again, and nothing else. Recheck without answers (${command} --recheck), or give them to a session: ${command} --answer <n>=<letter>.`
    : null;
}

/**
 * The refusal of `nemia retry`'s arguments before anything is read, of what needs nothing of the orchestrator: a round given answers,
 * words or a model; no step and no round; answers beside a recheck. A message or a budget a try does not take is the handler's to refuse.
 */
export const retryRefusal = (args: Args): string | null =>
  args.round === true ? roundRefusal(args) : (stepRefusal(args) ?? recheckAnswerRefusal(args));

/** `nemia retry`: another try of a step, or with `--round` another round of a loop out of rounds. */
export const RETRY_WORDS = {
  name: 'retry',
  served: [{ endpoint: 'runs.retry' }],
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
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'optional', kind: 'name' },
    ],
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
} as const satisfies CommandWords;

/** The refusal of an approval's words before anything is read: `--message` given only blanks. */
export const approveRefusal = (args: Args): string | null => {
  const message = textOf(args, 'message');
  return message !== undefined && !message.trim()
    ? `--message is empty, and an approval's words are handed to every step after the gate: empty, they tell them nothing. Say what you approve, or on what terms — ${commandLine(APPROVE_WORDS, args)} --message "<words>" — or leave --message out.`
    : null;
};

/** `nemia approve`: a step's try approved at its gate, or a loop out of rounds ended as it stands. */
export const APPROVE_WORDS = {
  name: 'approve',
  served: [{ endpoint: 'runs.approve' }],
  usage: '<runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"]',
  help: [
    'let a step waiting at its gate hand on: what waits on it is filed on',
    'the next tick, and every step after the gate is handed your words',
    'under ## Approved. To send it back instead, with what to change:',
    'nemia retry <runId> <step> --message "<objection>"',
    'Of a loop out of rounds — the step that closes it, or the run alone',
    'where it has one loop — enough: the loop ends on your words, with its',
    'findings open, --message "<why>" required. What waits on the looping',
    'step is filed as if it had said again: false, and every step after',
    'the loop is handed your words and those findings, under the heading',
    'of a loop ended as it stands.',
    'To go round once more instead: nemia retry <runId> [<step>] --round',
    ...ANSWER_HELP,
    '--budget <step>=<amount>: the cap of a step after the gate, in',
    'dollars, over what the step proposed for it; once for each step.',
    'Your approval makes the budgets the step proposed the caps of the',
    'steps after the gate, and auto never approves unasked a cap above',
    "a step's own budget",
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'optional', kind: 'name' },
    ],
    flags: [
      answerFlag('approve'),
      {
        flag: '--budget',
        kind: 'text',
        key: 'budget',
        many: true,
        takes:
          '--budget takes a step after the gate and its cap in dollars: nemia approve <runId> <step> --budget <step>=<amount>, like --budget implement=60',
        only: { side: 'cli', why: 'the api takes the budgets as data, by step and dollars (`budgets`)' },
      },
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: '--message takes the words that go with your approval, quoted: nemia approve <runId> [<step>] --message "<words>".',
        twice: 'nemia approve takes --message once: put all your words in it, quoted — nemia approve <runId> [<step>] --message "<words>".',
      },
    ],
    unknown: (arg) =>
      `nemia approve does not take ${arg}. It takes the run, the step, --answer <n>=<letter>, --budget <step>=<amount> and --message "<words>": nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"].`,
  },
  check: approveRefusal,
  writes: true,
  ticks: true,
  class: 'answer',
  only: { side: 'cli', why: "the api serves it as the Run's `approve` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia say`: words to a step's running session, or kept for its first try; who says them is read off the session's token. */
export const SAY_WORDS = {
  name: 'say',
  served: [{ endpoint: 'runs.say' }],
  usage: '<runId> <step> [--as <name>] "<words>"',
  help: [
    "tell a step's running session something, through its harness: the",
    "engine journals the words on the step's task, nemia ls notes the step",
    'said to, and nemia decide prints them under it. A try that continues',
    'the session is handed them again, as ## Said to your session.',
    'Words to a step not filed yet (waiting on --after, a hold or an',
    'earlier step) are kept, not delivered: its first try is handed them,',
    'as ## Said before you started, and no try after it.',
    "Words from a session its run filed are its agent's, by its token",
    '(WF_SESSION_TOKEN); an agent with none says --as <name> before its',
    "words, a name the person allowed with nemia chat allow. An agent's",
    'words reach the step under its name, never as yours',
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
      { key: 'text', takes: 'rest', kind: 'text' },
    ],
    flags: [
      {
        flag: '--as',
        kind: 'name',
        key: 'as',
        takes:
          '--as takes the name an agent with no session token speaks under, one the person allowed: nemia say <runId> <step> --as <name> "<words>".',
      },
    ],
    unknown: (arg) => `nemia say does not take ${arg}.`,
  },
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `say` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;
