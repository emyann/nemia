/**
 * The orchestrator's commands, each defined once (`COMMANDS`): its spec (`command.ts`), the one package verb its handler calls, the data it
 * answers, and the lines the CLI prints of that data. The CLI parses, refuses, helps and prints from an entry, and the api serves the same
 * entry on its route; an entry served on one side alone says so (`only`). Today: a start of work (`nemia start`, `START`, of a brief, and
 * of a folder of cards at the command line alone), the inbox (`INBOXES`), the factories (`FACTORIES`, their schedules among them), their
 * templates (`TEMPLATES`), a person's asks of a run — `nemia retry`, `nemia approve`, `nemia refresh` and `nemia say` — the runs and their
 * steps (`nemia ls`, `runsListed`), a read the api alone serves: the run slots (`slotsOf`), the agents of both places (`nemia agents`,
 * `agentsRead`), one agent's card (`nemia agents card`, `agentCardRead`) and its custom instructions (`nemia agents custom`,
 * `AGENTS_CUSTOM`), a run's course (`nemia cancel`, `nemia hold`, `nemia rm`, `nemia prune`), and the store's pause (`nemia pause`, `nemia
 * resume`, and its read the api alone serves): `runs.verb.ts`; Nemia's level and memory (`nemia level`, `nemia memory`: `nemia/`); an
 * agent's rules at auto (`nemia policy`: `POLICY_ENTRIES`, and what they reach, `POLICY_REACH`: `reach/`); who may speak in her chat as an
 * agent (`nemia chat speakers`, `allow`, `disallow`: `CHAT_SPEAKER_ENTRIES`, `chat/`); the reads of the store (`nemia show`, `nemia logs`,
 * `nemia stats`: `reads.verb.ts`); the rewrite of a former frontmatter as YAML (`nemia frontmatter rewrite`, `FRONTMATTER_REWRITE`); and
 * what the board alone reads and writes, each served on the api alone: a card's page (`INBOXES`), a run's page and its steps' files, path
 * and conversation (`PAGES`), the agent and skill libraries (`LIBRARY_ENTRIES`, `SKILL_ENTRIES`) and the workflow builder
 * (`WORKFLOW_ENTRIES`). The whole table (`TABLE`) adds the commands the CLI serves alone and runs itself, with no handler: `nemia tick`,
 * `nemia up` and `nemia watch` (`RAN`).
 */
