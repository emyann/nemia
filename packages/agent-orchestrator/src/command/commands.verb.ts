/**
 * The orchestrator's commands, each defined once (`COMMANDS`): its spec (`command.ts`), the one package verb its handler calls, the data it
 * answers, and the lines the CLI prints of that data. The CLI parses, refuses, helps and prints from an entry, and the api serves the same
 * entry on its route; an entry served on one side alone says so (`only`). Today: a start of work (`nemia start`, `START`, and `nemia plan`,
 * `PLAN`, which the CLI alone runs), the inbox (`INBOXES`), the factories (`FACTORIES`, their schedules among them), their templates
 * (`TEMPLATES`), a person's asks of a run — `nemia retry`, `nemia approve`, `nemia round`, `nemia accept` and `nemia say` — the runs and
 * their steps (`nemia ls`, `runsListed`), three reads the api alone serves: a run's decision (`decideRun`), whether its branches still
 * merge (`MERGES`) and the run slots (`slotsOf`), the agents of both places (`nemia agents`, `agentsRead`), one agent's card (`nemia agents
 * card`, `agentCardRead`) and its custom instructions (`nemia agents custom`, `AGENTS_CUSTOM`), a run's course (`nemia cancel`, `nemia
 * hold`, `nemia rm`, `nemia prune`), and the store's pause (`nemia pause`, `nemia resume`, and its read the api alone serves):
 * `runs.verb.ts`; Nemia's level and memory (`nemia level`, `nemia memory`: `nemia/`); an agent's rules at auto (`nemia policy`:
 * `POLICY_ENTRIES`); the reads of the store (`nemia show`, `nemia logs`, `nemia stats`: `reads.verb.ts`); the rewrite of a former
 * frontmatter as YAML (`nemia frontmatter rewrite`, `FRONTMATTER_REWRITE`); and what the board
 * alone reads and writes, each served on the api alone: a card's page (`INBOXES`), a run's page and its steps' files, path and conversation
 * (`PAGES`), the agent and skill libraries (`LIBRARY_ENTRIES`, `SKILL_ENTRIES`) and the workflow builder (`WORKFLOW_ENTRIES`). The whole
 * table (`TABLE`) adds the commands the CLI serves alone and runs itself, with no handler: `nemia plan`, `nemia tick`, `nemia up` and
 * `nemia watch` (`RAN`).
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { APPROVE } from '../gate/commands.verb.ts';
import { ANSWER_HELP, answerFlag, recheckAnswerRefusal, typedAnswers, typedOf } from '../question/asked.verb.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { messageRefusal, type RetryHow } from '../retry/index.ts';
import { retryRun } from '../retry/retry.verb.ts';
import { rootGiven, StoreRoot } from '../config/root.store.ts';
import { acceptWordsRefusal } from '../round/round.ts';
import { acceptRun, roundRun } from '../round/round.verb.ts';
import { saidLines } from '../say/say.ts';
import { sayRun } from '../say/say.verb.ts';
import { budgetRefusal, budgetWord } from '../status/status.ts';
import { decideRun, type Decided } from '../decide/decide.verb.ts';
import { slotsRead, type Slots } from '../cap/cap.verb.ts';
import { runsListed } from '../list/list.verb.ts';
import { lsLines, type RunsListed } from '../list/list.ts';
import { pausedLines } from '../pause/pause.ts';
import { agentCardRead, agentsRead } from '../roster/roster.store.ts';
import { agentsLines, cardNote, type AgentsRead, type CardRead } from '../roster/roster.ts';
import { AGENTS_SOURCES } from '../sources/sources.verb.ts';
import { amountIn, commandLine, type Args, type CommandSpec, type Flag } from './command.ts';
import type { Command, Ran } from './entry.verb.ts';
import { READS, SERIES } from './reads.verb.ts';
import { PAGES } from './pages.verb.ts';
import { AGENTS_CUSTOM } from '../agents/custom.verb.ts';
import { LIBRARY_ENTRIES } from '../agents/library.verb.ts';
import { SKILL_ENTRIES } from '../skills/skills.verb.ts';
import { MERGES } from '../branches/merges.verb.ts';
import { MERGE } from '../merge/merge.verb.ts';
import { WORKFLOW_ENTRIES } from '../folder/workflows.verb.ts';
import { FACTORIES } from '../factory/factory.verb.ts';
import { TEMPLATES } from '../template/template.verb.ts';
import { INBOXES } from '../inbox/commands.verb.ts';
import { CONCLUDED, PLAN, START } from '../start/commands.verb.ts';
import { CANCEL, PAUSE, PAUSED, PAUSE_NOW, HOLD, PRUNE, RAN, RM, RESUME } from './runs.verb.ts';
import { SUBSCRIBE, UNSUBSCRIBE } from '../subscription/subscription.verb.ts';
import { PASSES } from '../meter/passes.verb.ts';
import { LEVEL } from '../nemia/level.verb.ts';
import { MEMORY } from '../nemia/memory.verb.ts';
import { SERVICE_COMMANDS } from '../service/restart.verb.ts';
import { RELEASES } from '../release/upgrade.verb.ts';
import { VERSIONS } from '../release/version.verb.ts';
import { FRONTMATTER_REWRITE } from '../frontmatter/frontmatter.verb.ts';
import { ADMIT } from '../admission/admit.verb.ts';
import { POLICY_ENTRIES } from '../auto/auto.verb.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { refreshRun } from '../revisions/pin.verb.ts';
import { driftWords, type Drift } from '../revisions/revisions.ts';

/** The run's id and the step's name, as every route and command line names them. */
const named = (args: Args): { runId: string; step: string } => ({ runId: textOf(args, 'runId') ?? '', step: textOf(args, 'step') ?? '' });

