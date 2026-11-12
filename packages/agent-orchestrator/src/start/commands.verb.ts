/**
 * `nemia start`, an entry of the command table. A start is served on both sides: the CLI's runner reads the brief and finds the workflow
 * from where it is typed, the api's route from its body, and each hands the same handler what it found. A folder of cards, a plan, is the
 * command line's alone: its runner starts a run per card (`nemia start <folder>`), and `folderRefusal` says what such a start does not
 * take.
 */
import { givesNone, refusing, renamed } from '../command/requests.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command, Served } from '../command/entry.verb.ts';
import { CONCLUDED_WORDS } from 'objects';
import { endingSteps } from '../ending/ending.ts';
import { writersOf } from '../factory/factory.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { WorkflowDir } from '../folder/folder.model.ts';
import { ignoredRepoLine } from '../inbox/index.ts';
import { startFromInbox } from '../inbox/inbox.verb.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { cardsDir, inputsDir } from '../record/record.store.ts';
import { carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { frozenStepsOf } from '../steps/steps.ts';
import type { StepSpec } from '../workflow.ts';
import { approvedFirst, gatesOf } from '../status/status.ts';
import { fromNote } from './inputs.ts';
import { leftOutMounts, leftOutVolumes, startRun, type StartedRun } from './start.verb.ts';
import { modelsOf, modelsText, type RunModels } from './models.ts';
import { volumeMounts } from '../factory/volume/volume.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { labelsText } from '../labels/labels.ts';
import { pausedRead } from '../list/list.verb.ts';
import { pausedWords, type Paused } from '../pause/pause.ts';
import { parentRead } from '../views/views.verb.ts';
import { EngineService } from '../runtime-client.ts';
import { standingLive } from '../standing/standing.verb.ts';
import { contextLines } from './context.ts';
import { contextSection } from '../brief/index.ts';
import { parentCloseouts } from '../brief/handed.verb.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { idRefusal } from '../forget/forget.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { settingsNamed } from '../harness-settings/harness-settings.ts';

/** What `nemia start --help` prints of a folder of cards, after the start of one brief. */
const FOLDER_HELP = `nemia start <folder> [--repo .] [--factory <name>]

A folder starts a plan: one run per card in the folder, parents first, each waiting on the runs of the cards it names.
That is the record nemia start --after writes, so the tick files a card's run once its parents have landed, and
every card is a decision at its own nemia decide. Nothing else is written: the runs and their after are the plan.
It prints a line per card: the card, its run, its workflow, and what it waits on. Every run is started in
--factory, else the factory whose repository holds --repo, else the folder nemia start <folder> is typed in, when one
factory alone does, on that repository; none, or two, is refused before any run is started, naming the fix.

A card is one markdown file, <card>.md, and README.md beside the cards says what the plan is for:

    ---
    workflow: dev     # a workflow under <repo>/workflows/, or a path from the plan folder
    after: b, c       # the cards whose runs land first; without it, the card starts at once
    ---
    Put the flag on the settings page, now that it is parsed and stored.

The body is the run's brief. Refused by name before any run is started: a key a card does not have, a card
with no workflow: or an empty body, an after: naming a card the folder does not have, cards that wait on
each other, a file that is not .md, a folder with no card, and a card whose workflow does not load.

The folder says what --after, --workflows and --no-worktree would, and nemia start <folder> refuses them. A nemia start that
refuses part-way stops the plan: the runs it started stand, and it prints a nemia start for each card left.`;

/** Why a value flag of `nemia start` is taken once, as its refusal says it. */
const ONCE: Readonly<Record<string, string>> = {
  '--workflows': 'works on one workflow',
  '--brief': 'is asked one thing',
  '--repo': 'works on one repository',
  '--factory': 'is started in one factory',
};

/** One of `nemia start`'s value flags: taken once, unless `many`; `cli`, why the api alone does not take it, where it does not. */
function startFlag(flag: string, key: string, takes: string, how: { many?: true; cli?: string } = {}): Flag {
  return {
    flag,
    kind: 'text',
    key,
    takes: `${flag} takes ${takes}`,
    ...(how.many ? { many: true } : { twice: `nemia start takes ${flag} once: a run ${ONCE[flag]}.` }),
    ...(how.cli !== undefined ? { only: { side: 'cli', why: how.cli } } : {}),
  };
}

/** `nemia start`'s spec: the brief, then its flags, each value flag also as `--flag=<value>`. */
const START_SPEC: Spec = {
  positionals: [{ key: 'brief', takes: 'required', kind: 'text' }],
  flags: [
    startFlag('--workflows', 'workflows', 'the workflow folder: nemia start <brief> --workflows <dir>', {
      cli: 'the api is sent a workflow by `from` and name, never a folder',
    }),
    startFlag('--repo', 'repo', 'the repository the run works on: nemia start <brief> --repo <r>'),
    startFlag('--after', 'after', 'the run this one waits on, by its id: nemia start <brief> --after <runId> [--after <runId> ...]', {
      many: true,
    }),
    startFlag(
      '--from',
      'context',
      'a run this one is handed as context, by its id, never waited on: nemia start <brief> --from <runId> [--from <runId> ...]',
      {
        many: true,
      },
    ),
    startFlag('--input', 'inputs', "a file to hand the run's steps: nemia start <brief> --input <file> [--input <file> ...]", {
      many: true,
      cli: 'a file is read from where nemia start is typed: the api reads no file a body names',
    }),
    startFlag(
      '--card',
      'cards',
      "an inbox card to hand the run's steps, by its name, copied as it reads now: nemia start <brief> --card <name> [--card <name> ...]",
      { many: true },
    ),
    startFlag(
      '--gate',
      'gates',
      'the step whose closeout waits for a person before anything after it is filed: nemia start <brief> --gate <step> [--gate <step> ...]',
      { many: true, cli: "the board gates a step by its workflow's own gate: true, or a card's gate:" },
    ),
    startFlag(
      '--model',
      'models',
      "a step's model in this run alone, its other steps and every other run keeping their agents': nemia start <brief> --model <step>=<model> [--model <step>=<model> ...]",
      { many: true, cli: "the board names a step's model by a card's model:" },
    ),
    startFlag(
      '--label',
      'label',
      'a label the run is created with, key=value to set one or key- to drop one it would inherit: nemia start <brief> --label team=core [--label <edit> ...]',
      { many: true },
    ),
    startFlag(
      '--brief',
      'instead',
      'what the run is asked to do in place of an inbox card\'s body, as text or a file: nemia start <inbox>/<name>.md --brief "<brief>"',
    ),
    startFlag(
      '--factory',
      'factory',
      "the factory the run is started in, whose hires fill the workflow's steps; without it, the one whose repository holds the folder: nemia start <brief> --factory <name>",
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
      ? `nemia start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --from <runId> once per run to read as context; --input <file> once per file to hand its steps; --card <name> once per inbox card to hand its steps; --gate <step> once per step to gate; --model <step>=<model> once per step to run on another model; --label key=value (or key-) once per label; --factory <name>; and, for an inbox card, --brief "<brief>".`
      : `nemia start takes one brief, and ${arg} is a second. Quote a brief with spaces — nemia start "<brief>" — or give it as a file: nemia start ./brief.md.`,
  apart: (_value, flag) => START_SPEC.flags.find((f) => f.flag === flag)?.takes ?? '',
};

/**
 * A run started, and, for an inbox card, the card, why its `queued:` line is still on it when it could not be taken off, and a `repo:` the
 * start did not take; the store's
 * pause as it stood once the run was written (`pausedRead`), while one stands; `landed`, the runs it is handed as context that had
 * landed when it started; and `hints`, a line for each file of its folder that still writes a former spelling, read through the Workflow
 * door (`hints`), where any does.
 */
type Started = {
  id: string;
  /** That the run was started on another machine's api, which answers its id alone (`startedThere`): what is printed of it. */
  there?: true;
  run: StartedRun;
  /** The store's root the run was started in, where its inputs and its copies of its workflow's files are. */
  home: string;
  card?: string;
  queueLeft?: string;
  ignoredRepo?: string;
  paused?: Paused;
  landed?: readonly string[];
  hints?: readonly string[];
  /** The factory's repositories and volumes left out of the run's mounts, each no directory now (`leftOutMounts`, `leftOutVolumes`). */
  notMounted?: readonly string[];
  notVolumes?: readonly string[];
};

/** The steps of a run just started: the workflow `nemia start` froze on its record, which every run it writes has (`frozenStepsOf`). */
const startedSteps = (run: Run): StepSpec[] => frozenStepsOf(run) ?? [];

/**
 * The folders of its factory a run mounts, read-only, and those left out because they were no directory; none in the default factory.
 */
function mountLines({ run, notMounted: missing = [], notVolumes = [] }: Started): string[] {
  const written = writersOf(startedSteps(run), run.mounts);
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
    ...volumeLines(run, notVolumes),
    ...settingsLine(run),
  ];
}

/** The harness settings a run froze from its factory, by name, as each of its steps on their harness is given them. */
function settingsLine(run: Run): string[] {
  const named = settingsNamed(run.harnessSettings).map((s) => s.name);
  return named.length ? [`harness settings: ${named.join(', ')} — for every step on their harness, beneath its agent's own`] : [];
}

/**
 * The factory's volumes a run mounts: those read-only, then each writable one with the steps whose fence writes it (`volumeMounts`), and
 * that it is not the run's workspace; then those left out because they were no directory.
 */
function volumeLines(run: Run, missing: readonly string[]): string[] {
  const volumes = run.volumes ?? [];
  const local = startedSteps(run).filter((s) => !isRemoteHarness(s.harness));
  const reads = volumes.filter((v) => v.readOnly);
  const writes = volumes
    .filter((v) => !v.readOnly)
    .map((v) => ({ path: v.path, steps: local.filter((s) => volumeMounts(s, [v])[0]?.readOnly === false).map((s) => s.name) }));
  return [
    ...(reads.length ? [`volumes: ${reads.map((v) => v.path).join(', ')} — read-only, for every local step`] : []),
    ...writes.map(
      (w) =>
        `volume: ${w.path} — ${w.steps.length ? `writable for ${w.steps.join(', ')}, read-only for every other local step` : 'writable, and read-only for every step here, since none writes'}; not the run's workspace: nothing commits or lands what a step writes there`,
    ),
    ...(missing.length
      ? [`not mounted: ${missing.join(', ')} — of the factory's volumes, and no directory now; start again once it is there`]
      : []),
  ];
}

/** The steps of a run just started that wait on a person: each gated, and the ending a person approves before it is filed. */
function gateLines(run: Run): string[] {
  const steps = startedSteps(run);
  const gates = gatesOf(steps, run);
  const ends = endingSteps(steps, run)
    .filter((s) => approvedFirst(s, run))
    .map((s) => s.name);
  const held = gates.filter((name) => !ends.includes(name));
  return [
    ...(held.length
      ? [
          `gated at: ${held.join(', ')} — nothing after ${held.length > 1 ? 'each' : 'it'} is filed until nemia approve ${run.id} <step>, once it has signed off`,
        ]
      : []),
    ...(ends.length
      ? [
          `ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until nemia approve ${run.id} ${ends[0]}, which is what files ${ends.length > 1 ? 'them' : 'it'}`,
        ]
      : []),
  ];
}

/** The models the run names for its steps, for it alone (`models`): a line where it names any. */
const modelLines = (run: Run): string[] =>
  run.models !== undefined && Object.keys(run.models).length
    ? [`models: ${modelsText(run.models)} — for this run alone; its other steps run on their agents'`]
    : [];

/**
 * The labels a run was created with, and a line per key it was not given since the runs it names disagree on it: the key, each run with
 * its value, and how to set it.
 */
const labelLines = (run: StartedRun): string[] => [
  ...(run.labels !== undefined && Object.keys(run.labels).length ? [`labels: ${labelsText(run.labels)}`] : []),
  ...(run.labelsLeftOut ?? []).map(
    ({ key, values }) =>
      `label ${key} not inherited: ${values.map((v) => `${v.run} has ${key}=${v.value}`).join(', ')} — set it with nemia label run ${run.id} ${key}=<value>`,
  ),
];

/** Where an inbox card's run came from, the card kept in the inbox as started, as `nemia start` says it. */
const fromLines = ({ run, card, queueLeft }: Started): string[] =>
  card === undefined
    ? []
    : [
        `${fromNote(run)} — kept in the inbox, listed as started`,
        ...(queueLeft !== undefined
          ? [
              `${queueLeft}: the tick does not start it again while ${run.id}'s record stands; take the line off with nemia inbox queue ${card} --off`,
            ]
          : []),
      ];

/**
 * The keys of a start that name files and folders of the machine it is typed on — the inputs and the cards copied into the run, the gates,
 * the models and a start with no worktree, which name a folder's own steps — which another machine's api is not sent: a card's `model:`
 * is, with the card.
 */
const PATHS_HERE = ['inputs', 'cards', 'gates', 'models', 'noWorktree'] as const;

/** What another machine's api answers of a start (`runs.create`, `cards.start`): the run's id, which is what is printed of it. */
const startedThere = (answer: unknown): Started => {
  const { id } = answer as { id: string };
  return { id, there: true } as Started;
};

/** The lines of a run started on another machine's api: its id, and how to read it there. */
const startedThereLines = ({ id }: Started): string[] => [
  `${id}  started on the daemon — nemia show ${id} reads it, and the daemon's next pass files its first step`,
];

/**
 * What `nemia start` prints of a run it started: its steps, where it came from, its factory, the folders it mounts, where it works, where
 * it copied its inputs and its workflow's files, and what it waits on, what it reads as context, landed or in flight, and ends at; while
 * the store is paused (`pausedWords`), that nothing of it is filed until it resumes; and a card's `repo:` not taken.
 */
function startedLines(started: Started): string[] {
  const { run, home } = started;
  const steps = startedSteps(run);
  return [
    `${run.id}  ${steps.length} step(s): ${steps.map((s) => (s.agent ? `${s.name} (${s.agent.name})` : s.name)).join(' → ')}`,
    ...fromLines(started),
    ...(run.factory ? [`factory: ${run.factory}${isRepositoryRun(run) ? `, on ${run.repo}` : ''}`] : []),
    ...mountLines(started),
    `workspace: ${run.workspace}${isRepositoryRun(run) ? '' : ' — a folder per step, made as each is filed, with no git repository'}`,
    ...(run.inputs?.length ? [`inputs: ${run.inputs.join(', ')} — copied into ${inputsDir(home, run)}`] : []),
    ...(run.cards?.length ? [`cards: ${run.cards.join(', ')} — copied into ${cardsDir(home, run)}`] : []),
    ...(run.workflowFiles === undefined ? [] : [`workflow files: copied into ${workflowFilesDir(home, run, run.workflowFiles)}`]),
    ...(run.carriedFiles === undefined ? [] : [`carried files: copied into ${carriedFilesDir(home, run, run.carriedFiles)}`]),
    ...(run.after?.length
      ? [`waits on: ${run.after.join(', ')} — nothing is filed until nemia decide says each has landed on ${run.branch}`]
      : []),
    ...contextLines(run.context ?? [], (id) => started.landed?.includes(id) === true),
    ...gateLines(run),
    ...modelLines(run),
    ...labelLines(run),
    `run 'nemia tick' (or 'nemia up') to start it`,
    ...(started.paused ? [`${pausedWords(started.paused)}: nothing of this run is filed until then`] : []),
    ...(started.hints ?? []),
    ...(started.ignoredRepo !== undefined ? [ignoredRepoLine(started.ignoredRepo)] : []),
  ];
}

/**
 * The lines `nemia start` prints of `run`'s folder still on a former spelling, read through the Workflow door off the folder its record
 * names; none where the door refuses it, which the start has already said why.
 */
const hintsOf = Effect.fnUntraced(function* (run: Run) {
  const hints = (yield* WorkflowDoor).workflows.hints(WorkflowDir.read(run.workflowDir));
  return yield* hints.pipe(Effect.orElseSucceed((): readonly string[] => []));
});

/** An inbox card's start, off what the handler was handed (`START`). */
const cardStart = Effect.fnUntraced(function* (card: string, given: StartInput) {
  const { instead: brief, workflows: workflow, repo, factory } = given;
  const started = yield* startFromInbox({
    name: card,
    ...(brief !== undefined ? { brief } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(repo !== undefined ? { repo } : {}),
    callerRepo: given.at ?? '.',
    isolate: given.noWorktree !== true,
    after: [...(given.after ?? [])],
    context: [...(given.context ?? [])],
    inputs: [...(given.inputs ?? [])],
    cards: [...(given.cards ?? [])],
    gates: [...(given.gates ?? [])],
    ...modelsGiven(given),
    labels: [...(given.label ?? [])],
    ...(factory !== undefined ? { factory } : {}),
    fix: given.fix ?? '--factory <name>',
  });
  return {
    id: started.run.id,
    run: started.run,
    home: yield* StoreRoot,
    card: started.card.name,
    ...(started.queueLeft !== undefined ? { queueLeft: started.queueLeft } : {}),
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
  } satisfies Started;
});

/** `nemia start`'s usage, as the help lists it. */
const START_USAGE =
  '<brief.md|card.md|"text"|folder> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--card <name> ...] [--gate <step> ...] [--model <step>=<model> ...] [--factory <name>] [--brief "<brief>"]';

/** `nemia start`'s help lines, under its usage. */
const START_LINES: readonly string[] = [
  'start a run of a workflow from a brief, a text, a card of the inbox or a',
  'folder of cards',
  '--after <runId>: file nothing of this run until nemia decide says that',
  'run has landed — finished, and its result branch on the base',
  'branch — and start from the base as it is then; once per run.',
  '--from <runId>: hand this run what that run concluded, as context,',
  'and wait on nothing: landed or still in flight, it is read once,',
  "when this run's steps are filed, and said not landed, not judged",
  'until it has landed; once per run.',
  "--gate <step>: that step's closeout waits for nemia approve before",
  "anything after it is filed, as a step's own gate: true does; once",
  "per step. An inbox card's gate: <step> is one more",
  '--model <step>=<model>: that step runs on the model in this run alone;',
  "its other steps, and every other run, keep their agents' models. Once",
  "per step, over an inbox card's model: for the same step. Refused, naming",
  "the models that keep it, where the step's harness refuses the model or",
  'its permission mode is dropped on it',
  '--workflows takes a folder, or a name under <repo>/workflows/: dev',
  'a folder of cards starts a plan, a run per card, parents first, at',
  'the command line alone (nemia start --help)',
  'a card of a plan (nemia start --help) starts its body: --workflows is its',
  'workflow: unless given, and its after: needs an --after for each',
  "a frontmatter block of keys a plan's card lacks is refused by its key,",
  'never taken as the brief: file an inbox card with nemia inbox add <file>',
  "--input <file>: copied into the run's own inputs/ directory, and named",
  "on every step's brief under what was asked for; once per file",
  '--card <name>: an inbox card, as nemia inbox lists it, copied as it',
  "reads now into the run's inputs/cards/<name>.md and named on every",
  "step's brief beside the files; once per card. A name with no card is",
  'refused before anything is written',
  '--factory <name>: the workflow must be attached to the factory, whose',
  'hires fill its steps, and a step left with no agent is refused (nemia',
  'factory --help). A factory with one repository gives the run its',
  "--repo, and a repository not one of the factory's is refused, naming",
  'them. Without it, the run is started in the factory whose repository',
  'holds --repo, else where nemia start is typed, on that repository, when',
  'one factory alone does; none, or two, is refused, naming the fix.',
  'The default factory is history only: --factory default is refused',
  'a card of the inbox (nemia inbox --help), by its path or its name,',
  'starts its body, or --brief "<brief>" in its place, and stays in the',
  'inbox, listed as started: --workflows is its workflow:',
  'unless given, --repo its repo:, --factory its factory:, and a card',
  'that names no factory either way is refused',
];

/** What `nemia start --help` prints: the start of one brief, then the start of a folder of cards (`FOLDER_HELP`). */
export const START_HELP = [`nemia start ${START_USAGE}`, ...START_LINES.map((line) => `  ${line}`), '', FOLDER_HELP].join('\n');

/** A text, or none: a key a caller may hand as undefined. */
const Text = Schema.optional(Schema.String);

/** Texts given many times, or none. */
const Texts = Schema.optional(Schema.Array(Schema.String));

/**
 * What `nemia start`'s handler is handed (`START`): a brief's start — `brief`, `workflows` (the folder), `repo` and `repoNamed`, the
 * runs it waits on (`after`) and is handed as context (`context`), `inputs`, the inbox cards it is handed (`cards`), `gates`, its
 * `label` edits, `noWorktree` and `factory` — or an inbox card's under `card`, with `instead`, `at` and `fix`. What a caller found,
 * never a body: the api finds the folder from the Run's `RunStart` (`objects`), the CLI from where it is typed.
 */
export const StartInput = Schema.Struct({
  brief: Text,
  workflows: Text,
  repo: Text,
  repoNamed: Schema.optional(Schema.Boolean),
  after: Texts,
  context: Texts,
  inputs: Texts,
  cards: Texts,
  gates: Texts,
  models: Texts,
  label: Texts,
  noWorktree: Schema.optional(Schema.Boolean),
  factory: Text,
  card: Text,
  instead: Text,
  at: Text,
  fix: Text,
});
export type StartInput = typeof StartInput.Type;

/**
 * `nemia start`: a run of a brief, or of an inbox card. Its handler is handed what its caller found: under `card`, an inbox card's name,
 * with `instead` the brief in place of its body, `at` the repository when neither the card nor its factory names one, and `fix` how the
 * caller names a factory; else `brief`, the brief's text, `workflows`, the folder, and `repo`, the repository, with `repoNamed` true where
 * a person named it. The CLI's runner reads a brief's file and finds the folder from where it is typed; the api's route finds both from its
 * body, so no path a body sends reaches the handler.
 */
export const START: Command<Started, StartInput> = {
  name: 'start',
  served: [
    {
      endpoint: 'runs.create',
      takes: givesNone('card'),
      request: refusing('start', PATHS_HERE, renamed({ workflows: 'workflow' }, ['repoNamed', 'instead', 'at', 'fix', 'card'])),
      answer: startedThere,
    },
    {
      endpoint: 'cards.start',
      as: 'inbox_start',
      request: refusing(
        'start',
        PATHS_HERE,
        renamed({ workflows: 'workflow', card: 'name', instead: 'brief' }, ['brief', 'repo', 'repoNamed', 'at', 'fix', 'factory', 'cards']),
      ),
      answer: startedThere,
    },
  ],
  usage: START_USAGE,
  help: START_LINES,
  manual: START_HELP,
  spec: START_SPEC,
  check: (args) => leftOut(START_SPEC, args),
  writes: true,
  ticks: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `create` of `objects`' Api, calling this handler with the folder it found" },
  input: StartInput,
  handler: Effect.fnUntraced(function* (given: StartInput) {
    const home = yield* StoreRoot;
    const started = yield* startOf(given);
    const paused = yield* pausedRead();
    const landed: string[] = [];
    const context = started.run.context ?? [];
    const git = context.length ? yield* standingLive([started.run]) : undefined;
    for (const id of context) if (git && (yield* parentRead(id, git)).landed) landed.push(id);
    const hints = yield* hintsOf(started.run);
    const notMounted = leftOutMounts(home, started.run);
    const notVolumes = leftOutVolumes(home, started.run);
    return {
      ...started,
      ...(paused.pause ? { paused } : {}),
      ...(started.run.context?.length ? { landed } : {}),
      ...(hints.length ? { hints } : {}),
      ...(notMounted.length ? { notMounted } : {}),
      ...(notVolumes.length ? { notVolumes } : {}),
    };
  }),
  print: (started) => (started.there === true ? startedThereLines(started) : startedLines(started)),
};

/** What `nemia concluded` answers: the run, whether it has landed, and the section a root handed it as context would be handed now. */
type Concluded = { run: string; landed: boolean; section: string };

/**
 * `nemia concluded <run>`: what a run started now with `--from <run>` would be handed of it — the `## From run <id>` section its roots
 * would read, made as the tick makes it (`parentCloseouts`, `contextSection`), labelled landed or not landed, not judged, as `parentOf`
 * reads it now. The board's preview of a run picked as context. Refused with `Invalid` for an id that is not a run's (`idRefusal`), before
 * the store is read, and with `Missing` for a run the store does not have.
 */
/** What `nemia concluded` takes, and the api's `GET /api/runs/:name/concluded` calls it with: the run, by its id. */
const ConcludedInput = Schema.Struct({ runId: Schema.String });

export const CONCLUDED: Served<Concluded, typeof ConcludedInput.Type> = {
  ...CONCLUDED_WORDS,
  input: ConcludedInput,
  handler: Effect.fnUntraced(function* (args: typeof ConcludedInput.Type) {
    const home = yield* StoreRoot;
    const id = args.runId;
    const notId = idRefusal(id, 'read', 'nemia concluded');
    if (notId) throw new Invalid({ message: notId });
    if (!runsAtOnce(home).runs.exists(id))
      throw new Missing({ message: `nemia concluded ${id}: the store has no run ${id}. It takes a run by its id — nemia ls lists them.` });
    const git = yield* standingLive([yield* (yield* RunDoor).runs.read(RunId.read(id))]);
    const [parent] = yield* parentCloseouts(yield* EngineService, [id], 'read', git);
    if (parent === undefined)
      throw new Missing({ message: `nemia concluded ${id}: nothing was read of run ${id}. See what it holds with nemia ls ${id}.` });
    return { run: id, landed: parent.landed, section: contextSection(parent) };
  }),
};

/**
 * The models `nemia start --model <step>=<model>` names (`modelsOf`), as the start is handed them: none where no `--model` was typed.
 * Refused (`Invalid`) where a pair does not read, before anything is read or written.
 */
const modelsGiven = (given: Pick<StartInput, 'models'>): { models?: RunModels } => {
  if (!given.models?.length) return {};
  const read = modelsOf(given.models);
  if ('why' in read) throw new Invalid({ message: `nemia start --model ${read.why}, once per step. Nothing was started.` });
  return { models: read.models };
};

/** A run of a brief, or of an inbox card under `card`, started off what the handler was handed (`START`). */
const startOf = Effect.fnUntraced(function* (given: StartInput) {
  const { card, factory } = given;
  if (card !== undefined) return yield* cardStart(card, given);
  const run = yield* startRun({
    brief: given.brief ?? '',
    repo: given.repo ?? '.',
    repoNamed: given.repoNamed === true,
    workflowDir: given.workflows ?? '',
    isolate: given.noWorktree !== true,
    after: [...(given.after ?? [])],
    context: [...(given.context ?? [])],
    inputs: [...(given.inputs ?? [])],
    cards: [...(given.cards ?? [])],
    gates: [...(given.gates ?? [])],
    ...modelsGiven(given),
    labels: { edits: [...(given.label ?? [])] },
    ...(factory !== undefined ? { factory } : {}),
  });
  return { id: run.id, run, home: yield* StoreRoot } satisfies Started;
});

/** The flags of `nemia start` that `nemia start <folder>` refuses, each with why the folder says it instead. */
const FOLDER_REFUSES: Readonly<Record<string, string>> = {
  '--after':
    'nemia start <folder> does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan. To wait on a run already started, start the card by hand: nemia start <card.md> --workflows <dir> --after <runId>.',
  '--from':
    'nemia start <folder> does not take --from: a card of a plan reads what its after: runs concluded. To hand one card another run as context, start it by hand: nemia start <card.md> --workflows <dir> --from <runId>.',
  '--workflows':
    'nemia start <folder> does not take --workflows: each card names its own, in its workflow: — a folder under <repo>/workflows/, or a path from the plan folder.',
  '--input':
    'nemia start <folder> does not take --input: a card has no input files of its own. Start that card by hand with its files: nemia start <card.md> --workflows <dir> --input <file>.',
  '--card':
    "nemia start <folder> does not take --card: a plan's cards are handed no other card. Start that card by hand with the cards to hand it: nemia start <card.md> --workflows <dir> --card <name>.",
  '--gate':
    "nemia start <folder> does not take --gate: a plan's cards are gated by their workflows' own gate: true. To gate one card's run at a step, start that card by hand: nemia start <card.md> --workflows <dir> --gate <step>.",
  '--model':
    "nemia start <folder> does not take --model: a plan's cards run on their agents' models. To run one card's step on another model, start that card by hand: nemia start <card.md> --workflows <dir> --model <step>=<model>.",
  '--brief':
    'nemia start <folder> does not take --brief: each card\'s body is its run\'s brief. To start one card with other words, start it by hand: nemia start <card.md> --brief "<brief>".',
  '--label':
    "nemia start <folder> does not take --label: a plan's cards are started as they are written. Label each card's run once it is started: nemia label run <runId> <key>=<value>.",
  '--no-worktree':
    'nemia start <folder> does not take --no-worktree: a card another waits on lands through a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
};

/**
 * Why `args`, a start's arguments as `START`'s spec parsed them, cannot start the folder of cards they name: the first flag a folder says
 * instead (`FOLDER_REFUSES`), in its words; or none.
 */
export function folderRefusal(args: Args): string | undefined {
  const given = (value: Args[string]) => value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0);
  const flag = START_SPEC.flags.find((f) => Object.hasOwn(FOLDER_REFUSES, f.flag) && f.key !== undefined && given(args[f.key]));
  return flag === undefined ? undefined : FOLDER_REFUSES[flag.flag];
}