import { Effect, Schema } from 'effect';
import { RunRefresh, RunRetry, RunSay, type SaidAfter } from 'objects';
import { APPROVE } from '../gate/commands.verb.ts';
import { ROUTE } from '../gate/route.verb.ts';
import { ANSWER_HELP, answerFlag, givenAnswers, recheckAnswerRefusal, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { messageRefusal, modeWord, type RetryHow } from '../retry/index.ts';
import { retryRun } from '../retry/retry.verb.ts';
import { rootGiven, StoreRoot } from '../config/root.store.ts';
import { rooted } from '../factory/wiring/wire.verb.ts';
import { roundRun } from '../round/round.verb.ts';
import { saidLines } from '../say/say.ts';
import { sayRun } from '../say/say.verb.ts';
import { budgetRefusal, budgetWord } from '../status/status.ts';
import { roundBudgetRefusal } from '../round/round.ts';
import { slotsRead, type Slots } from '../cap/slots-read.verb.ts';
import { runsListed } from '../list/list.verb.ts';
import { lsLines, type RunsListed } from '../list/list.ts';
import { PAGES, labelFlags, runsShown, selectorCheck, selectorsIn } from './pages.verb.ts';
import { pausedLines } from '../pause/pause.ts';
import { agentCardRead, agentsRead } from '../roster/roster.store.ts';
import { agentsLines, cardNote, type AgentsRead, type CardRead } from '../roster/roster.ts';
import { AGENTS_SOURCES } from '../sources/sources.verb.ts';
import { amountIn, commandLine, renamedValues, type Args, type CommandSpec, type Flag } from './command.ts';
import { checked, type Command, type Ran, tableEntry } from './entry.verb.ts';
import { READS, SERIES } from './reads.verb.ts';
import { AGENTS_CUSTOM } from '../custom/custom.verb.ts';
import { AgentCardInput, AgentsInput, LIBRARY_ENTRIES } from '../agents/library.verb.ts';
import { SKILL_ENTRIES } from '../skills/skills.verb.ts';
import { mergeRun } from '../merge/merge.verb.ts';
import { mergeAskedLine } from '../merge/merge.ts';
import { WORKFLOW_ENTRIES } from '../workflows/workflows.verb.ts';
import { FACTORIES } from '../factory/factory.verb.ts';
import { TEMPLATES } from '../template/template.verb.ts';
import { INBOXES } from '../inbox/commands.verb.ts';
import { LABELS } from '../labels/commands.verb.ts';
import { CONCLUDED, START } from '../start/commands.verb.ts';
import { CANCEL, HOLD, PRUNE, RAN, RM } from './runs.verb.ts';
import { PAUSE_ENTRIES } from '../pause/pause-timeout.verb.ts';
import { SUBSCRIBE, UNSUBSCRIBE } from '../subscription/subscription.verb.ts';
import { PASSES } from '../meter/passes.verb.ts';
import { LEVEL } from '../nemia/level.verb.ts';
import { MEMORY } from '../nemia/memory.verb.ts';
import { SERVICE_COMMANDS } from '../service/restart.verb.ts';
import { RELEASES } from '../release/upgrade.verb.ts';
import { VERSIONS } from '../release/version.verb.ts';
import { DAEMON } from '../daemon/daemon.verb.ts';
import { FRONTMATTER_REWRITE } from '../frontmatter/frontmatter.verb.ts';
import { ADMIT } from '../admission/admit.verb.ts';
import { POLICY_ENTRIES } from '../auto/auto.verb.ts';
import { CHAT_SPEAKER_ENTRIES } from '../chat/speakers.verb.ts';
import { POLICY_REACH } from '../reach/reach.verb.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { refreshRun } from '../revisions/pin.verb.ts';
import { driftWords, type Drift } from '../revisions/revisions.ts';

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

/** The run's id and the step's name, as `nemia say` takes them first. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

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
  handler: Effect.fnUntraced(function* (input: RetryInput, _env, home) {
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
      Effect.provideService(StoreRoot, rootGiven(home, 'retry')),
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

/** What `nemia refresh` takes: the run, and the ask as the api is sent it (`objects`' `RunRefresh`): `base`, and its looping step. */
export const RefreshInput = Schema.Struct({ runId: Schema.String, ...RunRefresh.fields });
export type RefreshInput = typeof RefreshInput.Type;

/** The refusal of a step named without `--base`, which alone takes one. */
function refreshRefusal({
  runId,
  step,
  base,
}: {
  readonly runId?: unknown;
  readonly step?: unknown;
  readonly base?: unknown;
}): string | null {
  const id = typeof runId === 'string' ? runId : '<runId>';
  return base !== true && typeof step === 'string'
    ? `nemia refresh takes a step only with --base, which merges the base into the work of the loop it closes: nemia refresh ${id} ${step} --base. The new revisions are the whole run's: nemia refresh ${id}.`
    : null;
}

/**
 * `nemia refresh`: a run asked to take the new revisions of the kinds it resolved, and the drift it was asked on; or, with `--base`, a
 * loop's work sent back to merge its base branch, on the round it is on (what `nemia merge` was, decision 7).
 *
 * It takes, it does not reload: the next pass re-pins the run and renders its steps' agent files again, so every filing after it — a new
 * step, a retry, a round — is filed on the revisions the world holds now. Nothing already filed is re-run.
 */
export const REFRESH: Command<
  {
    drift?: readonly Drift[];
    step?: string;
    target?: string;
    onto?: string;
    sha?: string;
    round?: number;
    file?: string;
    said?: string;
  },
  RefreshInput
> = {
  name: 'refresh',
  usage: '<runId> [<step>] [--base]',
  help: [
    'take the new revisions: a run keeps the workflow, agents, skills and',
    'factory rules it resolved when it started, and this pins it to the',
    'ones they hold now, so every filing after it — a new step, a retry,',
    'a round — is filed on them. What has already been filed is not re-run,',
    'and the steps the run has are neither added to nor removed. Refused of',
    'a run that has filed nothing, which resolves afresh at its first filing',
    'anyway, of one already on the newest revision of every kind, and of one',
    'whose factory follows revisions (nemia factory revisions), whose every',
    'filing takes them with no refresh;',
    "--base: take the base instead — a loop's work that no longer merges",
    'cleanly goes back to merge it, once, on the next tick, on the round it',
    'is on, which the merge does not spend; the step is the one that closes',
    'the loop, left out where the run has one loop',
  ],
  spec: {
    positionals: RUN_LOOP,
    flags: [{ flag: '--base', kind: 'switch', key: 'base' }],
    unknown: (arg) =>
      `nemia refresh takes one run's id, and with --base the step that closes the loop whose work merges: not ${arg}. nemia refresh <runId>, or nemia refresh <runId> [<step>] --base.`,
    missing: 'nemia refresh takes the run to pin to the new revisions: nemia refresh <runId>.',
  },
  check: (args) => refreshRefusal(args),
  writes: true,
  ticks: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `refresh` of `objects`' Api, calling this handler" },
  input: RefreshInput,
  handler: Effect.fnUntraced(function* (input: RefreshInput, _env?: NodeJS.ProcessEnv, home?: string) {
    yield* checked(refreshRefusal(input));
    const { runId } = input;
    if (input.base !== true) return { drift: yield* rooted(home, 'refresh', refreshRun(runId)) };
    const { run, ask, file } = yield* mergeRun(runId, input.step);
    const looping = (yield* stepsOf(run)).find((s) => s.name === ask.step);
    if (looping === undefined)
      throw new Error(`run ${run.id} has no step ${ask.step}, which its merge asks: report it as a defect of nemia refresh --base`);
    const { target, onto, sha } = ask.merge;
    return { step: ask.step, target, onto, sha, round: ask.round, file, said: mergeAskedLine(ask, looping) };
  }),
  print: ({ drift, said, file }, { runId, base }) =>
    base === true
      ? [`${runId}  ${said ?? ''}`, `   ${file ?? ''}`]
      : [
          `${runId}  asked: the new revisions — the next tick takes them, and every filing after it is on them`,
          ...(drift ?? []).map((d) => `   ${driftWords(d)}`),
        ],
};

/** What `nemia say` takes: the run, the step, and the words as the api is sent them (`objects`' `RunSay`). */
export const SayInput = Schema.Struct({ runId: Schema.String, step: Schema.String, ...RunSay.fields });
export type SayInput = typeof SayInput.Type;

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them. It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 */
export const SAY: Command<
  {
    at: string;
    attempt: number;
    text: string;
    after: { kind: SaidAfter; id: string } | null;
    try: number;
    taskId: string;
  },
  SayInput
> = {
  name: 'say',
  usage: '<runId> <step> "<words>"',
  help: [
    "tell a step's running session something, through its harness: the",
    "engine journals the words on the step's task, nemia ls notes the step",
    'said to, and nemia decide prints them under it. A try that continues',
    'the session is handed them again, as ## Said to your session',
  ],
  spec: {
    positionals: [...RUN_STEP, { key: 'text', takes: 'rest', kind: 'text' }],
    flags: [],
    unknown: (arg) => `nemia say does not take ${arg}.`,
  },
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `say` of `objects`' Api, calling this handler" },
  input: SayInput,
  handler: Effect.fnUntraced(function* ({ runId, step, text: words }: SayInput) {
    const told = yield* sayRun(runId, step, words);
    const { at, attempt, text, after } = told.said;
    return { at, attempt, text, after: after ?? null, try: told.try, taskId: told.taskId };
  }),
  print({ at, attempt, text, try: tryNo, taskId }, { runId, step }) {
    return [
      `${runId}  said to ${step}, try ${tryNo}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${taskId}: nemia decide ${runId} prints it under the step`,
      ...saidLines([{ at, attempt, text, try: tryNo }])
        .slice(1)
        .flatMap((l) => l.split('\n'))
        .map((line) => `   ${line}`),
    ];
  },
};

/**
 * `nemia ls`: every run, or the one named, and its steps, as the package reads each (`runsListed`). The board's list is the RunList
 * (`runList`), judged off the same judgement of each (`informedJudgements`), at `GET /api/runs`. The api serves this answer
 * whole on `GET /api/listing` and `GET /api/listing/:runId`, which `nemia` reads and prints with this entry's lines, as a client of it.
 */
/** What `nemia ls` takes, and the api's listing calls it with: a run's id or none, its selectors, and the labels shown. */
const LsInput = Schema.Struct({
  runId: Schema.optionalKey(Schema.String),
  selector: Schema.optionalKey(Schema.Array(Schema.String)),
  showLabels: Schema.optionalKey(Schema.Boolean),
  labelColumns: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const LS: Command<RunsListed, typeof LsInput.Type> = {
  name: 'ls',
  usage: '[<runId>] [-l <selector>] [--show-labels] [-L <key>]',
  help: [
    'runs and their steps — a run waiting on another says waiting on <run>,',
    'one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
    "flight); what each step's tries and the run have cost, where measured;",
    'last, whether a nemia up ticks the store and when its last pass was;',
    'first, while the store is paused, Pausing: N finishing and each',
    'session, check or landing at work, or Paused once none is, then each',
    'check it holds, a landing with its merge staged in the checkout',
    '(MERGE_HEAD) among them; a step whose check it holds says waiting on',
    'the pause. -l: the runs whose labels a selector takes (team=core,',
    'given again for another); --show-labels: each run with its labels;',
    '-L <key>: that label beside each run, given again for another',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'optional', kind: 'name' }],
    flags: labelFlags('nemia ls'),
    unknown: (arg) => `nemia ls takes one run's id, or none, -l <selector>, --show-labels and -L <key>: not ${arg}.`,
  },
  check: selectorCheck,
  writes: false,
  class: 'read',
  input: LsInput,
  handler: (args, _env, home) => Effect.flatMap(selectorsIn(args), (s) => runsListed(args.runId, s, rootGiven(home, 'ls'))),
  print: (listed, args) => [...(listed.paused ? pausedLines(listed.paused) : []), ...lsLines(listed, Date.now(), runsShown(args))],
};

/**
 * The cap on runs in flight, the runs it counts and the runs it holds (`slotsRead`), which the api alone serves (`GET /api/ceilings`).
 */
export const CEILINGS: Command<Slots> = {
  name: 'ceilings',
  usage: '',
  help: ['the cap on runs in flight, the runs it counts and the runs it holds'],
  spec: { positionals: [], flags: [], unknown: (arg) => `the ceilings take no ${arg}.` },
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: 'the board says the run slots over its Factory; at the command line, nemia ls and nemia decide say a run held for one beside the run',
  },
  handler: (_args, env) => slotsRead(env),
  print: () => [],
};