/** `nemia retry`'s how, off its arguments: its way, the model a fresh session runs on, the answer and the cap. */
function howOf(args: Args): RetryHow {
  const mode = textOf(args, 'mode');
  const model = textOf(args, 'model');
  const message = textOf(args, 'message');
  const budget = amountIn(args, 'budget');
  return {
    mode: mode === 'fresh' || mode === 'recheck' ? mode : 'nudge',
    ...(model !== undefined ? { model } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(budget !== undefined ? { budget } : {}),
  };
}

/** The run's id and the step's name, as `nemia retry`, `nemia approve` and `nemia say` take them first. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** The run's id, and the step that closes the loop when the run has more than one, as `nemia round` and `nemia accept` take them. */
const RUN_LOOP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'optional', kind: 'name' },
] as const;

/** `nemia retry`: another try of a step asked for, the next tick files it once, and the file the ask is written to. */
const RETRY: Command<{ try: number; file: string; stopFirst: boolean }> = {
  name: 'retry',
  usage:
    '<runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--answer <n>=<letter>]... [--message "<answer>"] [--budget <amount>]',
  help: [
    'try a step waiting on you again, once, on the next tick:',
    '--nudge (default) continues its session, told what happened;',
    '--fresh a new session on its branch; --model <m> the same, on m;',
    '--recheck runs its check again, and files no session;',
    '--message "<answer>" goes into the try\'s brief, as ## Your answer:',
    'for a step that signed off blocked, the answer to its needs — or',
    'what you have to say to any step you try again; not with --recheck.',
    'The next argument is the answer, whatever it starts with; an answer',
    "that is only one of these flags' names goes as --message=<answer>;",
    '--budget <amount>: for a step with a budget: that waits on you, its',
    'cap raised to that many dollars, above its cap and what it has cost;',
    ...ANSWER_HELP,
  ],
  spec: {
    positionals: RUN_STEP,
    flags: [
      { flag: '--nudge', kind: 'switch', sets: { mode: 'nudge' }, way: true },
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
        form: 'nemia retry <runId> <step> --budget <amount>',
        twice: 'nemia retry takes --budget once: the cap to raise the step to, in dollars — nemia retry <runId> <step> --budget <amount>.',
      },
    ],
    defaults: { mode: 'nudge' },
    unknown: (arg) =>
      `nemia retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck, and --message "<answer>" and --budget <amount>.`,
    oneWay: 'nemia retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.',
    apart: (flag) =>
      `--message takes what to tell the step, and ${flag} is one of nemia retry's own flags, so the answer was left out: nemia retry <runId> <step> --message "<answer>". If ${flag} is the whole answer, give it as --message=${flag}.`,
  },
  check: (args) =>
    messageRefusal(howOf(args), commandLine(RETRY, args)) ??
    recheckAnswerRefusal(args, commandLine(RETRY, args)) ??
    budgetRefusal(howOf(args), commandLine(RETRY, args)),
  writes: true,
  ticks: true,
  class: 'answer',
  route: { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 },
  apiTakes: ['answers'],
  handler: Effect.fnUntraced(function* (args: Args, _env, home) {
    const { runId, step } = named(args);
    const how = howOf(args);
    const typed = typedOf(args);
    const message = typed.length ? { message: yield* typedAnswers(runId, step, typed, { note: how.message }) } : {};
    const { ask, file, stopFirst } = yield* retryRun(runId, step, { ...how, ...message }, { stopBlocked: true }).pipe(
      Effect.provideService(StoreRoot, rootGiven(home, 'retry')),
    );
    return { try: ask.try, file, stopFirst };
  }),
  print({ try: tryNo, file, stopFirst }, args) {
    const { runId, step } = named(args);
    const ask = howOf(args);
    const how = `${ask.model ? `--model ${ask.model}` : `--${ask.mode}`}${ask.budget !== undefined ? `, --budget ${ask.budget}` : ''}`;
    const then = stopFirst
      ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped'
      : 'the next tick files it, once';
    return [
      `${runId}  asked: try ${tryNo} of ${step} (${how})${typedOf(args).length ? ', with your answers' : ask.message !== undefined ? ', with your answer' : ''} — ${then}`,
      `   ${file}`,
    ];
  },
};

