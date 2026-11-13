/**
 * Starting a workflow folder's run: the program `startRun`. It refuses what it can before anything is written, and writes the run's record;
 * nothing is filed here — the tick files a run's first steps on its next pass. `nemia start <folder>` and the inbox start their runs
 * through it. A controller whose program requires nothing: the runtime it reads, through the client (`runtime-client.ts`), is its
 * harnesses, which say which steps a session can be bridged for, and never the engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { configRefusal, readRemote, tried } from '../runtime-client.ts';
import { remoteAgentsFile } from '../harness/a2a.store.ts';
import { type StepSpec } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness, remoteNameOf } from '../harness/harness.ts';
import { filedRefusal, lineOf } from '../keys/index.ts';
import { filedConfig } from '../filed/filed.ts';
import { budgetUsdFor } from '../status/status.ts';
import { renderedFlags } from '../agents/agents.ts';
import { ownOf } from '../tick/told.verb.ts';
import { isFolderTeam, stepSetRefusal, unallowedRefusal } from '../workflow/index.ts';
import { formerModesWritten, workflowDirAt } from '../folder/folder.store.ts';
import { isBuiltinPlace, type Places } from '../skills/read.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import type { SkillsFound } from '../agents/agents.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { pinsOf } from '../revisions/pin.verb.ts';
import { workRoot } from '../record/places.store.ts';
import { gateRefusal } from '../ending/ending.ts';
import { modelsRefusal, withModels, type RunModels } from './models.ts';
import { isRepositoryRun, type Mount, type Run } from '../record/record.ts';
import type { HarnessSettings } from '../harness-settings/harness-settings.ts';
import { settingsAt } from '../harness-settings/harness-settings.verb.ts';
import { afterRefusal } from '../wait/wait.ts';
import { contextRefusal } from './context.ts';
import { cardsRefusal, inputRefusal, type InputFile } from './inputs.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { inboxNameRefusal } from '../inbox/index.ts';
import { inboxDir } from '../record/files.store.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { storeRootRefusal } from './store-root.ts';
import { artifactsDir, cardsDir, inputsDir, runId, runsDir } from '../record/record.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { carriedFilesOf, freezeCarriedFiles, freezeWorkflowFiles, workflowFilesOf } from '../frozen/frozen.store.ts';
import { PlaceService, openPlace } from '../place/place.store.ts';
import { parentRecord } from '../steps/steps.verb.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { standingLiveOf } from '../standing/standing.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { NO_ALLOWS, repoAllows, type Allows } from '../trust/allows.verb.ts';
import {
  factoryMountRefusal,
  factoryMounts,
  factoryVolumes,
  volumeMountRefusal,
  writableMountRefusal,
  writableRefusal,
  factoryRepo,
  wiredRepo,
  outsideRefusal,
  unattachedRefusal,
  unfilledRefusal,
  type Factory,
} from '../factory/factory.ts';
import { factoryOrNone, filedAtOnce } from '../factory/door/factories.store.ts';
import { factoryFills } from '../factory/rules/rules.store.ts';
import { Context, Effect } from 'effect';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { inheritedLabels, parseLabelEdits, type Inherited, type LabelChange, type Labels, type LeftOut } from '../labels/labels.ts';
import { StoreRoot } from '../config/root.store.ts';

/**
 * A workflow folder's steps, as a run in `factory` runs them: each step its hires fill (`factoryFills`, by the folder's name) resolved
 * against the agent hired, as if its file named it. Refused: first, a workflow the factory has not attached (`unattachedRefusal`), before
 * its folder is read, since a factory offers only its workflows; then every step left with no agent (`unfilledRefusal`), since a factory's
 * steps are filled by its hires; and a hire into a step whose file names its own agent (`parseWorkflow`). With no factory — the default —
 * every workflow is offered, and a step that names no agent is a plain session, as it always was.
 *
 * The factory's rules are read here, once, with its hires (`factoryFills`), and handed to every step: the run freezes them with its
 * steps. Refused (`Invalid`), naming the file, before a run is written: a rules file that cannot be told — a link, anything that is no
 * file, one that does not read, and a frontmatter block, since rules only add words.
 */
const stepsIn = Effect.fnUntraced(function* (workflowDir: string, places: Places, factory: Factory | undefined) {
  const home = yield* StoreRoot;
  const workflows = (yield* WorkflowDoor).workflows;
  const dir = yield* tried(() => workflowDirAt(workflowDir));
  if (!factory) return yield* workflows.read(dir, places);
  const workflow = path.basename(path.resolve(workflowDir));
  const unattached = unattachedRefusal(factory, workflow);
  if (unattached) return yield* Effect.fail(new Invalid({ message: unattached }));
  const { fills, error } = factoryFills(home, factory, workflow);
  if (error !== null)
    return yield* Effect.fail(
      new Invalid({
        message: `${error} Or remove the rules: nemia factory rules ${factory.name} --clear. Nothing was started.`,
      }),
    );
  const steps = yield* workflows.read(dir, places, fills);
  const unfilled = unfilledRefusal(steps, factory.name, workflow);
  if (unfilled) return yield* Effect.fail(new Invalid({ message: unfilled }));
  return steps;
});