/** The refusal of a value left out of each of `nemia agents`' two flags, saying what it takes. */
const AGENTS_TAKES = {
  '--repo': '--repo takes the repository whose workflows/agents to read: nemia agents --repo <r>',
  '--from': '--from takes which place the agent is in: nemia agents card <name> --from repo|yours',
} as const;

/** `--repo <r>` once, and `--from repo|yours` once, which the listing takes and leaves unread. */
const AGENTS_FLAGS = (['--repo', '--from'] as const).map((flag): Flag => ({
  flag,
  kind: 'text',
  key: flag.slice(2),
  takes: AGENTS_TAKES[flag],
  twice: `nemia agents takes ${flag} once: an agent is read from one ${flag === '--repo' ? 'repository' : 'place'}.`,
}));

/** `nemia agents`' spec, after the name of the card it is asked for: its flags, and an argument it does not take in its own words. */
const agentsSpec = (positionals: CommandSpec['spec']['positionals']): CommandSpec['spec'] => ({
  positionals,
  flags: AGENTS_FLAGS,
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia agents does not take ${arg}. It takes --repo <r>, and for a card --from repo|yours.`
      : `nemia agents takes no argument but card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours: nemia agents, nemia agents card ${arg}, or nemia agents custom ${arg}.`,
  apart: (_value, flag) => AGENTS_TAKES[flag as keyof typeof AGENTS_TAKES],
});

/** Refused of `nemia agents`' flags: a value empty or starting `--`, which reads as the value left out, and a place but repo or yours. */
function agentsRefusal(args: Args): string | null {
  for (const flag of ['--repo', '--from'] as const) {
    const value = textOf(args, flag.slice(2));
    if (value !== undefined && (!value || value.startsWith('--'))) return AGENTS_TAKES[flag];
  }
  const from = textOf(args, 'from');
  if (from === undefined || from === 'repo' || from === 'yours') return null;
  return `nemia agents --from takes repo or yours, not ${from}: repo is <repo>/workflows/agents, yours is your store's.`;
}

/** `nemia agents`: every agent of both places, the repository's then yours, each read now through the Agent door. */
export const AGENTS: Command<AgentsRead, AgentsInput> = {
  name: 'agents',
  usage: '[--repo .]',
  help: [
    "the agents a step may name, the repository's then yours: what each is",
    'for, what it says it can do (an entry for each skill, read off its',
    'SKILL.md), and the skills it is given (its skills:)',
  ],
  spec: agentsSpec([]),
  check: agentsRefusal,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `list` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
  input: AgentsInput,
  handler: ({ repo = '.' }, _env, home) =>
    rooted(
      home,
      'agents',
      Effect.flatMap(StoreRoot, (root) => agentsRead({ repo, home: root })),
    ),
  print: agentsLines,
};

/** `nemia agents card`: one agent in the shape of an A2A Agent Card, from the place it is in. */
export const AGENT_CARD: Command<CardRead, AgentCardInput> = {
  name: 'agents card',
  usage: '<name> [--repo .] [--from repo|yours]',
  help: [
    'that agent in the shape of an A2A Agent Card, JSON on stdout and',
    'nothing else — every field the protocol marks REQUIRED but',
    'supportedInterfaces, which is left out because nothing here serves an',
    'agent over A2A. The card describes; it is not an address',
  ],
  spec: agentsSpec([{ key: 'name', takes: 'required', kind: 'name' }]),
  check: agentsRefusal,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `card` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
  input: AgentCardInput,
  handler: ({ name, repo = '.', from }, _env, home) =>
    rooted(
      home,
      'agents card',
      Effect.flatMap(StoreRoot, (root) => agentCardRead(name, { repo, home: root, ...(from !== undefined && { from }) })),
    ),
  print: ({ card }) => [JSON.stringify(card, null, 2)],
  note: (data, { name }) => cardNote(data, name),
};

/** Every command with a handler defined once, in the order `nemia`'s help lists them: what the api may serve. */
export const COMMANDS: readonly Command[] = [
  START,
  tableEntry(CONCLUDED),
  ...INBOXES,
  ...LABELS,
  ...FACTORIES,
  ...TEMPLATES,
  tableEntry(RETRY),
  tableEntry(APPROVE),
  ROUTE,
  tableEntry(REFRESH),
  tableEntry(SAY),
  tableEntry(LS),
  ...READS,
  ...PAGES,
  CEILINGS,
  PASSES,
  SERIES,
  AGENTS,
  AGENT_CARD,
  AGENTS_SOURCES,
  AGENTS_CUSTOM,
  ...LIBRARY_ENTRIES,
  ...SKILL_ENTRIES,
  CANCEL,
  HOLD,
  RM,
  PRUNE,
  ...PAUSE_ENTRIES,
  SUBSCRIBE,
  UNSUBSCRIBE,
  LEVEL,
  MEMORY,
  ...POLICY_ENTRIES,
  POLICY_REACH,
  ...CHAT_SPEAKER_ENTRIES,
  ...SERVICE_COMMANDS,
  ...RELEASES,
  ...VERSIONS,
  DAEMON,
  FRONTMATTER_REWRITE,
  ...WORKFLOW_ENTRIES,
];

/**
 * The whole table, in the order `nemia`'s help lists them: `nemia start`, then every other command with a handler, then
 * those the CLI runs itself (`RAN`).
 */
export const TABLE: readonly (Command | Ran)[] = [...COMMANDS, ...RAN, ADMIT];