/** `nemia round`: another round of a loop out of rounds asked for, its cap raised with `--budget`, and the file the ask is written to. */
const ROUND: Command<{ step: string; round: number; file: string; budget?: number }> = {
  name: 'round',
  usage: '<runId> [<step>] [--budget <amount>]',
  help: [
    'once more: a loop out of rounds goes round again, once, on the',
    'next tick — the step it loops to continued, then a new reviewer;',
    '--budget raises the cap of a step of the loop over its budget',
  ],
  spec: {
    positionals: RUN_LOOP,
    flags: [
      {
        flag: '--budget',
        kind: 'amount',
        key: 'budget',
        takes: 'the most a step of the loop may cost together, in dollars, above what it has cost',
        form: 'nemia round <runId> [<step>] --budget <amount>',
        twice:
          'nemia round takes --budget once: the cap to raise the steps of the loop over their budget to, in dollars — nemia round <runId> [<step>] --budget <amount>.',
      },
    ],
    unknown: () =>
      'nemia round takes the run and, when the run has more than one loop, the step that closes the one to go round: nemia round <runId> [<step>] — and --budget <amount>, to raise the cap of a step of the loop over its budget.',
  },
  writes: true,
  ticks: true,
  class: 'answer',
  route: { method: 'POST', path: '/api/runs/:runId/round', status: 202 },
  apiKeys: ['step', 'round', 'file'],
  handler: Effect.fnUntraced(function* (args: Args) {
    const { ask, file } = yield* roundRun(named(args).runId, textOf(args, 'step'), amountIn(args, 'budget'));
    return { step: ask.step, round: ask.round, file, ...(ask.budget !== undefined ? { budget: ask.budget } : {}) };
  }),
  print({ step, round: n, file, budget }, args) {
    return [
      `${named(args).runId}  asked: round ${n} of ${step}'s loop${budget !== undefined ? `, its cap raised to ${budgetWord(budget)}` : ''} — the next tick files it, once`,
      `   ${file}`,
    ];
  },
};

/**
 * `nemia refresh`: a run asked to take the new revisions of the kinds it resolved, and the drift it was asked on.
 *
 * It takes, it does not reload: the next pass re-pins the run and renders its steps' agent files again, so every filing after it — a new
 * step, a retry, a round — is filed on the revisions the world holds now. Nothing already filed is re-run.
 */