/**
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix. What `startPlan` asks of every card
 * before the first run is started. Refused:
 * - a folder that is not a workflow (the Workflow door's `read`), and, in a factory, a workflow it has not attached, or a step its hires
 *   leave unfilled or fill twice (`stepsIn`);
 * - a step set no run may take (`stepSetRefusal`, pure, asked of a folder a waiting run takes again too): a step named for another step's
 *   check or try, and, with `isolate: false` (`--no-worktree`), a `place: folder` team, one that fans out, and an ending;
 * - a team that says `place: folder` whose agent is given the package's place skill (`placeSkillRefusal`);
 * - a remote agent not declared (`undeclaredRefusal`): the engine refuses it only when the step is filed, with the run on the record;
 * - a store (`WF_ROOT`) whose path a permission rule a step would be filed cannot carry (`storeRootRefusal`), in the store's words, asked
 *   before the runtime's, which would speak of a rule or a folder the person never wrote; the run's inputs folder among them when
 *   `given`, for a run `nemia start --input` gives files;
 * - a step whose first filing's config its harness refuses (`refused`, `configRefused` unless a caller gives another), the run started at
 *   `gates` beside the workflow's own and given the factory's judged `harnessSettings`: a word, a window, a cap or a bridge
 *   (`remote: true`) its harness does not take;
 * - a step `models` names that it cannot run on (`modelsRefusal`): one the workflow does not have, one on a remote agent, and one whose
 *   mode the model drops; the steps are then judged with their models set (`withModels`), so what the harness
 *   refuses of a step's config on its model is refused as `refused` refuses it;
 * - a step whose `tools:` names a tool nothing its session would be allowed (`unallowedRefusal`, pure, asked of a folder a waiting run
 *   takes again too), judged against `allows`, the allow rules the run's own repository grants a session started in it (`repoAllows`).
 *
 * The skills a folder team's place skills are judged against are `known` where given — the start's own read, which renders the agents
 * too, so a start asks the Skill door once — else read from the Skill door for a folder team alone.
 */
export const stepsToStart = Effect.fn('stepsToStart')(function* (
  workflowDir: string,
  isolate: boolean,
  places: Places,
  denied: readonly string[],
  factory?: Factory,
  gates: readonly string[] = [],
  refused: ConfigRefused = configRefused,
  given = false,
  allows: Allows = NO_ALLOWS,
  known?: SkillsFound,
  harnessSettings?: HarnessSettings,
  models: RunModels = {},
  modelSaid: (step: string) => string = (step) => `--model ${step}=${models[step] ?? ''}`,
) {
  const home = yield* StoreRoot;
  const read = yield* stepsIn(workflowDir, places, factory);
  const unmodelled = modelsRefusal(read, models, modelSaid);
  if (unmodelled) return yield* Effect.fail(new Invalid({ message: unmodelled }));
  const steps = withModels(read, models);
  const found = known ?? (isFolderTeam(steps) ? yield* (yield* SkillDoor).skills.found({ dir: workflowDir, places }) : undefined);
  const asked = { refused, given, allows, harnessSettings };
  return yield* tried(() => startable(home, steps, workflowDir, isolate, places, denied, found, gates, asked));
});

/** `stepsToStart`'s judgement of the steps read, past the folder's load: each refusal it names thrown as `Invalid`. */
function startable(
  home: string,
  steps: StepSpec[],
  workflowDir: string,
  isolate: boolean,
  places: Places,
  denied: readonly string[],
  found: SkillsFound | undefined,
  gates: readonly string[],
  {
    refused,
    given,
    allows,
    harnessSettings,
  }: { refused: ConfigRefused; given: boolean; allows: Allows; harnessSettings?: HarnessSettings },
): StepSpec[] {
  const set = stepSetRefusal(steps, isolate);
  if (set) throw new Invalid({ message: set });
  const unallowed = unallowedRefusal(steps, allows.rules, allows.untrusted);
  if (unallowed) throw new Invalid({ message: unallowed });
  const placeSkill = placeSkillRefusal(steps, found);
  if (placeSkill) throw new Invalid({ message: placeSkill });
  const undeclared = undeclaredRefusal(steps, home);
  if (undeclared) throw new Invalid({ message: undeclared });
  const unruled = storeRootRefusal(home, steps, {
    runArtifacts: startArtifacts(home),
    inbox: inboxDir(home),
    ...(given ? { inputs: inputsDir(home, { id: 'run' }) } : {}),
  });
  if (unruled) throw new Invalid({ message: unruled });
  const refusedConfig = refused(home, steps, places, gates, denied, formerModesWritten(workflowDir), harnessSettings);
  if (refusedConfig) throw new Invalid({ message: refusedConfig });
  return steps;
}

/**
 * Why a team that says `place: folder` cannot start: a step whose session is given a skill its places resolve to a builtin place skill
 * (`isBuiltinPlace`), which acts on a repository a folder run does not have; undefined for a repository team, or where none is. The skills
 * are those the Skill door `found` in the folder's places, read only for a folder team.
 */
function placeSkillRefusal(steps: readonly StepSpec[], found: SkillsFound | undefined): string | undefined {
  if (!isFolderTeam(steps) || found === undefined) return undefined;
  for (const step of steps) {
    const skill = step.agent?.skills?.find((name) => {
      const at = found.at.get(name);
      return typeof at === 'string' && isBuiltinPlace(at);
    });
    if (skill)
      return (
        `${step.name}: its agent is given the skill \`${skill}\`, the ${skill} place's, and this workflow's steps say \`place: folder\`: a folder run has no repository for it to act on.\n` +
        `Take \`${skill}\` off the agent's \`skills:\`, or start a workflow whose steps work in a repository.`
      );
  }
  return undefined;
}

