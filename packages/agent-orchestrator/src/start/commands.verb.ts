/**
 * `nemia start`, an entry of the command table, whose words the client holds (`objects`' `START_WORDS`): the api's route finds the
 * workflow and the brief from its body and hands the handler what it found; the client reads the person's files where they are typed and
 * sends their text. What `nemia start` says of a run it started is answered here as data (`startedFacts`), which the client words.
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
import { requestReleased, startFromInbox } from '../inbox/inbox.verb.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { cardsDir, inputsDir } from '../record/record.store.ts';
import { carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { frozenStepsOf } from '../steps/steps.ts';
import { approvedFirst, gatesOf } from '../status/status.ts';
import { leftOutMounts, leftOutVolumes, startRun, type StartedRun } from './start.verb.ts';
import { modelsOf } from './models.ts';
import { volumeMounts } from '../factory/volume/index.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { pausedRead } from '../list/list.verb.ts';
import type { Paused } from '../pause/pause.ts';
import { parentRead } from '../views/views.verb.ts';
import { EngineService } from '../runtime-client.ts';
import { contextSection } from '../brief/index.ts';
import { parentCloseouts } from '../brief/handed.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { idRefusal } from '../forget/forget.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { settingsNamed } from '../harness-settings/harness-settings.ts';

/**
 * A run started, and, for an inbox card, the card, why its `queued:` line is still on it when it could not be taken off, a `repo:` the
 * start did not take, and the cards of its `after:` that had not succeeded (`waitedOn`); for a brief, the `--repo` that only found the
 * factory, where its wiring placed the run on another (`repoFoundFactory`, as typed); the store's pause as it stood once the run was
 * written (`pausedRead`), while one stands; `succeeded`, the
 * runs it is handed as context that had succeeded when it started; and `hints`, a line for each file of its folder that still writes a
 * former
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
  /** The cards of the card's `after:` that had not succeeded when a person started it all the same. */
  waitedOn?: readonly string[];
  repoFoundFactory?: string;
  paused?: Paused;
  succeeded?: readonly string[];
  hints?: readonly string[];
  /** The factory's repositories and volumes left out of the run's mounts, each no directory now (`leftOutMounts`, `leftOutVolumes`). */
  notMounted?: readonly string[];
  notVolumes?: readonly string[];
};

/** The steps of a run just started: the workflow `nemia start` froze on its record, which every run it writes has (`frozenStepsOf`). */
const startedSteps = (run: Run) => frozenStepsOf(run) ?? [];

/** The factory's volumes a run mounts: the paths of those read-only, and each writable one with the local steps whose fence writes it. */
function volumesOf(run: Run) {
  const volumes = run.volumes ?? [];
  const local = startedSteps(run).filter((s) => !isRemoteHarness(s.harness));
  return {
    reads: volumes.filter((v) => v.readOnly).map((v) => v.path),
    writes: volumes
      .filter((v) => !v.readOnly)
      .map((v) => ({ path: v.path, steps: local.filter((s) => volumeMounts(s, [v])[0]?.readOnly === false).map((s) => s.name) })),
  };
}

/** The steps of a run just started that wait on a person: those gated (`held`), and the endings a person approves first (`ends`). */
function gatesHeld(run: Run) {
  const steps = startedSteps(run);
  const ends = endingSteps(steps, run)
    .filter((s) => approvedFirst(s, run))
    .map((s) => s.name);
  return { held: gatesOf(steps, run).filter((name) => !ends.includes(name)), ends };
}

/** `list` under `key` where it holds any, else nothing: a key an answer leaves out rather than send empty. */
const some = <K extends string, V>(key: K, list: readonly V[] | undefined) =>
  list?.length ? ({ [key]: [...list] } as Record<K, V[]>) : {};

/**
 * What `nemia start` says of a run it started, as data (`objects`' `RunStartedFacts`), which the api answers and the client words
 * (`apps/cli`, `startedLines`): its steps, where it came from, its factory and repository, the folders and volumes it mounts, where it
 * works and copied its files, what it waits on and reads, the steps a person approves, its models and labels.
 */
