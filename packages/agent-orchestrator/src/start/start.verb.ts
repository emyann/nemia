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
import { type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness, remoteNameOf } from '../harness/harness.ts';
import { filedRefusal, lineOf } from '../keys/index.ts';
import { filedConfig } from '../filed/filed.ts';
import { budgetUsdFor } from '../status/status.ts';
import { renderedFlags } from '../agents/agents.ts';
import { ownOf } from '../tick/told.verb.ts';
import { isFolderTeam, stepSetRefusal, unallowedRefusal } from '../workflow/index.ts';
import { formerModesWritten, loadWorkflows } from '../folder/folder.store.ts';
import { isBuiltinPlace, skillsFor, type Places } from '../skills/read.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { pinsOf } from '../revisions/pin.verb.ts';
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
import { PlaceService, openPlace } from '../place/place.store.ts';
import { parentRecord } from '../branches/branches.store.ts';
import { standingLiveOf } from '../standing/standing.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { NO_ALLOWS, repoAllows, type Allows } from '../trust/allows.verb.ts';
import {
  DEFAULT_FACTORY,
  factoryMountRefusal,
  factoryMounts,
  writableMountRefusal,
  writableRefusal,
  factoryRepo,
  outsideRefusal,
  unattachedRefusal,
  unfilledRefusal,
  type Factory,
} from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { factoryFills } from '../rules/rules.store.ts';
import { Context, Effect } from 'effect';
import { RunDoor } from '../runs/runs.store.ts';

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
function stepsIn(workflowDir: string, places: Places, factory: Factory | undefined): Workflow[] {
  if (!factory) return loadWorkflows(workflowDir, places);
  const workflow = path.basename(path.resolve(workflowDir));
  const unattached = unattachedRefusal(factory, workflow);
  if (unattached) throw new Invalid({ message: unattached });
  const { fills, error } = factoryFills(factory, workflow);
  if (error !== null)
    throw new Invalid({
      message: `${error} Or remove the rules: nemia factory rules ${factory.name} --clear. Nothing was started.`,
    });
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
 * - a step set no run may take (`stepSetRefusal`, pure, asked of a folder a waiting run takes again too): a step named for another step's
 *   check or try, and, with `isolate: false` (`--no-worktree`), a `place: folder` team, one that fans out, and an ending;
 * - a team that says `place: folder` whose agent is given the package's place skill (`placeSkillRefusal`);
 * - a remote agent not declared (`undeclaredRefusal`): the engine refuses it only when the step is filed, with the run on the record;
 * - a store (`WF_ROOT`) whose path a permission rule a step would be filed cannot carry (`storeRootRefusal`), in the store's words, asked
 *   before the runtime's, which would speak of a rule or a folder the person never wrote; the run's inputs folder among them when
 *   `given`, for a run `nemia start --input` gives files;
 * - a step whose first filing's config its harness refuses (`refused`, `configRefused` unless a caller gives another), the run started at
 *   `gates` beside the workflow's own: a word, a window, a cap or a bridge (`remote: true`) its harness does not take;
 * - a step whose `tools:` names a tool nothing its session would be allowed (`unallowedRefusal`, pure, asked of a folder a waiting run
 *   takes again too), judged against `allows`, the allow rules the run's own repository grants a session started in it (`repoAllows`).
 */
export function stepsToStart(
  workflowDir: string,
  isolate: boolean,
  places: Places,
  denied: readonly string[],
  factory?: Factory,
  gates: readonly string[] = [],
  refused: ConfigRefused = configRefused,
  given = false,
  allows: Allows = NO_ALLOWS,
): Workflow[] {
  const steps = stepsIn(workflowDir, places, factory);
  const set = stepSetRefusal(steps, isolate);
  if (set) throw new Invalid({ message: set });
  const unallowed = unallowedRefusal(steps, allows.rules, allows.untrusted);
  if (unallowed) throw new Invalid({ message: unallowed });
  const placeSkill = placeSkillRefusal(steps, workflowDir, places);
  if (placeSkill) throw new Invalid({ message: placeSkill });
  const undeclared = undeclaredRefusal(steps);
  if (undeclared) throw new Invalid({ message: undeclared });
  const unruled = storeRootRefusal(HOME, steps, {
    runArtifacts: startArtifacts(),
    inbox: inboxDir(),
    ...(given ? { inputs: inputsDir({ id: 'run' }) } : {}),
  });
  if (unruled) throw new Invalid({ message: unruled });
  const refusedConfig = refused(steps, places, gates, denied, formerModesWritten(workflowDir));
  if (refusedConfig) throw new Invalid({ message: refusedConfig });
  return steps;
}

/**
 * Why a team that says `place: folder` cannot start: a step whose session is given a skill its places resolve to a builtin place skill
 * (`isBuiltinPlace`), which acts on a repository a folder run does not have; undefined for a repository team, or where none is.
 */
function placeSkillRefusal(steps: readonly Workflow[], workflowDir: string, places: Places): string | undefined {
  if (!isFolderTeam(steps)) return undefined;
  const found = skillsFor(workflowDir, places).at;
  for (const step of steps) {
    const skill = step.agent?.skills?.find((name) => {
      const at = found.get(name);
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
  steps: readonly Workflow[],
  places: Places,
  gates: readonly string[],
  denied: readonly string[],
  written: Readonly<Record<string, string>> = {},
): string | undefined => refusedStep(steps, places, gates, written, [], denied)?.why;

/** A run's artifacts folder as a start asks of its steps' first filing, before the run has an id. */
const startArtifacts = (): string => path.dirname(artifactsDir({ id: 'run' }, 'step'));

/**
 * `configRefused`'s refusal with the step it refuses, in a run that mounts `mounts` (`factoryMounts`) and whose place denies a landing
 * session `denied`.
 */
function refusedStep(
  steps: readonly Workflow[],
  places: Places,
  gates: readonly string[],
  written: Readonly<Record<string, string>>,
  mounts: readonly Mount[],
  denied: readonly string[],
): { step: Workflow; why: string } | undefined {
  for (const step of steps.filter((s) => !isRemoteHarness(s.harness))) {
    const own = ownOf(step, renderedFlags(step, '.'), () => places.repo);
    const runArtifacts = startArtifacts();
    const config = filedConfig(
      step,
      steps,
      { gates: [...gates], ...(mounts.length ? { mounts: [...mounts] } : {}) },
      { model: step.model, budgetUsd: budgetUsdFor(step.budget), runArtifacts, inbox: inboxDir(), own, landingDenied: () => denied },
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
  denied: readonly string[],
  written?: Readonly<Record<string, string>>,
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
function undeclaredRefusal(steps: readonly Workflow[]): string | undefined {
  const remote = steps
    .map((s) => ({ s, name: remoteNameOf(s.harness) }))
    .filter((r): r is { s: Workflow; name: string } => r.name !== undefined);
  const [first] = remote;
  if (first === undefined) return undefined;
  const read = readRemote();
  if (read.unread)
    return `${first.s.name}: \`harness: ${first.s.harness}\` names a remote A2A agent, and the file that declares them is refused. ${read.unread}`;
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
  | 'settlesCounted'
  | 'runTimed'
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
  denied: readonly string[],
): string | undefined {
  const workflow = path.basename(path.resolve(opts.workflowDir));
  const unwritable = writableRefusal(steps, workflow, factory, own, mounts);
  if (unwritable || !factory || !mounts.length) return unwritable;
  const ask = (asked: readonly Workflow[]) =>
    refusedStep(asked, places, opts.gates ?? [], formerModesWritten(opts.workflowDir), mounts, denied);
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
 * timed yet (`gatesTimed`), no denied call counted (`deniedCounted`), no settle counted (`settlesCounted`), and its timeline not handed
 * to the metrics (`runTimed`).
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
    settlesCounted: [],
    runTimed: false,
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
 * A repository run's record on `repo`, as the place the program was given opens it (`openPlace`): the commit HEAD is at and the
 * branch checked out there. Fails with the place's refusal, or an `--after`'s (`afterRefusal`), where the runs it waits on
 * stand read now (`standingLiveOf`).
 */
const repositoryRun = Effect.fn('repositoryRun')(function* (id: string, told: Told, steps: Run['steps'], repo: string, isolate: boolean) {
  const place = yield* PlaceService;
  const { baseRef, branch, inProgressFile: staged } = yield* tried(() => openPlace(place, repo, isolate));
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
 * The revision of every kind the run resolved — its workflow, each agent, each of their skills and the factory's rules — is appended to
 * the ledger and pinned on the record as `pinned` (`pinsOf`); a run that has filed nothing resolves them again on every pass, so an
 * edit made while it waits `--after` reaches its first filing.
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
  const { declared } = yield* PlaceService;
  const denied = declared.denyWhileLanding;
  const steps = yield* tried(() =>
    stepsToStart(
      opts.workflowDir,
      isolate,
      places,
      denied,
      factory,
      opts.gates,
      refused,
      Boolean(opts.inputs?.length),
      repoAllows(opts.repo, opts.factory),
    ),
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
  const unmounted = mountRefusal(opts, steps, places, factory, folder ? undefined : opts.repo, mounts, denied);
  if (unmounted) return yield* Effect.fail(new Invalid({ message: unmounted }));
  const told = toldOf(opts, steps, inputs, factory, mounts);
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const run = yield* folder ? folderRun(id, told, stepRecords) : repositoryRun(id, told, stepRecords, opts.repo, isolate);
  yield* tried(() => copyInputs(run, inputs));
  yield* tried(() => renderAgents(run, steps, opts.workflowDir, places));
  yield* tried(() => {
    const pinned = pinsOf(run, steps, run.createdAt);
    if (pinned.length) run.pinned = pinned;
  });
  yield* (yield* RunDoor).runs.create(run);
  return run;
});