/**
 * The first step whose config, as its first filing would file it (`filedConfig`) in a run started at `gates`, the runtime refuses on its
 * harness (`configRefusal`), in the runtime's words after the step's line they come from (`filedRefusal`); undefined where every step's
 * is taken. A step on a remote agent is configured by its operator, and asked nothing. Its agent's flags name the folder the run renders
 * it to, and an ending's read the run's artifacts folder, neither there yet. The runtime judges which flags a step has, and of a path a
 * permission rule names, a mount's or an allow's, whether the rule can carry it, never whether it is there; a store whose own path no
 * rule can carry is refused before it, in the store's words (`storeRootRefusal`). A step whose sandbox its file writes as
 * `permissionMode:` (`written`, by the step's name) is quoted by that line.
 */
export const configRefused = (
  home: string,
  steps: readonly StepSpec[],
  places: Places,
  gates: readonly string[],
  denied: readonly string[],
  written: Readonly<Record<string, string>> = {},
  harnessSettings?: HarnessSettings,
): string | undefined => refusedStep(home, steps, places, gates, written, [], denied, [], harnessSettings)?.why;

/** A run's artifacts folder as a start asks of its steps' first filing, before the run has an id. */
const startArtifacts = (home: string): string => path.dirname(artifactsDir(home, { id: 'run' }, 'step'));

/**
 * `configRefused`'s refusal with the step it refuses, in a run that mounts `mounts` (`factoryMounts`) and the volumes `volumes`
 * (`volumesAt`), given the factory's harness settings `harnessSettings` (`settingsAt`), and whose place denies a landing session
 * `denied`.
 */
function refusedStep(
  home: string,
  steps: readonly StepSpec[],
  places: Places,
  gates: readonly string[],
  written: Readonly<Record<string, string>>,
  mounts: readonly Mount[],
  denied: readonly string[],
  volumes: readonly Mount[] = [],
  harnessSettings?: HarnessSettings,
): { step: StepSpec; why: string } | undefined {
  for (const step of steps.filter((s) => !isRemoteHarness(s.harness))) {
    const own = ownOf(step, renderedFlags(step, '.'), () => places.repo);
    const runArtifacts = startArtifacts(home);
    const config = filedConfig(
      step,
      steps,
      {
        gates: [...gates],
        ...(mounts.length ? { mounts: [...mounts] } : {}),
        ...(volumes.length ? { volumes: [...volumes] } : {}),
        ...(harnessSettings ? { harnessSettings } : {}),
      },
      { model: step.model, budgetUsd: budgetUsdFor(step.budget), runArtifacts, inbox: inboxDir(home), own, landingDenied: () => denied },
    );
    const former = written[step.name];
    const lines = (field: string) =>
      field === 'permissionMode' && former !== undefined ? `permissionMode: ${former}` : lineOf(step)(field);
    const why = filedRefusal((c) => configRefusal(step.harness ?? DEFAULT_HARNESS, c), step.name, config, lines);
    if (why) return { step, why };
  }
  return undefined;
}

/** What `stepsToStart` asks last of a folder's steps: why the runtime refuses one's first filing, or undefined (`configRefused`). */
export type ConfigRefused = (
  home: string,
  steps: readonly StepSpec[],
  places: Places,
  gates: readonly string[],
  denied: readonly string[],
  written?: Readonly<Record<string, string>>,
  harnessSettings?: HarnessSettings,
) => string | undefined;

/** The refusal `startRun` asks of a folder's steps before a run is written: `configRefused`, unless a layer gives another. */
export const StartRefusal = Context.Reference<ConfigRefused>('orchestrator/StartRefusal', { defaultValue: () => configRefused });

/**
 * The first step whose `harness: a2a:<name>` names an agent the store's `a2a-agents.json` does not give the engine, refused with the fix,
 * or undefined. Read here, before the run is written, since the engine would otherwise refuse the filing on the first pass, with the run on
 * the record. A name the file does not declare is refused with the entry to add; a file refused as it stands, or the entry a step names
 * refused by the runtime, in the file's words (`readRemote`) — and only when a step names a remote agent, and only the entry it names:
 * `engine()` leaves out what is refused, and every other command and run works on.
 */
function undeclaredRefusal(steps: readonly StepSpec[], home: string): string | undefined {
  const remote = steps
    .map((s) => ({ s, name: remoteNameOf(s.harness) }))
    .filter((r): r is { s: StepSpec; name: string } => r.name !== undefined);
  const [first] = remote;
  if (first === undefined) return undefined;
  const read = readRemote(home);
  if (read.unread)
    return `${first.s.name}: \`harness: ${first.s.harness}\` names a remote A2A agent, and the file that declares them is refused. ${read.unread}`;
  const refused = remote.find(({ name }) => read.refused.has(name));
  if (refused)
    return `${refused.s.name}: \`harness: ${refused.s.harness}\` names a remote A2A agent whose entry is refused. ${read.refused.get(refused.name)}`;
  const missing = remote.find(({ name }) => !read.agents.has(name));
  if (!missing) return undefined;
  const file = remoteAgentsFile(home);
  const has = read.agents.size === 0 ? 'declares none' : `declares ${[...read.agents.keys()].map((n) => `\`${n}\``).join(', ')}`;
  return `${missing.s.name}: \`harness: ${missing.s.harness}\` names a remote A2A agent \`${missing.name}\`, and ${file} ${has}. Add it there — \`{ "${missing.name}": { "url": "https://…" } }\`, the agent's base URL, where its card is served — or name a declared one.`;
}

