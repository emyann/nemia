/**
 * `nemia start`, an entry of the command table, whose words the client holds (`objects`' `START_WORDS`): the api's route finds the
 * workflow and the brief from its body and hands the handler what it found; the client reads the person's files where they are typed and
 * sends their text. The lines `nemia start` prints of a run it started are made here (`startedLines`), which the api answers beside it.
 */
import path from 'node:path';
import { type RunStartedFacts, START_WORDS } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import type { Served } from '../command/entry.verb.ts';
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

/**
 * A run started, and, for an inbox card, the card, why its `queued:` line is still on it when it could not be taken off, and a `repo:` the
 * start did not take; for a brief, the `--repo` that only found the factory, where its wiring placed the run on another
 * (`repoFoundFactory`, as typed); the store's pause as it stood once the run was written (`pausedRead`), while one stands; `landed`, the
 * runs it is handed as context that had landed when it started; and `hints`, a line for each file of its folder that still writes a former
 * spelling, read through the Workflow door (`hints`), where any does.
 */
export type Started = {
  id: string;
  run: StartedRun;
  /** The store's root the run was started in, where its inputs and its copies of its workflow's files are. */
  home: string;
  card?: string;
  queueLeft?: string;
  ignoredRepo?: string;
  repoFoundFactory?: string;
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

/** The factory's volumes a run mounts: the paths of those read-only, and each writable one with the local steps whose fence writes it. */
function volumesOf(run: Run): { reads: string[]; writes: { path: string; steps: string[] }[] } {
  const volumes = run.volumes ?? [];
  const local = startedSteps(run).filter((s) => !isRemoteHarness(s.harness));
  return {
    reads: volumes.filter((v) => v.readOnly).map((v) => v.path),
    writes: volumes
      .filter((v) => !v.readOnly)
      .map((v) => ({ path: v.path, steps: local.filter((s) => volumeMounts(s, [v])[0]?.readOnly === false).map((s) => s.name) })),
  };
}

/**
 * The factory's volumes a run mounts: those read-only, then each writable one with the steps whose fence writes it (`volumeMounts`), and
 * that it is not the run's workspace; then those left out because they were no directory.
 */
function volumeLines(run: Run, missing: readonly string[]): string[] {
  const { reads, writes } = volumesOf(run);
  return [
    ...(reads.length ? [`volumes: ${reads.join(', ')} — read-only, for every local step`] : []),
    ...writes.map(
      (w) =>
        `volume: ${w.path} — ${w.steps.length ? `writable for ${w.steps.join(', ')}, read-only for every other local step` : 'writable, and read-only for every step here, since none writes'}; not the run's workspace: nothing commits or lands what a step writes there`,
    ),
    ...(missing.length
      ? [`not mounted: ${missing.join(', ')} — of the factory's volumes, and no directory now; start again once it is there`]
      : []),
  ];
}

/** The steps of a run just started that wait on a person: those gated (`held`), and the endings a person approves first (`ends`). */
function gatesHeld(run: Run): { held: string[]; ends: string[] } {
  const steps = startedSteps(run);
  const ends = endingSteps(steps, run)
    .filter((s) => approvedFirst(s, run))
    .map((s) => s.name);
  return { held: gatesOf(steps, run).filter((name) => !ends.includes(name)), ends };
}

/** The steps of a run just started that wait on a person: each gated, and the ending a person approves before it is filed. */
function gateLines(run: Run): string[] {
  const { held, ends } = gatesHeld(run);
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
/**
 * That `--repo` (`given`, as typed) only found the factory the run is started in: the run works on the repository its wiring names for its
 * workflow, the folder `run.workflowDir` names.
 */
const foundFactoryLine = (given: string, run: StartedRun): string =>
  `--repo ${given} only found the factory ${run.factory ?? ''}: ${path.basename(run.workflowDir)} works on ${run.repo}`;

/**
 * What `nemia start` prints of a run it started: its steps, where it came from, its factory and a `--repo` that only found it, the folders
 * it mounts, where it works, where
 * it copied its inputs and its workflow's files, and what it waits on, what it reads as context, landed or in flight, and ends at; while
 * the store is paused (`pausedWords`), that nothing of it is filed until it resumes; and a card's `repo:` not taken.
 */
export function startedLines(started: Started): string[] {
  const { run, home } = started;
  const steps = startedSteps(run);
  return [
    `${run.id}  ${steps.length} step(s): ${steps.map((s) => (s.agent ? `${s.name} (${s.agent.name})` : s.name)).join(' → ')}`,
    ...fromLines(started),
    ...(run.factory ? [`factory: ${run.factory}${isRepositoryRun(run) ? `, on ${run.repo}` : ''}`] : []),
    ...(started.repoFoundFactory !== undefined ? [foundFactoryLine(started.repoFoundFactory, run)] : []),
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

/** `list` under `key` where it holds any, else nothing: a key an answer leaves out rather than send empty. */
const some = <K extends string, V>(key: K, list: readonly V[] | undefined): Partial<Record<K, V[]>> =>
  list?.length ? ({ [key]: [...list] } as Record<K, V[]>) : {};

/**
 * What `nemia start` prints of a run it started, as data (`objects`' `RunStartedFacts`), which the api answers and the client words: the
 * facts `startedLines` says, each read as it reads them.
 */
export function startedFacts({ run, home }: Pick<Started, 'run' | 'home'>): RunStartedFacts {
  const steps = startedSteps(run);
  const { reads, writes } = volumesOf(run);
  const { held, ends } = gatesHeld(run);
  const named = (map: Readonly<Record<string, string>> | undefined) =>
    map !== undefined && Object.keys(map).length ? { ...map } : undefined;
  const models = named(run.models);
  const labels = named(run.labels);
  return {
    steps: steps.map((s) => ({ name: s.name, ...(s.agent ? { agent: s.agent.name } : {}) })),
    ...(run.from ? { from: run.from.inbox } : {}),
    ...(run.factory ? { factory: run.factory } : {}),
    repo: run.repo ?? '',
    repository: isRepositoryRun(run),
    workflow: path.basename(run.workflowDir),
    ...some(
      'mounts',
      run.mounts?.map((m) => m.path),
    ),
    ...some(
      'writable',
      writersOf(steps, run.mounts).map((w) => ({ path: w.path, steps: [...w.steps] })),
    ),
    ...some('volumes', reads),
    ...some('writableVolumes', writes),
    ...some(
      'settings',
      settingsNamed(run.harnessSettings).map((s) => s.name),
    ),
    workspace: run.workspace ?? '',
    ...(run.inputs?.length ? { inputs: { names: [...run.inputs], dir: inputsDir(home, run) } } : {}),
    ...(run.cards?.length ? { cards: { names: [...run.cards], dir: cardsDir(home, run) } } : {}),
    ...(run.workflowFiles === undefined ? {} : { workflowFiles: workflowFilesDir(home, run, run.workflowFiles) }),
    ...(run.carriedFiles === undefined ? {} : { carriedFiles: carriedFilesDir(home, run, run.carriedFiles) }),
    ...some('after', run.after),
    branch: run.branch ?? '',
    ...some('context', run.context),
    ...some('gated', held),
    ...some('ends', ends),
    ...(models !== undefined ? { models } : {}),
    ...(labels !== undefined ? { labels } : {}),
    ...some(
      'labelsLeftOut',
      run.labelsLeftOut?.map(({ key, values }) => ({ key, values: values.map((v) => ({ run: v.run, value: v.value })) })),
    ),
  };
}

/**
 * The lines `nemia start` prints of `run`'s folder still on a former spelling, read through the Workflow door off the folder its record
 * names; none where the door refuses it, which the start has already said why.
 */
const hintsOf = Effect.fnUntraced(function* (run: Run) {
  const hints = (yield* WorkflowDoor).workflows.hints(WorkflowDir.read(run.workflowDir));
  return yield* hints.pipe(Effect.orElseSucceed((): readonly string[] => []));
});

/**
 * Why a card's start takes no `--repo`: a card names its factory and its workflow, and the factory's wiring places its run.
 */
export const cardRepoRefusal = (card: string): string =>
  `nemia start ${card} does not take --repo: a card's run works on the repository its factory names for its workflow, never one its start names. Start it without --repo, and name the repository on the factory: nemia factory attach <factory> <workflow> --repo <name>. Nothing was started.`;

/**
 * An inbox card's start, off what the handler was handed (`START`): `at` is the folder a card of the default factory is started on, and
 * read for no other; refused `Invalid` a `repo` given (`cardRepoRefusal`).
 */
const cardStart = Effect.fnUntraced(function* (card: string, given: StartInput) {
  const { instead: brief, workflows: workflow, factory } = given;
  if (given.repo !== undefined) return yield* Effect.fail(new Invalid({ message: cardRepoRefusal(card) }));
  const started = yield* startFromInbox({
    name: card,
    ...(brief !== undefined ? { brief } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
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
  repoFoundFactory: Text,
});
export type StartInput = typeof StartInput.Type;

/**
 * `nemia start`: a run of a brief, or of an inbox card. Its handler is handed what its caller found: under `card`, an inbox card's name,
 * with `instead` the brief in place of its body, `at` the repository a card of the default factory is started on, and `fix` how the caller
 * names a factory; else `brief`, the brief's text, `workflows`, the folder, and `repo`, the repository, with `repoNamed` true where a
 * person named it and `repoFoundFactory` the `--repo` typed where it only found the factory, whose wiring placed the run on `repo`. The
 * CLI's runner reads a brief's file and finds the folder from where it is typed; the api's route finds both from its body, so no path a
 * body sends reaches the handler.
 */
export const START: Served<Started, StartInput> = {
  ...START_WORDS,
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
  const found = given.repoFoundFactory !== undefined ? { repoFoundFactory: given.repoFoundFactory } : {};
  return { id: run.id, run, home: yield* StoreRoot, ...found } satisfies Started;
});
