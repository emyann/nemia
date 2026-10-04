/**
 * `wf start` and `wf plan`, entries of the command table. A start is served on both sides: the CLI's runner reads the brief and finds the
 * workflow from where it is typed, the api's route from its body, and each hands the same handler what it found. A plan is the command
 * line's alone, run by its runner.
 */
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command, Ran } from '../command/entry.verb.ts';
import { cordonWords } from '../cordon/cordon.ts';
import { readCordon } from '../cordon/cordon.store.ts';
import { endingSteps } from '../ending/ending.ts';
import { writersOf } from '../factory/factory.ts';
import { formerKeyLines } from '../folder/folder.store.ts';
import { ignoredRepoLine } from '../inbox/inbox.ts';
import { startFromInbox } from '../inbox/inbox.verb.ts';
import { isGitRun, type Run } from '../record/record.ts';
import { inputsDir, stepsOf } from '../record/record.store.ts';
import { approvedFirst, gatesOf } from '../status/status.ts';
import { fromNote } from './inputs.ts';
import { leftOutMounts, start } from './start.verb.ts';

export const PLAN_HELP = `wf plan <folder> [--repo .] [--factory <name>]

Start a plan: one run per card in the folder, parents first, each waiting on the runs of the cards it names.
That is the record wf start --after writes, so the tick files a card's run once its parents have shipped, and
every card is a decision at its own wf decide. Nothing else is written: the runs and their after are the plan.
It prints a line per card: the card, its run, its workflow, and what it waits on. Every run is started in
--factory, else the factory whose repository holds --repo, else the folder wf plan is typed in, when one
factory alone does, on that repository; none, or two, is refused before any run is started, naming the fix.

A card is one markdown file, <card>.md, and README.md beside the cards says what the plan is for:

    ---
    workflow: dev     # a workflow under <repo>/workflows/, or a path from the plan folder
    after: b, c       # the cards whose runs ship first; without it, the card starts at once
    ---
    Put the flag on the settings page, now that it is parsed and stored.

The body is the run's brief. Refused by name before any run is started: a key a card does not have, a card
with no workflow: or an empty body, an after: naming a card the folder does not have, cards that wait on
each other, a file that is not .md, a folder with no card, and a card whose workflow does not load.

The folder says what --after, --workflows and --no-worktree would, and wf plan refuses them. A wf start that
refuses part-way stops the plan: the runs it started stand, and it prints a wf start for each card left.`;

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** Every value under `key`, in the order given. */
const listOf = (args: Args, key: string): string[] => {
  const value = args[key];
  return Array.isArray(value) ? [...value] : [];
};

/** Why a value flag of `wf start` is taken once, as its refusal says it. */
const ONCE: Readonly<Record<string, string>> = {
  '--workflows': 'works on one workflow',
  '--brief': 'is asked one thing',
  '--repo': 'works on one repository',
  '--factory': 'is started in one factory',
};

/** One of `wf start`'s value flags: taken once, unless `many`; `cli`, why the api alone does not take it, where it does not. */
function startFlag(flag: string, key: string, takes: string, how: { many?: true; cli?: string } = {}): Flag {
  return {
    flag,
    kind: 'text',
    key,
    takes: `${flag} takes ${takes}`,
    ...(how.many ? { many: true } : { twice: `wf start takes ${flag} once: a run ${ONCE[flag]}.` }),
    ...(how.cli !== undefined ? { only: { side: 'cli', why: how.cli } } : {}),
  };
}