/** What `nemia start` is told: the brief, the repository and the workflow folder, and what `startRun` says of each of the rest. */
export type StartOptions = {
  brief: string;
  repo: string;
  repoNamed?: boolean;
  workflowDir: string;
  isolate?: boolean;
  after?: readonly string[];
  context?: readonly string[];
  inputs?: readonly string[];
  /** The inbox cards to hand the run (`nemia start --card`), by name: each copied into its `inputs/cards/` (`cardsDir`). */
  cards?: readonly string[];
  from?: { inbox: string };
  scheduled?: { factory: string; workflow: string; due: string };
  gates?: readonly string[];
  /**
   * The model each step it names runs on, for this run alone (`nemia start --model <step>=<model>`, a card's `model:`), by the step's
   * name: refused before anything is written where a step cannot run on its model (`modelsRefusal`), set on the steps the run freezes
   * (`withModels`), and frozen on the record as `models`. Left out, every step runs on its agent's.
   */
  models?: RunModels;
  /** How a refusal of `models` names where a step's model was said: a card's line, by the step's name. Left out, `--model <step>=<m>`. */
  modelSaid?: (step: string) => string;
  factory?: string;
  /**
   * The labels the run is created with, beside what its `after` and `context` runs agree on: the card's own (`card`), and the start's
   * typed edits (`nemia start --label`, `key=value` / `key-`), each over the last (`inheritedLabels`).
   */
  labels?: { card?: Labels; edits?: readonly string[] };
};

/**
 * A run as `startRun` answers it: its record, its person labels as they were written (`labels`, absent for none), and each key its
 * named runs disagreed on, which it was not given (`labelsLeftOut`, absent for none): said by `nemia start`, never written in the record.
 */
export type StartedRun = Run & { readonly labelsLeftOut?: readonly LeftOut[] };

/** What a run is told at `nemia start` and frozen on its record, whatever its place: the brief, the steps, and each option given. */
type Told = Pick<
  Run,
  | 'brief'
  | 'workflowDir'
  | 'workflow'
  | 'after'
  | 'context'
  | 'inputs'
  | 'cards'
  | 'from'
  | 'scheduled'
  | 'gates'
  | 'models'
  | 'factory'
  | 'mounts'
  | 'volumes'
  | 'harnessSettings'
  | 'costLine'
  | 'gatesTimed'
  | 'deniedCounted'
  | 'settlesCounted'
  | 'runTimed'
>;

/** Why a folder team refuses `--repo`: its run works in folders it makes, and would never look at the repository named. */
const repoNamedRefusal = (home: string, repo: string): string =>
  `--repo ${repo}: this workflow's steps say \`place: folder\`, so the run works in folders it makes under ${workRoot(runsDir(home), '<run>')}, with no git repository, and would never look at ${repo}.\n` +
  `Start it without --repo, or start a workflow whose steps work on a repository.`;

/**
 * The files `nemia start --input` names, each resolved from where it is typed, and what is there: a file, a directory, other or nothing.
 */
function inputsOf(given: readonly string[]): InputFile[] {
  return given.map((g): InputFile => {
    const resolved = path.resolve(g);
    const at = fs.statSync(resolved, { throwIfNoEntry: false });
    return { given: g, resolved, kind: !at ? 'missing' : at.isFile() ? 'file' : at.isDirectory() ? 'directory' : 'other' };
  });
}

/** Whether `at` is a directory now. */
const isDirectory = (at: string): boolean => fs.statSync(at, { throwIfNoEntry: false })?.isDirectory() === true;

/**
 * The folders a run in `factory` on `repo` mounts (`factoryMounts`), each a directory now; none in the default factory. A folder run gives
 * no `repo`.
 */
const mountsAt = (factory: Factory | undefined, repo: string | undefined): Mount[] =>
  factory ? factoryMounts(factory, repo).filter((m) => isDirectory(m.path)) : [];

/**
 * The volumes of `factory` a run in it mounts (`factoryVolumes`), each marked as named and a directory now; none in the default factory.
 */
const volumesAt = (factory: Factory | undefined): Mount[] => (factory ? factoryVolumes(factory).filter((v) => isDirectory(v.path)) : []);

/**
 * Why `steps`, started from `opts` in `factory` on `own` (none for a folder run), cannot be given `mounts`: a `writable:` name no folder
 * answers (`writableRefusal`), or a step whose harness cannot hold its mounts: asked first of every folder read-only, as the run mounts
 * them (`factoryMountRefusal`), then of the folders its `writable:` names writable (`writableMountRefusal`), then of the factory's volumes
 * as each step is filed them (`volumeMountRefusal`). Nothing when every step can.
 */
function mountRefusal(
  home: string,
  opts: StartOptions,
  steps: StepSpec[],
  places: Places,
  factory: Factory | undefined,
  own: string | undefined,
  mounts: readonly Mount[],
  denied: readonly string[],
  { volumes, harnessSettings }: { volumes: readonly Mount[]; harnessSettings: HarnessSettings | undefined },
): string | undefined {
  const workflow = path.basename(path.resolve(opts.workflowDir));
  const unwritable = writableRefusal(steps, workflow, factory, own, mounts);
  if (unwritable || !factory || (!mounts.length && !volumes.length)) return unwritable;
  const ask = (asked: readonly StepSpec[], given: readonly Mount[] = []) =>
    refusedStep(home, asked, places, opts.gates ?? [], formerModesWritten(opts.workflowDir), mounts, denied, given, harnessSettings);
  const reading = ask(steps.map(({ writable: _, ...step }) => step));
  if (reading) return factoryMountRefusal(factory, `${workflow}/${reading.step.name}`, reading.why);
  const writing = ask(steps);
  if (writing) return writableMountRefusal(factory, `${workflow}/${writing.step.name}`, writing.why);
  const volume = volumes.length ? ask(steps, volumes) : undefined;
  return volume && volumeMountRefusal(factory, `${workflow}/${volume.step.name}`, volume.why);
}

/**
 * The factory's folders `startRun` left out of `run`'s mounts, as `nemia start` says them: each of its repositories but the run's own that
 * is no directory now, as none was at start. None for a run in the default factory, or in one whose file no longer reads.
 */
