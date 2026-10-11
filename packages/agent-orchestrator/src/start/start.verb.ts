/**
 * Starting a workflow folder's run: the program `startRun`. It refuses what it can before anything is
 * written, and writes the run's record; nothing is filed here — the tick files a run's first steps on its next pass. `nemia plan` and the
 * inbox start their runs through it. A controller whose program requires nothing: the runtime it reads, through the client
 * (`runtime-client.ts`), is its harnesses, which say which steps a session can be bridged for, and never the engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { configRefusal, readRemote, tried } from '../runtime-client.ts';
import { remoteAgentsFile } from '../harness/a2a.store.ts';
import { workspacePlan } from '../workspace/workspace.ts';
import { type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness, remoteNameOf } from '../harness/harness.ts';
import { filedRefusal, lineOf } from '../keys/index.ts';
import { filedConfig } from '../filed/filed.ts';
import { budgetUsdFor, landsOnCheck } from '../status/status.ts';
import { renderedFlags } from '../agents/agents.ts';
import { ownOf } from '../tick/told.verb.ts';
import { fansOut, isFolderTeam } from '../workflow/index.ts';
import { formerModesWritten, loadWorkflows } from '../folder/folder.store.ts';
import { isShippedPlace, skillsFor, type Places } from '../skills/read.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { workRoot } from '../record/places.store.ts';
import { gateRefusal } from '../ending/ending.ts';
import { isRepositoryRun, type Mount, type Run } from '../record/record.ts';
import { afterRefusal } from '../wait/wait.ts';
import { contextRefusal } from './context.ts';
import { inputRefusal, type InputFile } from './inputs.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { storeRootRefusal } from './store-root.ts';
import { HOME, artifactsDir, inputsDir, runId, runsDir } from '../record/record.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { SHIPPED_PLACE, openPlace, readPlaceJson } from '../place/place.store.ts';
import type { PlaceVerb } from '../place/place.ts';
import { parentRecord } from '../branches/branches.store.ts';
import { standingLiveOf } from '../standing/standing.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  DEFAULT_FACTORY,
  factoryMountRefusal,
  factoryMounts,
  writableMountRefusal,
  writableRefusal,
  factoryRepo,
  fillsOf,
  outsideRefusal,
  unattachedRefusal,
  unfilledRefusal,
  type Factory,
} from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { readRules, rulesAt } from '../rules/rules.store.ts';
import { Context, Effect } from 'effect';

/**
 * The rules of `factory` a run started in it is told, read once from its file (`readRules`), or undefined where it keeps none. Refused
 * (`Invalid`), naming the file, before a run is written: a file there that cannot be told — a link, anything that is no file, one that
 * does not read, and a frontmatter block, since rules only add words.
 */
function rulesToTell(factory: Factory): string | undefined {
  const { words, error } = readRules(rulesAt(factory));
  if (error !== null)
    throw new Invalid({
      message: `${error} Or remove the rules: nemia factory rules ${factory.name} --clear. Nothing was started.`,
    });
  return words ?? undefined;
}

/**
 * A workflow folder's steps, as a run in `factory` runs them: each step its hires fill (`fillsOf`, by the folder's name) resolved against
 * the agent hired, as if its file named it. Refused: first, a workflow the factory has not attached (`unattachedRefusal`), before its
 * folder is read, since a factory offers only its workflows; then every step left with no agent (`unfilledRefusal`), since a factory's
 * steps are filled by its hires; and a hire into a step whose file names its own agent (`parseWorkflow`). With no factory — the default —
 * every workflow is offered, and a step that names no agent is a plain session, as it always was.
 *
 * The factory's rules are read here, once (`rulesToTell`), and handed to every step with its hires: the run freezes them with its steps.
 */
function stepsIn(workflowDir: string, places: Places, factory: Factory | undefined): Workflow[] {
  if (!factory) return loadWorkflows(workflowDir, places);
  const workflow = path.basename(path.resolve(workflowDir));
  const unattached = unattachedRefusal(factory, workflow);
  if (unattached) throw new Invalid({ message: unattached });
  const rules = rulesToTell(factory);
  const fills = { factory: factory.name, workflow, agents: fillsOf(factory.hires, workflow), ...(rules !== undefined && { rules }) };
  const steps = loadWorkflows(workflowDir, places, fills);
  const unfilled = unfilledRefusal(steps, factory.name, workflow);
  if (unfilled) throw new Invalid({ message: unfilled });
  return steps;
}