const REFRESH: Command<{ drift: readonly Drift[] }> = {
  name: 'refresh',
  usage: '<runId>',
  help: [
    'take the new revisions: a run keeps the workflow, agents, skills and',
    'factory rules it resolved when it started, and this pins it to the',
    'ones they hold now, so every filing after it — a new step, a retry,',
    'a round — is filed on them. What has already been filed is not re-run,',
    'and the steps the run has are neither added to nor removed. Refused of',
    'a run that has filed nothing, which resolves afresh at its first filing',
    'anyway, and of one already on the newest revision of every kind',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia refresh takes one run's id: not ${arg}.`,
    missing: 'nemia refresh takes the run to pin to the new revisions: nemia refresh <runId>.',
  },
  writes: true,
  ticks: true,
  class: 'act',
  route: { method: 'POST', path: '/api/runs/:runId/refresh', status: 202 },
  apiKeys: ['drift'],
  handler: Effect.fnUntraced(function* (args: Args) {
    return { drift: yield* refreshRun(named(args).runId) };
  }),
  print: ({ drift }, args) => [
    `${named(args).runId}  asked: the new revisions — the next tick takes them, and every filing after it is on them`,
    ...drift.map((d) => `   ${driftWords(d)}`),
  ],
};

/**
 * `nemia accept`: a loop out of rounds closed on its last try as it stands, its findings open, and the file the acceptance is written to.
 */
const ACCEPT: Command<{ step: string; try: number; at: string; message: string; file: string; waited: boolean }> = {
  name: 'accept',
  usage: '<runId> [<step>] --message "<why>"',
  help: [
    'enough: a loop out of rounds ends on your word, with its findings',
    'open. What waits on the looping step is filed on the next tick as',
    'if it had said again: false — a gated ending goes to its gate —',
    'and every step after the loop is handed your words and those',
    'findings under ## Accepted. The other answer to nemia round',
  ],
  spec: {
    positionals: RUN_LOOP,
    flags: [
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes:
          '--message takes why the work is good enough with its findings open, quoted: nemia accept <runId> [<step>] --message "<why>".',
        twice: 'nemia accept takes --message once: put all your words in it, quoted — nemia accept <runId> [<step>] --message "<why>".',
      },
    ],
    unknown: () =>
      'nemia accept takes the run and, when the run has more than one loop, the step that closes the one to end: nemia accept <runId> [<step>] --message "<why>".',
  },
  check: (args) => acceptWordsRefusal(textOf(args, 'message'), commandLine(ACCEPT, args)),
  writes: true,
  ticks: true,
  class: 'answer',
  route: { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 },
  apiKeys: ['step', 'try', 'at', 'message', 'file'],
  handler: Effect.fnUntraced(function* (args: Args) {
    const { runId } = named(args);
    const { acceptance, file } = yield* acceptRun(runId, textOf(args, 'step'), textOf(args, 'message'));
    const waited = stepsOf(runStore.runs.read(runId)).some((s) => s.after.includes(acceptance.step));
    return { step: acceptance.step, try: acceptance.try, at: acceptance.at, message: acceptance.message, file, waited };
  }),
  print({ step, try: tryNo, file, waited }, args) {
    return [
      `${named(args).runId}  accepted: try ${tryNo} of ${step} as it stands, its findings open — ${waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`,
      `   ${file}`,
    ];
  },
};

/**
 * `nemia say`: words to a step's session, journalled on its task, and printed as `nemia decide` prints them. It takes every word after the
 * step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 */