export function leftOutMounts(home: string, run: Run): string[] {
  return leftOut(home, run).mounts;
}

/**
 * The factory's volumes `startRun` left out of `run`'s volumes, as `nemia start` says them: each no directory now, as none was at start.
 */
export function leftOutVolumes(home: string, run: Run): string[] {
  return leftOut(home, run).volumes;
}

/** The factory's folders and volumes `startRun` left out of `run`, each no directory now; none where the factory does not read. */
function leftOut(home: string, run: Run): { mounts: string[]; volumes: string[] } {
  if (!run.factory) return { mounts: [], volumes: [] };
  let factory: Factory | undefined;
  try {
    factory = filedAtOnce(home, run.factory);
  } catch {
    return { mounts: [], volumes: [] };
  }
  if (factory === undefined) return { mounts: [], volumes: [] };
  const mounted = new Set([...(run.mounts ?? []), ...(run.volumes ?? [])].map((m) => m.path));
  const missing = (at: string) => !mounted.has(at) && !isDirectory(at);
  return {
    mounts: factoryMounts(factory, isRepositoryRun(run) ? run.repo : undefined)
      .map((m) => m.path)
      .filter(missing),
    volumes: factoryVolumes(factory)
      .map((v) => v.path)
      .filter(missing),
  };
}

/** The models a run is started with, as its record freezes them: none where it names none. */
const frozenModels = (models: RunModels | undefined): Pick<Told, 'models'> =>
  models !== undefined && Object.keys(models).length ? { models: { ...models } } : {};

/**
 * What `opts` tells the run, with `steps` as the workflow it freezes, `inputs` by name, `factory` the one it is started in, `mounts`
 * the folders it gives each local step, `volumes` the factory's volumes, and `harnessSettings` its harness settings, and the cost line
 * the factory sets for the workflow, by its folder's name (`costLine`); an option not given is
 * left out, and so are the default
 * factory, no mounts and no volumes. No gate of it is
 * timed yet (`gatesTimed`), no denied call counted (`deniedCounted`), no settle counted (`settlesCounted`), and its timeline not handed
 * to the metrics (`runTimed`).
 */