/**
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix. What `startPlan` asks of every card
 * before the first run is started. Refused:
 * - a folder that is not a workflow (`loadWorkflows`), and, in a factory, a workflow it has not attached, or a step its hires leave
 *   unfilled or fill twice (`stepsIn`);
 * - a team that says `place: folder` whose agent is given the package's place skill (`placeSkillRefusal`);
 * - with `isolate: false` (`--no-worktree`): a team that says `place: folder`, which has no base branch to work on in place; one that
 *   can run two steps at once, which would share a directory; and an ending (`workspace: main`), which would merge a result branch the run
 *   does not have into the branch it stands on;
 * - a step named for another step's check (`<step>-check`) or try (`<step>-try<n>`, `<step>-try<n>-check`): the run files those tasks
 *   under those names, and would read one task as the other;
 * - a remote agent not declared (`undeclaredRefusal`): the engine refuses it only when the step is filed, with the run on the record;
 * - a store (`WF_ROOT`) whose path a permission rule a step would be filed cannot carry (`storeRootRefusal`), in the store's words, asked
 *   before the runtime's, which would speak of a rule or a folder the person never wrote; the run's inputs folder among them when
 *   `given`, for a run `nemia start --input` gives files;
 * - a step whose first filing's config its harness refuses (`refused`, `configRefused` unless a caller gives another), the run started at
 *   `gates` beside the workflow's own: a word, a window, a cap or a bridge (`remote: true`) its harness does not take.
 */
export function stepsToStart(
  workflowDir: string,
  isolate: boolean,
  places: Places,
  factory?: Factory,
  gates: readonly string[] = [],
  refused: ConfigRefused = configRefused,
  given = false,
): Workflow[] {
  const steps = stepsIn(workflowDir, places, factory);
  if (!isolate && isFolderTeam(steps)) {
    throw new Invalid({
      message:
        `--no-worktree: this workflow's steps say \`place: folder\`, so each works in a folder the run makes, with no git repository — there is no base branch for them to work on in place.\n` +
        `Start it without --no-worktree.`,
    });
  }
  const placeSkill = placeSkillRefusal(steps, workflowDir, places);
  if (placeSkill) throw new Invalid({ message: placeSkill });
  if (!isolate && fansOut(steps)) {
    throw new Invalid({
      message:
        'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\n' +
        'Either drop --no-worktree, or make the steps a chain.',
    });
  }
  const ending = !isolate ? steps.find((s) => s.workspace === 'main') : undefined;
  if (ending) {
    throw new Invalid({
      message:
        `${ending.name}: \`workspace: main\` ends this workflow by merging the run's result branch onto the base branch, and --no-worktree gives the run no result branch — every step works on the base branch itself, where the work already is, so there would be nothing to merge.\n` +
        `Either drop --no-worktree, or start a workflow whose last step is not an ending.`,
    });
  }
  const clash = steps.find((s) => s.check && steps.some((other) => other.name === `${s.name}-check`));
  if (clash) {
    throw new Invalid({
      message: `${clash.name}-check: a step may not be named for another step's check. ${clash.name} has a \`check:\`, and the run files it as ${clash.name}-check. Rename ${clash.name}-check.md.`,
    });
  }
  const tryClash = steps
    .map((s) => ({ s, of: /^(.+)-try\d+(?:-check)?$/.exec(s.name)?.[1] }))
    .find(({ of }) => of && steps.some((other) => other.name === of));
  if (tryClash) {
    const { s, of } = tryClash;
    throw new Invalid({
      message: `${s.name}: a step may not be named for another step's try. The run files ${of} tried again as ${of}-try2, its check as ${of}-try2-check, and on. Rename ${s.name}.md.`,
    });
  }
  const undeclared = undeclaredRefusal(steps);
  if (undeclared) throw new Invalid({ message: undeclared });
  const unruled = storeRootRefusal(HOME, steps, {
    runArtifacts: startArtifacts(),
    inbox: inboxDir(),
    ...(given ? { inputs: inputsDir({ id: 'run' }) } : {}),
  });
  if (unruled) throw new Invalid({ message: unruled });
  const refusedConfig = refused(steps, places, gates, formerModesWritten(workflowDir));
  if (refusedConfig) throw new Invalid({ message: refusedConfig });
  return steps;
}