export function startedFacts({ run, home }: Pick<Started, 'run' | 'home'>) {
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
  } satisfies RunStartedFacts as RunStartedFacts;
}

/**
 * The lines `nemia start` prints of `run`'s folder still on a former spelling, read through the Workflow door off the folder its record
 * names; none where the door refuses it, which the start has already said why.
 */
const hintsOf = Effect.fnUntraced(function* (run: Run) {
  const hints = (yield* WorkflowDoor).workflows.hints(WorkflowDir.read(run.workflowDir));
  return yield* hints.pipe(Effect.orElseSucceed(() => []));
});

/**
 * Why a card's start takes no `--repo`: a card names its factory and its workflow, and the factory's wiring places its run.
 * @param card The card's name, as the start names it.
 */
export const cardRepoRefusal = (card: string) =>
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
    released: requestReleased(yield* EngineService),
  });
  return {
    id: started.run.id,
    run: started.run,
    home: yield* StoreRoot,
    card: started.card.name,
    ...(started.queueLeft !== undefined ? { queueLeft: started.queueLeft } : {}),
    ...(started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {}),
    ...(started.waitedOn !== undefined ? { waitedOn: started.waitedOn } : {}),
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
    const started = yield* startOf(given);
    const paused = yield* pausedRead();
    const succeeded: string[] = [];
    const context = started.run.context ?? [];
    for (const id of context) if ((yield* parentRead(id)).standing.kind === 'released') succeeded.push(id);
    const hints = yield* hintsOf(started.run);
    const notMounted = yield* leftOutMounts(started.run);
    const notVolumes = yield* leftOutVolumes(started.run);
    return {
      ...started,
      ...(paused.pause ? { paused } : {}),
      ...(started.run.context?.length ? { succeeded } : {}),
      ...(hints.length ? { hints } : {}),
      ...(notMounted.length ? { notMounted } : {}),
      ...(notVolumes.length ? { notVolumes } : {}),
    };
  }),
};

/** What `nemia concluded` answers: the run, whether it has succeeded, and the section a root handed it as context would be handed now. */
type Concluded = { run: string; succeeded: boolean; section: string };

/**
 * `nemia concluded <run>`: what a run started now with `--from <run>` would be handed of it — the `## From run <id>` section its roots
 * would read, made as the tick makes it (`parentCloseouts`, `contextSection`), labelled succeeded or not succeeded, not judged, as
 * `parentOf`
 * reads it now. The board's preview of a run picked as context. Refused with `Invalid` for an id that is not a run's (`idRefusal`), before
 * the store is read, and with `Missing` for a run the store does not have.
 */
/** What `nemia concluded` takes, and the api's `GET /api/runs/:name/concluded` calls it with: the run, by its id. */
const ConcludedInput = Schema.Struct({ runId: Schema.String });

export const CONCLUDED: Served<Concluded, typeof ConcludedInput.Type> = {
  ...CONCLUDED_WORDS,
  input: ConcludedInput,
  handler: Effect.fnUntraced(function* (args: typeof ConcludedInput.Type) {
    const id = args.runId;
    const notId = idRefusal(id, 'read', 'nemia concluded');
    if (notId) throw new Invalid({ message: notId });
    if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
      throw new Missing({ message: `nemia concluded ${id}: the store has no run ${id}. It takes a run by its id — nemia ls lists them.` });
    const [parent] = yield* parentCloseouts(yield* EngineService, [id], 'read');
    if (parent === undefined)
      throw new Missing({ message: `nemia concluded ${id}: nothing was read of run ${id}. See what it holds with nemia ls ${id}.` });
    return { run: id, succeeded: parent.succeeded, section: contextSection(parent) };
  }),
};

/**
 * The models `nemia start --model <step>=<model>` names (`modelsOf`), as the start is handed them: none where no `--model` was typed.
 * Refused (`Invalid`) where a pair does not read, before anything is read or written.
 */
const modelsGiven = (given: Pick<StartInput, 'models'>) => {
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