/** `wf start`'s spec: the brief, then its flags, each value flag also as `--flag=<value>`. */
const START_SPEC: Spec = {
  positionals: [{ key: 'brief', takes: 'required', kind: 'text' }],
  flags: [
    startFlag('--workflows', 'workflows', 'the workflow folder: wf start <brief> --workflows <dir>', {
      cli: 'the api is sent a workflow by `from` and name, never a folder',
    }),
    startFlag('--repo', 'repo', 'the repository the run works on: wf start <brief> --repo <r>'),
    startFlag('--after', 'after', 'the run this one waits on, by its id: wf start <brief> --after <runId> [--after <runId> ...]', {
      many: true,
    }),
    startFlag('--input', 'inputs', "a file to hand the run's steps: wf start <brief> --input <file> [--input <file> ...]", {
      many: true,
      cli: 'a file is read from where wf start is typed: the api reads no file a body names',
    }),
    startFlag(
      '--gate',
      'gates',
      'the step whose closeout waits for a person before anything after it is filed: wf start <brief> --gate <step> [--gate <step> ...]',
      { many: true, cli: "the board gates a step by its workflow's own gate: true, or a card's gate:" },
    ),
    startFlag(
      '--brief',
      'instead',
      'what the run is asked to do in place of an inbox card\'s body, as text or a file: wf start <inbox>/<name>.md --brief "<brief>"',
    ),
    startFlag(
      '--factory',
      'factory',
      "the factory the run is started in, whose hires fill the workflow's steps; without it, the one whose repository holds the folder: wf start <brief> --factory <name>",
    ),
    {
      flag: '--no-worktree',
      kind: 'switch',
      key: 'noWorktree',
      only: { side: 'cli', why: 'the board starts every run in worktrees of its own' },
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> once per file to hand its steps; --gate <step> once per step to gate; --factory <name>; and, for an inbox card, --brief "<brief>".`
      : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`,
  apart: (_value, flag) => START_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
};

/** A run started, and, for an inbox card, the card, whether it left the inbox and why not, and a `repo:` the start did not take. */
type Started = { id: string; run: Run; card?: string; removed?: boolean; why?: string; ignoredRepo?: string };

/**
 * The folders of its factory a run mounts, read-only, and those left out because they were no directory; none in the default factory.
 */
function mountLines(run: Run): string[] {
  const missing = leftOutMounts(run);
  const written = writersOf(stepsOf(run), run.mounts);
  return [
    ...(run.mounts?.length
      ? [
          `mounts: ${run.mounts.map((m) => m.path).join(', ')} — read-only, for every local step${written.length ? ' but where written below' : ''}`,
        ]
      : []),
    ...written.map((w) => `writable: ${w.path} — for ${w.steps.join(', ')} alone`),
    ...(missing.length
      ? [`not mounted: ${missing.join(', ')} — of the factory's repositories, and no directory now; start again once it is there`]
      : []),
  ];
}

/** The steps of a run just started that wait on a person: each gated, and the ending a person approves before it is filed. */
function gateLines(run: Run): string[] {
  const steps = stepsOf(run);
  const gates = gatesOf(steps, run);
  const ends = endingSteps(steps, run)
    .filter((s) => approvedFirst(s, run))
    .map((s) => s.name);
  const held = gates.filter((name) => !ends.includes(name));
  return [
    ...(held.length
      ? [
          `gated at: ${held.join(', ')} — nothing after ${held.length > 1 ? 'each' : 'it'} is filed until wf approve ${run.id} <step>, once it has signed off`,
        ]
      : []),
    ...(ends.length
      ? [
          `ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until wf approve ${run.id} ${ends[0]}, which is what files ${ends.length > 1 ? 'them' : 'it'}`,
        ]
      : []),
  ];
}

/** Where an inbox card's run came from, and whether the card left the inbox, as `wf start` says it. */
const fromLines = ({ run, card, removed, why }: Started): string[] =>
  card === undefined
    ? []
    : removed
      ? [`${fromNote(run)} — removed from the inbox`]
      : [`${fromNote(run)} — still in the inbox: ${why}. wf inbox lists it as started as ${run.id}: drop it with wf inbox rm ${card}`];

/**
 * What `wf start` prints of a run it started: its steps, where it came from, its factory, the folders it mounts, where it works, and what
 * it waits on and ends at; while the store is cordoned, that nothing of it is filed until the lift; and a card's `repo:` not taken.
 */
function startedLines(started: Started): string[] {
  const { run } = started;
  const steps = stepsOf(run);
  const cordon = readCordon();
  return [
    `${run.id}  ${steps.length} step(s): ${steps.map((s) => (s.agent ? `${s.name} (${s.agent.name})` : s.name)).join(' → ')}`,
    ...fromLines(started),
    ...(run.factory ? [`factory: ${run.factory}${isGitRun(run) ? `, on ${run.repo}` : ''}`] : []),
    ...mountLines(run),
    `workspace: ${run.workspace}${isGitRun(run) ? '' : ' — a folder per step, made as each is filed, with no git repository'}`,
    ...(run.inputs?.length ? [`inputs: ${run.inputs.join(', ')} — copied into ${inputsDir(run)}`] : []),
    ...(run.after?.length
      ? [`waits on: ${run.after.join(', ')} — nothing is filed until wf decide says each has shipped onto ${run.branch}`]
      : []),
    ...gateLines(run),
    `run 'wf tick' (or 'wf up') to start it`,
    ...(cordon ? [`${cordonWords(cordon)}: nothing of this run is filed until then`] : []),
    ...formerKeyLines(run.workflowDir),
    ...(started.ignoredRepo !== undefined ? [ignoredRepoLine(started.ignoredRepo)] : []),
  ];
}

/** An inbox card's start, off the handler's arguments (`START`). */
function cardStart(card: string, args: Args): Started {
  const brief = textOf(args, 'instead');
  const workflow = textOf(args, 'workflows');
  const repo = textOf(args, 'repo');
  const factory = textOf(args, 'factory');
  const started = startFromInbox({
    name: card,
    ...(brief !== undefined ? { brief } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(repo !== undefined ? { repo } : {}),
    callerRepo: textOf(args, 'at') ?? '.',
    isolate: args.noWorktree !== true,
    after: listOf(args, 'after'),
    inputs: listOf(args, 'inputs'),
    gates: listOf(args, 'gates'),
    ...(factory !== undefined ? { factory } : {}),
    fix: textOf(args, 'fix') ?? '--factory <name>',
  });
  return {
    id: started.run.id,
    run: started.run,
    card: started.card.name,
    removed: started.removed,
    ...(started.removed ? {} : { why: started.why }),
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  };
}

/**
 * `wf start`: a run of a brief, or of an inbox card. Its handler is handed what its caller found: under `card`, an inbox card's name,
 * with `instead` the brief in place of its body, `at` the repository when neither the card nor its factory names one, and `fix` how the
 * caller names a factory; else `brief`, the brief's text, `workflows`, the folder, and `repo`, the repository, with `repoNamed` true where
 * a person named it. The CLI's runner reads a brief's file and finds the folder from where it is typed; the api's route finds both from its
 * body, so no path a body sends reaches the handler.
 */
export const START: Command<Started> = {
  name: 'start',
  usage:
    '<brief.md|card.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]',
  help: [
    '--after <runId>: file nothing of this run until wf decide says that',
    'run has shipped — finished, and its result branch on the base',
    'branch — and start from the base as it is then; once per run.',
    "--gate <step>: that step's closeout waits for wf approve before",
    "anything after it is filed, as a step's own gate: true does; once",
    "per step. An inbox card's gate: <step> is one more",
    '--workflows takes a folder, or a name under <repo>/workflows/: dev',
    'a card of a plan (wf plan --help) starts its body: --workflows is its',
    'workflow: unless given, and its after: needs an --after for each',
    "--input <file>: copied into the run's own inputs/ directory, and named",
    "on every step's brief under what was asked for; once per file",
    '--factory <name>: the workflow must be attached to the factory, whose',
    'hires fill its steps, and a step left with no agent is refused (wf',
    'factory --help). A factory with one repository gives the run its',
    "--repo, and a repository not one of the factory's is refused, naming",
    'them. Without it, the run is started in the factory whose repository',
    'holds --repo, else where wf start is typed, on that repository, when',
    'one factory alone does; none, or two, is refused, naming the fix.',
    'The default factory is history only: --factory default is refused',
    'a card of the inbox (wf inbox --help) starts its body, or --brief',
    '"<brief>" in its place, and leaves the inbox: --workflows is its workflow:',
    'unless given, --repo its repo:, --factory its factory:, and a card',
    'that names no factory either way is refused',
  ],
  spec: START_SPEC,
  check: (args) => leftOut(START_SPEC, args),
  writes: true,
  route: {
    method: 'POST',
    path: '/api/runs',
    status: 201,
    hand: 'its body names a workflow by `from` and name, or an inbox card by name, which the api finds among the folders a start finds one in, in the factory the request is served in: never a path sent',
  },
  async handler(_e, args) {
    const card = textOf(args, 'card');
    if (card !== undefined) return cardStart(card, args);
    const factory = textOf(args, 'factory');
    const run = start({
      brief: textOf(args, 'brief') ?? '',
      repo: textOf(args, 'repo') ?? '.',
      repoNamed: args.repoNamed === true,
      workflowDir: textOf(args, 'workflows') ?? '',
      isolate: args.noWorktree !== true,
      after: listOf(args, 'after'),
      inputs: listOf(args, 'inputs'),
      gates: listOf(args, 'gates'),
      ...(factory !== undefined ? { factory } : {}),
    });
    return { id: run.id, run };
  },
  print: startedLines,
};

/** The flags of `wf start` that `wf plan` refuses, each with why the folder says it instead. */
const PLAN_REFUSES: Readonly<Record<string, string>> = {
  '--after':
    'wf plan does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan. To wait on a run already started, start the card by hand: wf start <card.md> --workflows <dir> --after <runId>.',
  '--workflows':
    'wf plan does not take --workflows: each card names its own, in its workflow: — a folder under <repo>/workflows/, or a path from the plan folder.',
  '--input':
    'wf plan does not take --input: a card has no input files of its own. Start that card by hand with its files: wf start <card.md> --workflows <dir> --input <file>.',
  '--gate':
    "wf plan does not take --gate: a plan's cards are gated by their workflows' own gate: true. To gate one card's run at a step, start that card by hand: wf start <card.md> --workflows <dir> --gate <step>.",
  '--no-worktree':
    'wf plan does not take --no-worktree: a card another waits on ships a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
};

/** `wf plan`'s spec: the folder, then `--repo <r>` and `--factory <name>`, once each; `wf start`'s others refused by name. */
const PLAN_SPEC: Spec = {
  positionals: [{ key: 'folder', takes: 'required', kind: 'text' }],
  flags: [
    {
      flag: '--repo',
      kind: 'text',
      key: 'repo',
      takes: '--repo takes the repository the plan works on: wf plan <folder> --repo <r>',
      twice: 'wf plan takes --repo once: a plan works on one repository.',
    },
    {
      flag: '--factory',
      kind: 'text',
      key: 'factory',
      takes: "--factory takes the factory every card's run is started in: wf plan <folder> --factory <name>",
      twice: 'wf plan takes --factory once: a plan is started in one factory.',
    },
  ],
  unknown: (arg) => {
    const name = arg.startsWith('--') && arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (Object.hasOwn(PLAN_REFUSES, name)) return PLAN_REFUSES[name];
    return arg.startsWith('-')
      ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r> and --factory <name>.`
      : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`;
  },
  apart: (_value, flag) => PLAN_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
};

/** `wf plan`: a run per card of a plan folder, started by the CLI's runner. */
export const PLAN: Ran = {
  name: 'plan',
  usage: '<folder> [--repo .] [--factory <name>]',
  help: [
    'start a plan: one run per card in the folder, parents first, each',
    '--after the runs of the cards its after: names, in the factory as',
    'wf start finds it (wf plan --help)',
  ],
  spec: PLAN_SPEC,
  check: (args) => leftOut(PLAN_SPEC, args),
  writes: true,
  only: {
    side: 'cli',
    why: 'the board starts runs one at a time, and a plan is a folder of cards read from where wf plan is typed: no api route starts one',
  },
  manual: PLAN_HELP,
};