/**
 * Why a team that says `place: folder` cannot start: a step whose session is given a skill its places resolve to a place skill the package
 * ships (`isShippedPlace`), which acts on a repository a folder run does not have; undefined for a repository team, or where none is.
 */
function placeSkillRefusal(steps: readonly Workflow[], workflowDir: string, places: Places): string | undefined {
  if (!isFolderTeam(steps)) return undefined;
  const found = skillsFor(workflowDir, places).at;
  for (const step of steps) {
    const skill = step.agent?.skills?.find((name) => {
      const at = found.get(name);
      return typeof at === 'string' && isShippedPlace(at);
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
  steps: readonly Workflow[],
  places: Places,
  gates: readonly string[],
  written: Readonly<Record<string, string>> = {},
): string | undefined => refusedStep(steps, places, gates, written, [])?.why;

/** A run's artifacts folder as a start asks of its steps' first filing, before the run has an id. */
const startArtifacts = (): string => path.dirname(artifactsDir({ id: 'run' }, 'step'));

/** What the package's place denies a landing session (`denyWhileLanding`), as an ending's first filing is denied it. */
const shippedDenies = (): readonly string[] => readPlaceJson(SHIPPED_PLACE).denyWhileLanding;

/** `configRefused`'s refusal with the step it refuses, in a run that mounts `mounts` (`factoryMounts`). */
function refusedStep(
  steps: readonly Workflow[],
  places: Places,
  gates: readonly string[],
  written: Readonly<Record<string, string>>,
  mounts: readonly Mount[],
): { step: Workflow; why: string } | undefined {
  for (const step of steps.filter((s) => !isRemoteHarness(s.harness))) {
    const own = ownOf(step, renderedFlags(step, '.'), () => places.repo);
    const runArtifacts = startArtifacts();
    const config = filedConfig(
      step,
      steps,
      { gates: [...gates], ...(mounts.length ? { mounts: [...mounts] } : {}) },
      { model: step.model, budgetUsd: budgetUsdFor(step.budget), runArtifacts, inbox: inboxDir(), own, landingDenied: shippedDenies },
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
  steps: readonly Workflow[],
  places: Places,
  gates: readonly string[],
  written?: Readonly<Record<string, string>>,
) => string | undefined;

/** The refusal `startRun` asks of a folder's steps before a run is written: `configRefused`, unless a layer gives another. */
export const StartRefusal = Context.Reference<ConfigRefused>('orchestrator/StartRefusal', { defaultValue: () => configRefused });

/**
 * The place skill's directory a repository run is opened with at start (`openPlace`): the package's own place, unless a layer gives
 * another.
 */
export const StartPlace = Context.Reference<string>('orchestrator/StartPlace', { defaultValue: () => SHIPPED_PLACE });

/**
 * The first step whose `harness: a2a:<name>` names an agent the store's `a2a-agents.json` does not give the engine, refused with the fix,
 * or undefined. Read here, before the run is written, since the engine would otherwise refuse the filing on the first pass, with the run on
 * the record. A name the file does not declare is refused with the entry to add; a file refused as it stands, or the entry a step names
 * refused by the runtime, in the file's words (`readRemote`) — and only when a step names a remote agent, and only the entry it names:
 * `engine()` leaves out what is refused, and every other command and run works on.
 */
function undeclaredRefusal(steps: readonly Workflow[]): string | undefined {
  const remote = steps
    .map((s) => ({ s, name: remoteNameOf(s.harness) }))
    .filter((r): r is { s: Workflow; name: string } => r.name !== undefined);
  if (remote.length === 0) return undefined;
  const read = readRemote();
  if (read.unread)
    return `${remote[0].s.name}: \`harness: ${remote[0].s.harness}\` names a remote A2A agent, and the file that declares them is refused. ${read.unread}`;
  const refused = remote.find(({ name }) => read.refused.has(name));
  if (refused)
    return `${refused.s.name}: \`harness: ${refused.s.harness}\` names a remote A2A agent whose entry is refused. ${read.refused.get(refused.name)}`;
  const missing = remote.find(({ name }) => !read.agents.has(name));
  if (!missing) return undefined;
  const file = remoteAgentsFile(HOME);
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
  from?: { inbox: string };
  scheduled?: { factory: string; workflow: string; due: string };
  gates?: readonly string[];
  factory?: string;
};

/** What a run is told at `nemia start` and frozen on its record, whatever its place: the brief, the steps, and each option given. */
type Told = Pick<
  Run,
  | 'brief'
  | 'workflowDir'
  | 'workflow'
  | 'after'
  | 'context'
  | 'inputs'
  | 'from'
  | 'scheduled'
  | 'gates'
  | 'factory'
  | 'mounts'
  | 'gatesTimed'
  | 'deniedCounted'
>;

/** Why a folder team refuses `--repo`: its run works in folders it makes, and would never look at the repository named. */
const repoNamedRefusal = (repo: string): string =>
  `--repo ${repo}: this workflow's steps say \`place: folder\`, so the run works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${repo}.\n` +
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
 * Why `steps`, started from `opts` in `factory` on `own` (none for a folder run), cannot be given `mounts`: a `writable:` name no folder
 * answers (`writableRefusal`), or a step whose harness cannot hold its mounts: asked first of every folder read-only, as the run mounts
 * them (`factoryMountRefusal`), then of the folders its `writable:` names writable (`writableMountRefusal`). Nothing when every step can.
 */
function mountRefusal(
  opts: StartOptions,
  steps: Workflow[],
  places: Places,
  factory: Factory | undefined,
  own: string | undefined,
  mounts: readonly Mount[],
): string | undefined {
  const workflow = path.basename(path.resolve(opts.workflowDir));
  const unwritable = writableRefusal(steps, workflow, factory, own, mounts);
  if (unwritable || !factory || !mounts.length) return unwritable;
  const ask = (asked: readonly Workflow[]) => refusedStep(asked, places, opts.gates ?? [], formerModesWritten(opts.workflowDir), mounts);
  const reading = ask(steps.map(({ writable: _, ...step }) => step));
  if (reading) return factoryMountRefusal(factory, `${workflow}/${reading.step.name}`, reading.why);
  const writing = ask(steps);
  return writing && writableMountRefusal(factory, `${workflow}/${writing.step.name}`, writing.why);
}

/**
 * The factory's folders `startRun` left out of `run`'s mounts, as `nemia start` says them: each of its repositories but the run's own that
 * is no directory now, as none was at start. None for a run in the default factory, or in one whose file no longer reads.
 */
export function leftOutMounts(run: Run): string[] {
  if (!run.factory) return [];
  let factory: Factory;
  try {
    factory = readFactory(run.factory);
  } catch {
    return [];
  }
  const mounted = new Set((run.mounts ?? []).map((m) => m.path));
  return factoryMounts(factory, isRepositoryRun(run) ? run.repo : undefined)
    .map((m) => m.path)
    .filter((at) => !mounted.has(at) && !isDirectory(at));
}

/**
 * What `opts` tells the run, with `steps` as the workflow it freezes, `inputs` by name, `factory` the one it is started in, and `mounts`
 * the folders it gives each local step; an option not given is left out, and so are the default factory and no mounts. No gate of it is
 * timed yet (`gatesTimed`), and no denied call counted (`deniedCounted`).
 */
function toldOf(opts: StartOptions, steps: Workflow[], inputs: readonly InputFile[], factory: Factory | undefined, mounts: Mount[]): Told {
  const after = opts.after ?? [];
  const context = opts.context ?? [];
  const gates = opts.gates ?? [];
  return {
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
    ...(after.length ? { after: [...after] } : {}),
    ...(context.length ? { context: [...context] } : {}),
    ...(inputs.length ? { inputs: inputs.map((f) => path.basename(f.resolved)) } : {}),
    ...(opts.from ? { from: { inbox: opts.from.inbox } } : {}),
    ...(opts.scheduled
      ? { scheduled: { factory: opts.scheduled.factory, workflow: opts.scheduled.workflow, due: opts.scheduled.due } }
      : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
    ...(factory ? { factory: factory.name } : {}),
    ...(mounts.length ? { mounts } : {}),
    gatesTimed: [],
    deniedCounted: [],
  };
}

/**
 * A folder run's record, its workspace its own directory in the store: fails with an `--after`'s refusal (`afterRefusal`), where the runs
 * it waits on stand read now (`standingLiveOf`).
 */
const folderRun = Effect.fn('folderRun')(function* (id: string, told: Told, steps: Run['steps']) {
  const git = yield* standingLiveOf(told.after ?? []);
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { place: { kind: 'folder' } }, (id) => parentRecord(id, git)));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    place: { kind: 'folder' },
    workspace: workRoot(runsDir(), id),
    ...told,
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/**
 * The verbs a repository run's place must declare for this build to run `steps` through it: `make` and `handoff` when the run cuts
 * worktrees (`isolate`) and a step forks or merges (`workspacePlan`); `status` and `land` when an ending lands on its check
 * (`landsOnCheck`).
 */
export function placeVerbsNeeded(steps: readonly Workflow[], run: Pick<Run, 'gates'>, isolate: boolean): PlaceVerb[] {
  const cuts = isolate && steps.some((step) => ['fork', 'merge'].includes(workspacePlan(steps, step).kind));
  const lands = steps.some((step) => landsOnCheck(step, run));
  return [...(cuts ? (['make', 'handoff'] as const) : []), ...(lands ? (['status', 'land'] as const) : [])];
}

/**
 * A repository run's record on `repo`, as the place `StartPlace` names opens it (`openPlace`): the commit HEAD is at, the branch checked
 * out there, and the place skill it ran. Fails with the place's refusal, or an `--after`'s (`afterRefusal`), where the runs it waits on
 * stand read now (`standingLiveOf`).
 */
const repositoryRun = Effect.fn('repositoryRun')(function* (id: string, told: Told, steps: Run['steps'], repo: string, isolate: boolean) {
  const placeDir = yield* StartPlace;
  const needed = placeVerbsNeeded(told.workflow ?? [], told, isolate);
  const { opened, placeSkill } = yield* tried(() => openPlace(placeDir, repo, needed, isolate));
  const { baseRef, branch, staged } = opened;
  const git = yield* standingLiveOf(told.after ?? []);
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { repo, branch }, (id) => parentRecord(id, git)));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    repo,
    workspace: repo,
    baseRef,
    isolate,
    ...told,
    branch,
    placeSkill,
    ...(staged === undefined ? {} : { stagedFile: staged }),
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/** Copies `inputs` into the run's own `inputs/` (`inputsDir`); throws with exit 1 when one cannot be, the run's directory removed. */
function copyInputs(run: Run, inputs: readonly InputFile[]): void {
  if (!inputs.length) return;
  const dir = inputsDir(run);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of inputs) fs.copyFileSync(f.resolved, path.join(dir, path.basename(f.resolved)), fs.constants.COPYFILE_EXCL);
  } catch (err) {
    runStore.runs.forget(run.id);
    throw Object.assign(
      new Error(
        `--input: the run's files could not be copied into ${dir} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
}

/**
 * Renders the steps' agents into the run's `agents/` (`writeAgentFiles`), with the skills the folder's places hold (`skillsFor`); throws
 * with exit 1 when they cannot be, the run's directory removed.
 */
function renderAgents(run: Run, steps: readonly Workflow[], workflowDir: string, places: Places): void {
  try {
    writeAgentFiles(run, steps, skillsFor(workflowDir, places));
  } catch (err) {
    runStore.runs.forget(run.id);
    throw Object.assign(
      new Error(
        `the steps' agents could not be rendered into ${path.join(runsDir(), run.id, 'agents')} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
}

/** The factory a run is started in, read (`readFactory`); none for no name and for the default factory, which is no file. */
const factoryNamed = (name: string | undefined): Factory | undefined =>
  name === undefined || name === DEFAULT_FACTORY ? undefined : readFactory(name);

/**
 * The repository a run started in the factory `name` works on (`factoryRepo`): `named`, else the factory's one repository, else
 * `fallback`. What `nemia start` resolves its workflow folder against, before `start` judges it. Refused as `start` refuses the factory:
 * none by that name, or one whose file does not read (`readFactory`).
 */
export const repoFor = (name: string | undefined, named: string | undefined, fallback: string): string =>
  factoryRepo(factoryNamed(name), named, fallback);

/**
 * Starts a run of `opts.workflowDir`'s steps, and returns its record, written. Requires nothing: it reads no engine.
 *
 * `after` names the runs this one waits on (`nemia start --after`): refused before anything is written when one could never ship onto
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
 * `from` says where the brief came from — the inbox card `startFromInbox` starts — and is frozen on the record. Left out, the record has
 * none.
 *
 * `gates` are the steps whose closeout waits for a person before anything after them is filed, beside those the workflow gates itself
 * (`nemia start --gate`, a card's `gate:`): refused before anything is written when one is given twice or names no step of the workflow
 * (`gateRefusal`), and frozen on the record. Left out, the record has none.
 *
 * A team that says `place: folder` runs no git: the repository is not looked at, and refused when a person named it (`repoNamed`); the
 * run's own directory in the store is its workspace, each step's folder made beneath it when the step is filed (`folderPlace`).
 *
 * The record's steps are keyed in the order the steps run, as `loadWorkflows` gives them: the order `nemia ls`, `nemia decide` and the
 * board list them in. The inputs are copied and the steps' agents rendered (`writeAgentFiles`) before the record is written, so a record
 * never names a file that is not there: a copy or a render that fails removes the run's directory, and is an `Error` with exit 1.
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
 * no run started. Left out when none is mounted, and in the default factory.
 *
 * Fails with the refusal it met, every one before anything is written (`stepsToStart`, the place's `open` — a `.worktreeinclude` it
 * refuses among them, for a run that cuts worktrees — and those above); dies of anything else, an `open` not heard and the copy's and the
 * render's `Error` included (`tried`).
 */
export const startRun = Effect.fn('start')(function* (opts: StartOptions) {
  const isolate = opts.isolate ?? true;
  const places = placesOf(opts.repo);
  const factory = yield* tried(() => factoryNamed(opts.factory));
  const refused = yield* StartRefusal;
  const steps = yield* tried(() =>
    stepsToStart(opts.workflowDir, isolate, places, factory, opts.gates, refused, Boolean(opts.inputs?.length)),
  );
  const folder = isFolderTeam(steps);
  if (folder && opts.repoNamed) return yield* Effect.fail(new Invalid({ message: repoNamedRefusal(opts.repo) }));
  const outside = factory && !folder ? outsideRefusal(factory, opts.repo) : undefined;
  if (outside) return yield* Effect.fail(new Invalid({ message: outside }));
  const refusedGates = gateRefusal(opts.gates ?? [], steps);
  if (refusedGates) return yield* Effect.fail(new Invalid({ message: refusedGates }));
  const inputs = yield* tried(() => inputsOf(opts.inputs ?? []));
  const refusedInputs = inputRefusal(inputs);
  if (refusedInputs) return yield* Effect.fail(new Invalid({ message: refusedInputs }));
  let id = runId(opts.brief);
  while (runStore.runs.taken(id)) id = runId(opts.brief);
  const refusedContext = contextRefusal(opts.context ?? [], opts.after ?? [], runStore.runs.exists, id);
  if (refusedContext) return yield* Effect.fail(refusedContext);
  const mounts = mountsAt(factory, folder ? undefined : opts.repo);
  const unmounted = mountRefusal(opts, steps, places, factory, folder ? undefined : opts.repo, mounts);
  if (unmounted) return yield* Effect.fail(new Invalid({ message: unmounted }));
  const told = toldOf(opts, steps, inputs, factory, mounts);
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const run = yield* folder ? folderRun(id, told, stepRecords) : repositoryRun(id, told, stepRecords, opts.repo, isolate);
  yield* tried(() => copyInputs(run, inputs));
  yield* tried(() => renderAgents(run, steps, opts.workflowDir, places));
  yield* tried(() => runStore.runs.create(run));
  return run;
});