const SAY: Command<{
  at: string;
  attempt: number;
  text: string;
  after: { kind: string; id: string } | null;
  try: number;
  taskId: string;
}> = {
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
  route: { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 },
  apiKeys: ['at', 'attempt', 'text', 'after'],
  handler: Effect.fnUntraced(function* (args: Args) {
    const { runId, step } = named(args);
    const told = yield* sayRun(runId, step, textOf(args, 'text') ?? '');
    const { at, attempt, text, after } = told.said;
    return { at, attempt, text, after: after ?? null, try: told.try, taskId: told.taskId };
  }),
  print({ at, attempt, text, try: tryNo, taskId }, args) {
    const { runId, step } = named(args);
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
 * `nemia ls`: every run, or the one named, and its steps, as the package reads each (`runsListed`). The board's list is the runs'
 * summaries, judged off the same reading of each (`runReading`), on the entry the api serves alone (`RUNS`).
 */
const LS: Command<RunsListed> = {
  name: 'ls',
  usage: '[<runId>]',
  help: [
    'runs and their steps — a run waiting on another says waiting on <run>,',
    'one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
    "flight); what each step's tries and the run have cost, where measured;",
    'last, whether a nemia up ticks the store and when its last pass was;',
    'first, while the store is paused, Pausing: N finishing and each',
    'session, check or landing at work, or Paused once none is, then each',
    'check it holds, a landing with its merge staged in the checkout',
    '(MERGE_HEAD) among them; a step whose check it holds says waiting on',
    'the pause',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia ls takes one run's id, or none: not ${arg}.`,
  },
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "its lines are each run's for a person at a terminal; the board reads every run judged into a summary, kept between its polls, off the runs entry",
  },
  handler: (args) => runsListed(textOf(args, 'runId')),
  print: (listed) => [...(listed.paused ? pausedLines(listed.paused) : []), ...lsLines(listed, Date.now())],
};

const DECIDE: Command<Decided> = {
  name: 'decide',
  usage: '<runId>',
  help: ['what is left for a person to do on a run, and the commands that do it'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia decide does not take ${arg}.`,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:runId/decision', status: 200 },
  only: {
    side: 'api',
    why: "nemia decide is the CLI's own verb: it prints a run's whole screen — its steps, closeouts, checks and diffs — off this decision, which the api answers as data",
  },
  handler: (args, env) => decideRun(named(args).runId, env),
  print: () => [],
};

const CEILINGS: Command<Slots> = {
  name: 'ceilings',
  usage: '',
  help: ['the cap on runs in flight, the runs it counts and the runs it holds'],
  spec: { positionals: [], flags: [], unknown: (arg) => `the ceilings take no ${arg}.` },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/ceilings', status: 200 },
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

/** `nemia agents`: every agent of both places, the repository's then yours, each read now from disk. */
const AGENTS: Command<AgentsRead> = {
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
  route: { method: 'GET', path: '/api/agents', status: 200 },
  handler: (args, _env, home) => tried(() => agentsRead({ repo: textOf(args, 'repo') ?? '.', ...(home !== undefined && { home }) })),
  print: agentsLines,
};

/** `nemia agents card`: one agent in the shape of an A2A Agent Card, from the place it is in. */
const AGENT_CARD: Command<CardRead> = {
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
  route: { method: 'GET', path: '/api/agents/:from/:name/card', status: 200 },
  handler: (args, _env, home) =>
    tried(() => {
      const from = textOf(args, 'from');
      return agentCardRead(textOf(args, 'name') ?? '', {
        repo: textOf(args, 'repo') ?? '.',
        ...(home !== undefined && { home }),
        ...((from === 'repo' || from === 'yours') && { from }),
      });
    }),
  print: ({ card }) => [JSON.stringify(card, null, 2)],
  note: (data, args) => cardNote(data, textOf(args, 'name') ?? ''),
};

/** Every command with a handler defined once, in the order `nemia`'s help lists them: what the api may serve. */
export const COMMANDS: readonly Command[] = [
  START,
  CONCLUDED,
  ...INBOXES,
  ...FACTORIES,
  ...TEMPLATES,
  RETRY,
  APPROVE,
  ROUND,
  REFRESH,
  ACCEPT,
  MERGE,
  SAY,
  LS,
  ...READS,
  ...PAGES,
  DECIDE,
  MERGES,
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
  PAUSE,
  RESUME,
  PAUSED,
  PAUSE_NOW,
  SUBSCRIBE,
  UNSUBSCRIBE,
  LEVEL,
  MEMORY,
  ...POLICY_ENTRIES,
  ...SERVICE_COMMANDS,
  ...RELEASES,
  ...VERSIONS,
  FRONTMATTER_REWRITE,
  ...WORKFLOW_ENTRIES,
];

/**
 * The whole table, in the order `nemia`'s help lists them: `nemia start` and `nemia plan`, then every other command with a handler, then
 * those the CLI runs itself (`RAN`).
 */
export const TABLE: readonly (Command | Ran)[] = [COMMANDS[0], PLAN, ...COMMANDS.slice(1), ...RAN, ADMIT];