function toldOf(
  opts: StartOptions,
  steps: StepSpec[],
  inputs: readonly InputFile[],
  factory: Factory | undefined,
  mounts: Mount[],
  volumes: Mount[],
  harnessSettings: HarnessSettings | undefined,
): Told {
  const after = opts.after ?? [];
  const context = opts.context ?? [];
  const gates = opts.gates ?? [];
  const costLine = factory?.costLines?.[path.basename(opts.workflowDir)];
  return {
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
    ...(after.length ? { after: [...after] } : {}),
    ...(context.length ? { context: [...context] } : {}),
    ...(inputs.length ? { inputs: inputs.map((f) => path.basename(f.resolved)) } : {}),
    ...(opts.cards?.length ? { cards: [...opts.cards] } : {}),
    ...(opts.from ? { from: { inbox: opts.from.inbox } } : {}),
    ...(opts.scheduled
      ? { scheduled: { factory: opts.scheduled.factory, workflow: opts.scheduled.workflow, due: opts.scheduled.due } }
      : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
    ...frozenModels(opts.models),
    ...(factory ? { factory: factory.name } : {}),
    ...(mounts.length ? { mounts } : {}),
    ...(volumes.length ? { volumes } : {}),
    ...(harnessSettings ? { harnessSettings } : {}),
    ...(costLine === undefined ? {} : { costLine }),
    gatesTimed: [],
    deniedCounted: [],
    settlesCounted: [],
    runTimed: false,
  };
}

/** Each run an `--after` names, as its record and `git` say it (`parentRecord`), read before the edges are judged. */
const parentsOf = (after: readonly string[], git: BranchReader) =>
  Effect.map(
    Effect.forEach(new Set(after), (id) => Effect.map(parentRecord(id, git), (parent) => [id, parent] as const)),
    (pairs) => new Map(pairs),
  );

/**
 * A folder run's record, its workspace its own directory in the store: fails with an `--after`'s refusal (`afterRefusal`), where the runs
 * it waits on stand read now (`standingLiveOf`).
 */
const folderRun = Effect.fn('folderRun')(function* (id: string, told: Told, steps: Run['steps']) {
  const home = yield* StoreRoot;
  const git = yield* standingLiveOf(told.after ?? []);
  const parents = yield* parentsOf(told.after ?? [], git);
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { place: { kind: 'folder' } }, (id) => parents.get(id) ?? {}));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    place: { kind: 'folder' },
    workspace: workRoot(runsDir(home), id),
    ...told,
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/**
 * A repository run's record on `repo`, as the place the program was given opens it (`openPlace`): the commit HEAD is at and the
 * branch checked out there. Fails with the place's refusal, or an `--after`'s (`afterRefusal`), where the runs it waits on
 * stand read now (`standingLiveOf`).
 */
const repositoryRun = Effect.fn('repositoryRun')(function* (id: string, told: Told, steps: Run['steps'], repo: string, isolate: boolean) {
  const place = yield* PlaceService;
  const { baseRef, branch, inProgressFile: staged } = yield* tried(() => openPlace(place, repo, isolate));
  const git = yield* standingLiveOf(told.after ?? []);
  const parents = yield* parentsOf(told.after ?? [], git);
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { repo, branch }, (id) => parents.get(id) ?? {}));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    repo,
    workspace: repo,
    baseRef,
    isolate,
    ...told,
    branch,
    ...(staged === undefined ? {} : { stagedFile: staged }),
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/**
 * Copies `inputs` into the run's own `inputs/` (`inputsDir`), and the text of each card handed (`cards`, by name) into its `cards/`
 * (`cardsDir`) as `<name>.md`, each exclusively; throws with exit 1 when one cannot be, the run's directory removed.
 */
function copyInputs(home: string, run: Run, inputs: readonly InputFile[], cards: ReadonlyMap<string, string>): void {
  if (!inputs.length && !cards.size) return;
  const dir = inputsDir(home, run);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of inputs) fs.copyFileSync(f.resolved, path.join(dir, path.basename(f.resolved)), fs.constants.COPYFILE_EXCL);
    if (cards.size) fs.mkdirSync(cardsDir(home, run));
    for (const [name, text] of cards) fs.writeFileSync(path.join(cardsDir(home, run), `${name}.md`), text, { flag: 'wx' });
  } catch (err) {
    runsAtOnce(home).runs.forget(run.id);
    throw Object.assign(
      new Error(
        `--input: the run's files could not be copied into ${dir} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
}

/**
 * Renders the steps' agents into the run's `agents/` (`writeAgentFiles`), with the skills the Skill door `found` in the folder's places,
 * then copies the workflow folder into the run's own `workflow/<hex>/` (`freezeWorkflowFiles`) and the carried folder beside it, where
 * one is there, into `carried/<hex>/` (`freezeCarriedFiles`), and answers each copy's hex; throws with exit 1 when one cannot be written,
 * the run's directory removed. A link or a file of another kind in either folder is refused before the run has an id
 * (`workflowFilesOf`), so what fails here is a write.
 */
function renderAgents(home: string, run: Run, steps: readonly StepSpec[], found: SkillsFound): Pick<Run, 'workflowFiles' | 'carriedFiles'> {
  let what = `the steps' agents could not be rendered into ${path.join(runsDir(home), run.id, 'agents')}`;
  try {
    writeAgentFiles(home, run, steps, found);
    what = `the workflow's files could not be copied into ${path.join(runsDir(home), run.id, 'workflow')}`;
    const workflowFiles = freezeWorkflowFiles(home, run, run.workflowDir);
    what = `the carried files could not be copied into ${path.join(runsDir(home), run.id, 'carried')}`;
    const carriedFiles = freezeCarriedFiles(home, run, run.workflowDir);
    return carriedFiles === undefined ? { workflowFiles } : { workflowFiles, carriedFiles };
  } catch (err) {
    runsAtOnce(home).runs.forget(run.id);
    throw Object.assign(
      new Error(`${what} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`),
      { exitCode: 1 },
    );
  }
}

/**
 * The factory a run is started in, read through the door (`filedAtOnce`); none for no name and for the default factory, which is no file.
 */
const factoryNamed = (home: string, name: string | undefined): Factory | undefined =>
  name === undefined ? undefined : filedAtOnce(home, name);

/**
 * The repository a run started by `nemia start` in the factory `name` works on where no wiring places it (`factoryRepo`): `named`, else
 * the factory's one repository, else `fallback`. Kept for the command line's start in the default factory alone: a card, a brief and a
 * schedule are placed by the factory's wiring (`wiredRepoFor`). Refused as `start` refuses the factory: none by that name, or one whose
 * file does not read (`readFactory`).
 */
export const repoFor = (home: string, name: string | undefined, named: string | undefined, fallback: string): string =>
  factoryRepo(factoryNamed(home, name), named, fallback);

/**
 * The repository a run of the workflow named `workflow` works on in the factory `name` (`wiredRepo`): the one its wiring names by folder
 * name, else its only one; none for the default factory, which is no file and has no wiring. Refused, `Invalid`, in
 * `workflowRepoRefusal`'s words naming `nemia factory attach <factory> <workflow> --repo <name>`: a
 * factory of several repositories that names none for it, or a name none or two of them have; and as `start` refuses the factory.
 */
export const wiredRepoFor = (home: string, name: string, workflow: string): string | undefined => {
  const factory = filedAtOnce(home, name);
  if (factory === undefined) return undefined;
  const of = wiredRepo(factory, workflow);
  if ('repo' in of) return of.repo;
  throw new Invalid({ message: of.message });
};

/**
 * Starts a run of `opts.workflowDir`'s steps, and returns its record, written. Requires nothing: it reads no engine.
 *
 * `after` names the runs this one waits on (`nemia start --after`): refused before anything is written when one could never land on
 * this run's base, or when the run is a folder run, which has no branch to wait for (`afterRefusal`), and frozen on the record. Left out,
 * the record has no `after`.
 *
 * `context` names the runs this one is handed as context (`nemia start --from`): refused before anything is written when one is not in the
 * store, is named twice or is also in `after` (`contextRefusal`), and frozen on the record. A run in flight is taken. Never waited on.
 * Left out, the record has no `context`.
 *
 * `inputs` are files to hand every step (`nemia start --input`), by path from where `nemia start` is typed: refused before anything is
 * written when one is not a file or two would take one name (`inputRefusal`), then copied into the run's own `inputs/` (`inputsDir`), and
 * their names frozen on the record. Left out, no directory is made, and the record has no `inputs`.
 *
 * `cards` are inbox cards to hand every step (`nemia start --card`), by name: refused before anything is written when one is no card's
 * name, is named twice, is not in the inbox (`Missing`), or an `--input` would take their folder (`cardsRefusal`), then each copied as it
 * reads now into the run's `inputs/cards/<name>.md` (`cardsDir`), and their names frozen on the record. Left out, the record has no
 * `cards`.
 *
 * `from` says where the brief came from — the inbox card `startFromInbox` starts — and is frozen on the record. Left out, the record has
 * none.
 *
 * `gates` are the steps whose closeout waits for a person before anything after them is filed, beside those the workflow gates itself
 * (`nemia start --gate`, a card's `gate:`): refused before anything is written when one is given twice or names no step of the workflow
 * (`gateRefusal`), and frozen on the record. Left out, the record has none.
 *
 * `models` names the model a step runs on in this run alone (`nemia start --model <step>=<model>`, a card's `model:`): refused before
 * anything is written where a step cannot run on it (`stepsToStart`), set on the steps the record freezes, and frozen on the record as
 * `models`, which every revision the run takes after it keeps (`withModels`). Left out, the record has none.
 *
 * A team that says `place: folder` runs no git: the repository is not looked at, and refused when a person named it (`repoNamed`); the
 * run's own directory in the store is its workspace, each step's folder made beneath it when the step is filed (`folderPlace`).
 *
 * The record's steps are keyed in the order the steps run, as `loadWorkflows` gives them: the order `nemia ls`, `nemia decide` and the
 * board list them in. The inputs are copied and the steps' agents rendered (`writeAgentFiles`) before the record is written, so a record
 * never names a file that is not there: a copy or a render that fails removes the run's directory, and is an `Error` with exit 1.
 *
 * The workflow folder is copied whole into the run's own `workflow/<hex>/` (`freezeWorkflowFiles`), its digest frozen on the record as
 * `workflowFiles`, so each check and session reads the folder's files as they were now (`WF_WORKFLOW_FILES`), whatever repository the
 * run is on and whatever the folder holds later; the carried folder beside it (`carried/`), where one is there, is copied the same way
 * into `carried/<hex>/`, frozen as `carriedFiles` and told as `WF_CARRIED_FILES`. A link or a file of another kind in either folder is
 * refused (`Invalid`) before anything is written (`workflowFilesOf`).
 *
 * `factory` names the factory the run is started in (`nemia start --factory`): its hires fill the workflow's steps (`stepsToStart`), read
 * as they are now and frozen into the run's steps, so a later hire changes no run started. Refused before anything is written when it names
 * no factory, or one whose file does not read (`readFactory`), when it has not attached the workflow (`stepsIn`), and, for a repository
 * run, when `repo` is not one of its repositories (`outsideRefusal`); a folder team works on none. Its name is frozen on the record. Left
 * out, or the default factory, nothing is read, and the record has no `factory`: a record that names none is the default factory's.
 *
 * In a factory, the run mounts its folders (`factoryMounts`): every repository of the factory but the one a repository run works on, each
 * read-only, and all of them for a folder run, which works on none. A folder that is no directory at start is left out, and `nemia start`
 * says it (`leftOutMounts`); a step whose harness cannot hold them is refused before anything is written (`configRefused`). A step's
 * `writable:` names the folders it alone is filed writable (`stepMounts`), each refused unless one folder of the factory has the name and
 * is mounted or the run's own (`writableRefusal`), and on a harness that holds no writable mount (`writableMountRefusal`). The list
 * is frozen on the record as `mounts`, filed with every local step and named on its brief, so a later change to the factory changes
 * no run started. Left out when none is mounted, and in the default factory. Its volumes (`factoryVolumes`), each a directory now, are
 * frozen beside them as `volumes` (`volumesAt`), filed with every local step as marked, a writable one only where the step's fence
 * writes (`volumeMounts`); a step whose harness cannot hold one is refused before anything is written (`volumeMountRefusal`). Its harness
 * settings are frozen beside them as `harnessSettings`, given to every step on their harness (`filedConfig`); a key a factory may not
 * set, written into its file by hand, refuses the start `Invalid` before anything is written (`settingsAt`). The cost line it sets for the
 * workflow, by its folder's name (`costLines`), is frozen beside them as `costLine`: a gate whose caps pass it says so, and holds auto
 * back (`gateBudgets`, `withinBudget`).
 *
 * The revision of every kind the run resolved — its workflow, each agent, each of their skills and the factory's rules — is appended to
 * the ledger and pinned on the record as `pinned` (`pinsOf`); a run that has filed nothing resolves them again on every pass, so an
 * edit made while it waits `--after` reaches its first filing.
 *
 * `labels` are the run's person labels, copied once, at creation (`inheritedLabels`): every key the `after` and `context` runs agree on,
 * the card's own over them, and the typed edits over those. A key two of those runs disagree on that neither the card nor an edit sets is
 * left out, and answered on `labelsLeftOut` for `nemia start` to say. Refused before anything is written: an edit that is not `key=value`
 * or `key-`, or names a key or value a label cannot hold (`parseLabelEdits`). Written beside the record (`runs.labels.put`) only when
 * there are any.
 *
 * Fails with the refusal it met, every one before anything is written (`stepsToStart`, the place's `open` — a `.worktreeinclude` it
 * refuses among them, for a run that cuts worktrees — and those above); dies of anything else, an `open` not heard and the copy's and the
 * render's `Error` included (`tried`).
 */
export const startRun = Effect.fn('start')(function* (opts: StartOptions) {
  const home = yield* StoreRoot;
  const edits = yield* labelEditsOf(opts);
  const isolate = opts.isolate ?? true;
  const places = placesOf(home, opts.repo);
  const factory = yield* factoryOrNone(opts.factory);
  const harnessSettings = yield* settingsAt(factory);
  const refused = yield* StartRefusal;
  const { declared } = yield* PlaceService;
  const denied = declared.denyWhileLanding;
  const found = yield* (yield* SkillDoor).skills.found({ dir: opts.workflowDir, places });
  const steps = yield* stepsToStart(
    opts.workflowDir,
    isolate,
    places,
    denied,
    factory,
    opts.gates,
    refused,
    givenAny(opts),
    yield* tried(() => repoAllows(opts.repo, opts.factory)),
    found,
    harnessSettings,
    opts.models,
    opts.modelSaid,
  );
  const folder = isFolderTeam(steps);
  if (folder && opts.repoNamed) return yield* Effect.fail(new Invalid({ message: repoNamedRefusal(home, opts.repo) }));
  const outside = factory && !folder ? outsideRefusal(factory, opts.repo) : undefined;
  if (outside) return yield* Effect.fail(new Invalid({ message: outside }));
  const refusedGates = gateRefusal(opts.gates ?? [], steps);
  if (refusedGates) return yield* Effect.fail(new Invalid({ message: refusedGates }));
  const inputs = yield* tried(() => inputsOf(opts.inputs ?? []));
  const refusedInputs = inputRefusal(inputs);
  if (refusedInputs) return yield* Effect.fail(new Invalid({ message: refusedInputs }));
  const cards = yield* cardsOf(opts.cards ?? [], inputs);
  yield* tried(() => workflowFilesOf(opts.workflowDir));
  yield* tried(() => carriedFilesOf(opts.workflowDir));
  let id = runId(opts.brief);
  while (runsAtOnce(home).runs.taken(id)) id = runId(opts.brief);
  const refusedContext = contextRefusal(opts.context ?? [], opts.after ?? [], (runId) => runsAtOnce(home).runs.exists(runId), id);
  if (refusedContext) return yield* Effect.fail(refusedContext);
  const inherited = yield* inheritedOf(opts, edits);
  const mounts = mountsAt(factory, folder ? undefined : opts.repo);
  const volumes = volumesAt(factory);
  const unmounted = mountRefusal(home, opts, steps, places, factory, folder ? undefined : opts.repo, mounts, denied, {
    volumes,
    harnessSettings,
  });
  if (unmounted) return yield* Effect.fail(new Invalid({ message: unmounted }));
  const told = toldOf(opts, steps, inputs, factory, mounts, volumes, harnessSettings);
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const run = yield* folder ? folderRun(id, told, stepRecords) : repositoryRun(id, told, stepRecords, opts.repo, isolate);
  yield* tried(() => copyInputs(home, run, inputs, cards));
  Object.assign(run, yield* tried(() => renderAgents(home, run, steps, found)));
  const pinned = yield* pinsOf(run, steps, run.createdAt);
  if (pinned.length) run.pinned = pinned;
  yield* (yield* RunDoor).runs.create(run);
  return yield* labelled(run, inherited);
});

/** Whether a start hands its run anything to copy into its inputs: a file (`--input`) or a card (`--card`). */
const givenAny = (opts: Pick<StartOptions, 'inputs' | 'cards'>): boolean => Boolean(opts.inputs?.length || opts.cards?.length);

/**
 * The text of each inbox card `cards` names, by name, read through the Card door: refused before anything is written where they cannot
 * be handed (`cardsRefusal`) — `Missing` where the only fault is a card the inbox does not have, else `Invalid`.
 */
const cardsOf = Effect.fn('cardsOf')(function* (cards: readonly string[], inputs: readonly InputFile[]) {
  const door = yield* CardDoor;
  const texts = new Map<string, string>();
  for (const card of new Set(cards)) {
    if (inboxNameRefusal(card) !== undefined) continue;
    const text = yield* door.cards.read(CardName.read(card));
    if (text !== null) texts.set(card, text);
  }
  const names = inputs.map((f) => path.basename(f.resolved));
  const unnamed = cards.filter((card) => inboxNameRefusal(card) !== undefined);
  const refused = cardsRefusal(cards, unnamed, [...texts.keys()], names);
  if (refused === null) return texts;
  const onlyMissing = cardsRefusal(cards, unnamed, cards, names) === null;
  return yield* Effect.fail(onlyMissing ? new Missing({ message: refused }) : new Invalid({ message: refused }));
});

/** The start's `--label` edits, parsed: refused `Invalid`, naming `--label`, where one does not parse (`parseLabelEdits`). */
const labelEditsOf = Effect.fnUntraced(function* (opts: StartOptions) {
  const parsed = parseLabelEdits(opts.labels?.edits ?? []);
  if ('refused' in parsed) return yield* Effect.fail(new Invalid({ message: `--label: ${parsed.refused}` }));
  return parsed.edits;
});

/** The labels a run of `opts` is created with (`inheritedLabels`): its `after` and `context` runs' read through the Run door. */
const inheritedOf = Effect.fnUntraced(function* (opts: StartOptions, edits: readonly LabelChange[]) {
  const door = yield* RunDoor;
  const named = [...new Set([...(opts.after ?? []), ...(opts.context ?? [])])];
  const parents = yield* Effect.forEach(named, (parent) =>
    Effect.map(
      door.runs.find(RunId.read(parent), () => {}),
      (found) => ({ run: parent, labels: found?.labels ?? {} }),
    ),
  );
  const card = opts.labels?.card;
  return inheritedLabels({ parents, ...(card !== undefined ? { card } : {}), edits });
});

/** `run`, just created, with its labels written beside it when it has any, and answered with them and what was left out. */
const labelled = Effect.fnUntraced(function* (run: Run, inherited: Inherited) {
  const any = Object.keys(inherited.labels).length > 0;
  if (any) yield* (yield* RunDoor).labels.put(RunId.read(run.id), inherited.labels);
  const started: StartedRun = {
    ...run,
    ...(any ? { labels: inherited.labels } : {}),
    ...(inherited.leftOut.length ? { labelsLeftOut: inherited.leftOut } : {}),
  };
  return started;
});
