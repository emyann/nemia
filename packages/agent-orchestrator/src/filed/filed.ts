/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import path from 'node:path';
import { isObject } from 'effect/Predicate';
import { modeOf, sessionContext, type StepSpec } from '../workflow.ts';
import { isFolderTeam, sandboxed, writesNothing, writesOutsideByRule } from '../workflow/index.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Mount, Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import { volumeMounts } from '../factory/volume/index.ts';
import { handedMounts, type HandedFiles } from '../artifacts/artifacts.ts';
import { DEFAULT_HARNESS, declarationOf, isRemoteHarness } from '../harness/harness.ts';
import { addedFolderReadsOf, fenceReach, unruledIn } from 'agent-runtime/vocabulary';
import { filedSettings, SETTINGS_HARNESS } from '../harness-settings/harness-settings.ts';
import { splitServers, type FactoryServer, type FactoryServers } from '../factory/servers/index.ts';
import type { HandedRunMounts } from '../../contracts/handed-runs.contract.ts';
import type { HandedRunFolders } from '../../contracts/handed-folders.contract.ts';
import { handedFolders } from './handed-folders/handed-folders.ts';
import { inWorkspace, memoryFilesOf, sessionStart } from './session-start/session-start.ts';
import { expandedIn } from './session-start/spelled.ts';

export { handedFolders } from './handed-folders/handed-folders.ts';

export type { HandedRunFolders } from '../../contracts/handed-folders.contract.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow the
 * run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues (`sessionContext`), its
 * deny list with what the run's place denies an ending (`filedDenies`, `t.landingDenied`, asked of an ending alone), its allow list with
 * an ending's read of the run's artifacts folder (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start),
 * writable where the step's `writable:` names one (`stepMounts`), then its factory's volumes (`run.volumes`), a writable one writable only
 * where the step's fence writes (`volumeMounts`), then the folders its brief names beside them (`filedFolders`): its own
 * files directory, read-only, for a step that writes outside its directory only by rule (`ownMounts`), the
 * artifacts folder of each step it comes after, read-only, then the store's folders its `reads:` names, read-only, the inbox at `t.inbox`,
 * then the run's inputs folder at `t.inputs`, read-only, given only for a run given inputs or cards, then the folders of each run it is
 * handed at `t.runs`, read-only (`handedRunMounts`), then the run's copy of its workflow folder
 * at `t.workflowFiles` and of its carried files at `t.carriedFiles`, each read-only (`workflowMounts`); the key left out with none, the
 * MCP servers its sessions load, its factory's record first and the checkout's `.mcp.json` for the rest (`serversOf`), the step's files
 * directory and the run's copies of its workflow folder and its carried files, the run's labels and the try's session token in its
 * session's environment (`stepFilesEnv`), and the harness's own arguments (`own`) last, a step's settings given its factory's harness
 * settings beneath its own (`ownWith`). Where the run froze a home and the step's harness adds a writable folder (`startOf`), its session
 * starts in the home: its workspace is added first, writable by the step's own rules or read-only where its fence writes nothing, the
 * home denied, every rule read against the workspace (`inWorkspace`), the workspace named as `WORKSPACE`, the servers read from the
 * home's `.mcp.json` where it has one and else the workspace's (`projectMcpFrom`), the skills of the home and of each added folder
 * switched on offered beside the step's own, and the memory files of the folders a person switched on loaded, the others skipped
 * (`memoryFilesOf`). A `${{ workspace }}` in a rule is the workspace wherever the session starts. The runtime judges no budget:
 * `budgetUsd` is the harness's own cap, and whether the step went over is this package's (`ownStatus`). Pure.
 * @param step The step to file, as the run froze it.
 * @param steps Every step of the run's workflow, as the run froze them.
 * @param run The run's record: its gates, mounts, volumes, harness settings and labels.
 * @param t What the filing chooses and the caller read for it: the model and cap, the run's folders, the harness's own arguments, the
 * deny list of an ending and the factory's servers.
 */
export const filedConfig = <Own extends object>(
  step: StepSpec,
  steps: readonly StepSpec[],
  run: Pick<Run, 'gates' | 'mounts' | 'volumes' | 'harnessSettings' | 'labels'> & Partial<Pick<Run, 'worked'>>,
  t: {
    model: string | undefined;
    budgetUsd: number | undefined;
    runArtifacts: string;
    inbox: string;
    inputs?: string;
    /** The run's copy of its workflow folder (`workflowFilesDir`), absolute: absent where the record names none. */
    workflowFiles?: string;
    /** The run's copy of its carried files (`carriedFilesDir`), absolute: absent where the record names none. */
    carriedFiles?: string;
    /** The folders of each run this one is handed, as the pass found them on disk (`filedFoldersAt`): absent for a run handed none. */
    runs?: readonly HandedRunFolders[];
    own: Own;
    landingDenied: () => readonly string[];
    /**
     * The servers the run's factory records (`factoryServers`), read by the caller's store and handed in: a name the step's agent gives
     * resolves against these before the checkout's `.mcp.json`. One writer hands it — `filedAt`, which every caller spreads — because a
     * caller that passed none would silently give the step no factory server and have it refused for a name the checkout does not
     * declare. `{}` or absent: every name resolves against the checkout, as it did.
     */
    servers?: FactoryServers;
    /** The step's workspace, absolute: its worktree, or the run's. Absent: the filing of a step with none, as before homes were. */
    workspace?: string;
    /** What the filing found on disk of where the session starts (`StartFound`): absent for a run that froze no home. */
    start?: StartFound;
    /**
     * The session's token, minted for this try as it is filed (`stepToken`, token.store.ts) and handed as `SESSION_TOKEN`: absent where
     * nothing is filed — a check of the config a try or a start would file — and the variable left out.
     */
    sessionToken?: string;
  },
) => {
  const others = [...(stepMounts(step, run.mounts) ?? []), ...volumeMounts(step, run.volumes), ...folders(filedFolders(step, steps, t))];
  const placed = placedOf(step, run, t, others);
  const owned = placed.own(ownWith(step, run.harnessSettings, t.own));
  return {
    model: t.model,
    effort: step.effort,
    contextTokens: sessionContext(step, steps),
    permissionMode: modeOf(step),
    tools: step.tools,
    disallowedTools: withRules(filedDenies(step, run, t.landingDenied), placed.rule, placed.denies),
    allowedTools: withRules(filedAllows(step, t.runArtifacts), placed.rule, []),
    budgetUsd: t.budgetUsd,
    ...mountsOf(placed.mounts.map(mountOf)),
    ...serversOf(step, t.servers),
    ...placed.servedFrom,
    ...stepFilesEnv(step, t.runArtifacts, { workflowFiles: t.workflowFiles, carriedFiles: t.carriedFiles }, run.labels, t.sessionToken, {
      ...placed.env,
      ...owned.env,
    }),
    ...owned.own,
  };
};

/**
 * What a step's filing takes of where its session starts (`startOf`): how each of its rules is read (`rule`), what it is denied for its
 * start, its mounts with the workspace first where it starts in the home, the folder its project servers are read from, its environment's
 * part, and its own arguments' (`inHomeOwn`). As before homes were for a session in its workspace, but a `${{ workspace }}` put in.
 */
const placedOf = (
  step: StepSpec,
  run: Pick<Run, 'harnessSettings'> & Partial<Pick<Run, 'worked'>>,
  t: { workspace?: string; start?: StartFound },
  others: Mount[],
) => {
  const ws = t.workspace;
  const start = ws === undefined ? undefined : startOf(step, ws, t.start);
  const worked = start?.worked ?? null;
  if (ws === undefined || start === undefined || worked === null)
    return {
      rule: (r) => (ws === undefined ? r : expandedIn(r, ws)),
      denies: [],
      mounts: others,
      servedFrom: {},
      env: {},
      own: (own) => ({ own, env: {} }),
    } satisfies {
      rule: (r: string) => string;
      denies: readonly string[];
      mounts: Mount[];
      servedFrom: { projectMcpFrom?: string };
      env: Record<string, string>;
      own: <Own extends object>(own: Own) => { own: Own; env: Record<string, string> };
    } as {
      rule: (r: string) => string;
      denies: readonly string[];
      mounts: Mount[];
      servedFrom: { projectMcpFrom?: string };
      env: Record<string, string>;
      own: <Own extends object>(own: Own) => { own: Own; env: Record<string, string> };
    };
  const mounts = [worked, ...others.filter((m) => m.path !== worked.path && m.path !== start.cwd)];
  const reads = addedFolderReadsOf(step.harness ?? DEFAULT_HARNESS);
  const memory = reads === undefined ? undefined : memoryFilesOf(memoryFolders(mounts, worked.path, run));
  const skills = homeSkills(t.start, mounts, worked.path, run);
  return {
    rule: (r) => inWorkspace(r, ws),
    denies: start.denies,
    mounts,
    servedFrom: { projectMcpFrom: t.start?.mcp === true ? start.cwd : worked.path },
    env: { [WORKSPACE]: worked.path },
    own: (own) => {
      const given = inHomeOwn(own, step, skills, { key: reads?.memoryExcludes, excludes: memory?.excludes ?? [] });
      const loads = memory?.load === true && reads !== undefined && given.skipped;
      return { own: given.own, env: loads ? { [reads.memoryEnv]: '1' } : {} };
    },
  } satisfies {
    rule: (r: string) => string;
    denies: readonly string[];
    mounts: Mount[];
    servedFrom: { projectMcpFrom?: string };
    env: Record<string, string>;
    own: <Own extends object>(own: Own) => { own: Own; env: Record<string, string> };
  } as {
    rule: (r: string) => string;
    denies: readonly string[];
    mounts: Mount[];
    servedFrom: { projectMcpFrom?: string };
    env: Record<string, string>;
    own: <Own extends object>(own: Own) => { own: Own; env: Record<string, string> };
  };
};

/**
 * What the filing found on disk of where a step's session starts, for a run that froze a home: the run's copy of its factory's home
 * (`home`, absolute), whether it holds a `.mcp.json` (`mcp`), and the skills of each folder that may be added to the session, by its
 * path: the home's, the workspace's and each mounted volume's, each the names of the skills its harness lists there (`addedFolderReadsOf`).
 */
export type StartFound = { home: string; mcp: boolean; skills: Readonly<Record<string, readonly string[]>> };

/**
 * Where `step`'s session starts (`sessionStart`): in the run's home where it froze one (`found`), the step runs on this machine and its
 * harness adds a writable folder; else in its workspace.
 * @param step The step to file: its harness and its fence.
 * @param workspace The step's workspace, absolute.
 * @param found What the filing found of the run's home, or undefined where it froze none.
 */
export const startOf = (step: StepSpec, workspace: string, found: StartFound | undefined) =>
  sessionStart({
    workspace,
    home: found?.home,
    local: !isRemoteHarness(step.harness),
    addsFolders: declarationOf(step.harness ?? DEFAULT_HARNESS)?.can.includes('writableMount') === true,
    writes: !writesNothing(step),
  });

/** A list of rules each read by `rule`, with `more` after them; undefined where there was no list and nothing more, as before. */
const withRules = (rules: readonly string[] | undefined, rule: (r: string) => string, more: readonly string[]) =>
  (rules === undefined && !more.length ? undefined : [...(rules ?? []).map(rule), ...more]) satisfies string[] | undefined;

/** A mount as the runtime takes it: its path, its mode, and whether its rules are the task's own; no switch of a volume's. */
const mountOf = (m: Mount) =>
  ({ path: m.path, readOnly: m.readOnly, ...(m.ruled === true ? { ruled: true as const } : {}) }) satisfies Mount as Mount;

/**
 * Each folder added to a session in the home, and whether its memory files are switched on: the workspace by the volume the run works
 * on (`run.worked`), each other by its own frozen switch.
 */
const memoryFolders = (mounts: readonly Mount[], workspace: string, run: Pick<Run, 'worked'>) =>
  mounts.map((m) => ({ path: m.path, claudeMd: m.path === workspace ? run.worked?.claudeMd === true : m.claudeMd === true }));

/**
 * The skills a session in the home is offered beside its step's own: the home's, then each added folder's (`found.skills`) whose volume
 * does not switch its skills off, the workspace's by the volume the run works on.
 */
const homeSkills = (found: StartFound | undefined, mounts: readonly Mount[], workspace: string, run: Pick<Run, 'worked'>) => {
  if (found === undefined) return [];
  const offered = mounts.filter((m) => (m.path === workspace ? run.worked?.skills !== false : m.skills !== false));
  return [...(found.skills[found.home] ?? []), ...offered.flatMap((m) => found.skills[m.path] ?? [])];
};

/**
 * A step's own harness arguments for a session in the home: its closed list of skills (`enabledSkills`) with `skills` added, and its
 * harness's settings given the folders whose memory files are skipped (`skipped.excludes`, added to those the settings already skip,
 * under the setting its harness reads them by, `skipped.key`) where an added folder's load. A list left open (`'default'`) stays open.
 * Settings given as a file, which nothing rewrites, or that are no object, are left as they are, and the answer says the folders could
 * not be skipped (`skipped: false`), so the filing loads no added folder's memory file.
 */
function inHomeOwn<Own extends object>(
  own: Own,
  step: Pick<StepSpec, 'harness'>,
  skills: readonly string[],
  skipped: { key: string | undefined; excludes: readonly string[] },
) {
  const { key, excludes } = skipped;
  const listed: unknown = Reflect.get(own, 'enabledSkills');
  const withSkills = Array.isArray(listed) && skills.length ? { ...own, enabledSkills: [...new Set([...listed, ...skills])] } : own;
  if (!excludes.length) return { own: withSkills, skipped: true };
  if (key === undefined) return { own: withSkills, skipped: false };
  const harness = step.harness ?? DEFAULT_HARNESS;
  const rendered: unknown = Reflect.get(withSkills, harness);
  const flags = typeof rendered === 'object' && rendered !== null ? rendered : {};
  const parsed = settingsObject('settings' in flags ? flags.settings : undefined);
  if (parsed === undefined) return { own: withSkills, skipped: false };
  const kept: unknown = parsed[key];
  const before = Array.isArray(kept) ? kept.filter((e): e is string => typeof e === 'string') : [];
  const settings = JSON.stringify({ ...parsed, [key]: [...new Set([...before, ...excludes])] });
  return { own: { ...withSkills, [harness]: { ...flags, settings } }, skipped: true };
}

/** A harness's settings given inline as a JSON object, read; none given reads as an empty one, and a file or no object as undefined. */
const settingsObject = (given: unknown) => {
  if (given === undefined) return {};
  if (typeof given !== 'string') return undefined;
  let read: unknown;
  try {
    read = JSON.parse(given);
  } catch {
    return undefined;
  }
  return isObject(read) ? read : undefined;
};

/**
 * The variable a step's session in its factory's home finds its workspace in: the folder it works on, added beside the home, where its
 * checks run and its work is committed.
 */
export const WORKSPACE = 'WF_WORKSPACE';

/**
 * A step's own harness arguments with its factory's harness settings (`frozen`, the run's) given on a step on the harness they are for
 * (`SETTINGS_HARNESS`): its rendered `settings` laid over the allowed ones (`filedSettings`), a step with no agent given the harness's key
 * for them. As they were for a run that froze none, on another harness, and on a remote agent.
 */
function ownWith<Own extends object>(step: Pick<StepSpec, 'harness'>, frozen: Run['harnessSettings'], own: Own) {
  const harness = step.harness ?? DEFAULT_HARNESS;
  const given = frozen?.[SETTINGS_HARNESS];
  if (harness !== SETTINGS_HARNESS || given === undefined) return own satisfies Own;
  const rendered: unknown = Reflect.get(own, harness);
  const flags = typeof rendered === 'object' && rendered !== null ? rendered : {};
  const settings = filedSettings(given, 'settings' in flags && typeof flags.settings === 'string' ? flags.settings : undefined);
  return (settings === undefined ? own : { ...own, [harness]: { ...flags, settings } }) satisfies Own;
}

/**
 * The variable a step's session finds its files directory in: the run's artifacts folder of the step (`artifactsDir`), outside every
 * workspace, where a file it or a process it starts writes is kept with the run and named in its closeout by its absolute path.
 */
export const STEP_FILES = 'WF_STEP_FILES';

/**
 * The variable a step's session, and its check, find the run's copy of its workflow folder in (`workflowFilesDir`): the folder's files
 * at their paths from it, as the run took them at start or at its last move of pins, so a script a step's note runs is the one its run
 * took, whatever the folder holds now.
 */
export const WORKFLOW_FILES = 'WF_WORKFLOW_FILES';

/**
 * The variable a step's session, and its check, find the run's copy of its carried files in (`carriedFilesDir`): the `carried/` folder
 * beside its workflow's, the files the workflows of a template share, frozen with the workflow's copy, so a script one of them names is
 * the one its run took.
 */
export const CARRIED_FILES = 'WF_CARRIED_FILES';

/**
 * The variable a step's session, as its check (`checkEnvOf`), is told its run's labels in: a JSON object of strings, `{}` where the run
 * has none, as Kubernetes' Downward API gives a container its own Pod's labels. Read when the session is filed: a label put on the run
 * after that reaches its next session and its check, not this one.
 */
export const RUN_LABELS = 'WF_LABELS';

/**
 * The variable a step's session finds its session token in: minted for its try as it is filed, kept by the store only as a digest
 * (`token.store.ts`), and presented to the api as `Authorization: Bearer <token>`, which knows the session's agent, factory, run and step
 * by it while the try is the step's live one (`sessionCaller`, token/caller.verb.ts), as a Kubernetes bound ServiceAccount token is
 * mounted into its Pod.
 */
export const SESSION_TOKEN = 'WF_SESSION_TOKEN';

/**
 * A step's session's own environment: its files directory under `runArtifacts` as `STEP_FILES`, the run's copy of its workflow folder
 * as `WORKFLOW_FILES` and of its carried files as `CARRIED_FILES`, each where the record names one (`copies`), the run's labels as
 * `RUN_LABELS`, and its session token as `SESSION_TOKEN` where one was minted (`sessionToken`).
 */
const stepFilesEnv = (
  step: Pick<StepSpec, 'name'>,
  runArtifacts: string,
  copies: { workflowFiles: string | undefined; carriedFiles: string | undefined },
  labels: Run['labels'],
  sessionToken: string | undefined,
  more: Record<string, string> = {},
) =>
  ({
    env: {
      ...more,
      [STEP_FILES]: stepFilesOf(step, runArtifacts),
      ...(copies.workflowFiles === undefined ? {} : { [WORKFLOW_FILES]: copies.workflowFiles }),
      ...(copies.carriedFiles === undefined ? {} : { [CARRIED_FILES]: copies.carriedFiles }),
      [RUN_LABELS]: JSON.stringify(labels ?? {}),
      ...(sessionToken === undefined ? {} : { [SESSION_TOKEN]: sessionToken }),
    },
  }) satisfies { env: Record<string, string> } as { env: Record<string, string> };

/** A step's files directory, the run's artifacts folder of that step under `runArtifacts`: what `STEP_FILES` names to its session. */
const stepFilesOf = (step: Pick<StepSpec, 'name'>, runArtifacts: string) => path.join(runArtifacts, step.name);

/**
 * The step's own files directory (`stepFilesOf`), read-only, for a step whose permission mode writes outside its directory only where a
 * rule allows it (`writesOutsideByRule`): what its tools write there — a browser server's snapshots, screenshots and console logs — its
 * Read, Grep and Glob reach then, since a session reads no folder outside its working tree but a mounted one; and the mount, read-only,
 * takes no write from it, since it had none there. None for a step in a wider mode, one that writes outside its directory unasked: it
 * reaches the folder already and writes into it, which a read-only mount would deny, and a writable one would allow by rule what its mode
 * judged call by call — its access stays as it was. None on a harness fenced by a sandbox, which reads the disk already, nor on a remote
 * agent, filed no local field. Nor where the harness's permission rules cannot carry a character of its path (`unruledIn`, a store root
 * holding a `(`): the deny that holds it read-only could not name it, and the session runs as it did before, rather than the step being
 * refused. No other step's folder: those are the handed ones (`handedMounts`).
 * @param step The step to file.
 * @param runArtifacts The run's artifacts folder, absolute, under which the step's files directory is.
 */
export const ownMounts = (step: StepSpec, runArtifacts: string) => {
  const own = stepFilesOf(step, runArtifacts);
  return local(step.harness) && writesOutsideByRule(modeOf(step)) && unruledIn(step.harness ?? DEFAULT_HARNESS, own) === undefined
    ? [{ path: own, readOnly: true }]
    : [];
};

/**
 * The folders a step is filed with beyond its factory's, each read-only: those the steps before it handed over, then the store's, then
 * the run's inputs folder, the folders of the runs it is handed. And `named`, for its brief alone and no part of the filing: by the path
 * of a handed folder, which of the files its step's closeout named are there as the step is filed (`HandedFiles`), where the tick read
 * them; and `closeouts`, the paths of the handed folders that hold the step's `closeout.json` (`HANDED_CLOSEOUT`), whose files the
 * brief does not list.
 */
export type FiledFolders = {
  /** The step's own files directory, read-only, where its mode writes outside its directory only by rule (`ownMounts`). */
  own?: Mount[];
  handed: Mount[];
  store: Mount[];
  inputs: Mount[];
  /** The run's copy of its workflow folder, read-only (`workflowMounts`): absent or empty where it is not mounted. */
  workflow?: Mount[];
  /** The run's copy of its carried files, read-only (`workflowMounts`): absent or empty where it is not mounted. */
  carried?: Mount[];
  /** The folders of each run this one is handed, read-only, on a local step (`handedRunMounts`). */
  runs?: Mount[];
  /** Each run this one is handed and its folders as the pass found them, for its brief alone (`mountsLine`): none of the filing. */
  runsFound?: readonly HandedRunFolders[];
  named?: Readonly<Record<string, HandedFiles>>;
  closeouts?: readonly string[];
};

/**
 * The folders a step is filed with beyond its factory's, the one source of the filing's (`filedConfig`) and of what its brief names
 * (`mountsLine`, `inputsLine`): its own files directory (`ownMounts`), the artifacts folder of each step it comes after, under
 * `t.runArtifacts` (`handedMounts`), the store's folders its `reads:` names, the inbox at `t.inbox` (`readsMounts`), the run's inputs
 * folder at `t.inputs`, given only for a run given inputs or cards (`inputsMounts`), and the folders of each run it is handed at
 * `t.runs` (`handedRunMounts`), on every step and not the roots alone, since they are read off the run's frozen record. Pure.
 * @param step The step to file.
 * @param steps Every step of the run's workflow.
 * @param t The run's folders, absolute: its artifacts, the inbox, its inputs, its copies of its workflow folder and carried files, and
 * the folders of the runs it is handed; each optional one absent where the run has none.
 */
export const filedFolders = (
  step: StepSpec,
  steps: readonly StepSpec[],
  t: {
    runArtifacts: string;
    inbox: string;
    inputs?: string;
    workflowFiles?: string;
    carriedFiles?: string;
    runs?: readonly HandedRunFolders[];
  },
) => ({
  own: ownMounts(step, t.runArtifacts),
  handed: handedMounts(step, steps, t.runArtifacts),
  store: readsMounts(step, t.inbox),
  inputs: inputsMounts(step, steps, t.inputs),
  workflow: workflowMounts(step, t.workflowFiles),
  carried: workflowMounts(step, t.carriedFiles),
  runs: handedRunMounts(step, t.runs ?? []),
  runsFound: t.runs ?? [],
});

/**
 * A step's folders beyond its factory's, in the order they are filed: its own, the handed ones, the handed runs', the store's, the run's
 * inputs, then the run's copies of its workflow folder and of its carried files.
 */
const folders = (f: FiledFolders) => [
  ...(f.own ?? []),
  ...f.handed,
  ...(f.runs ?? []),
  ...f.store,
  ...f.inputs,
  ...(f.workflow ?? []),
  ...(f.carried ?? []),
];

/** Whether a step's harness reads the disk only through what it is filed: neither a remote agent nor one fenced by a sandbox. */
const local = (harness: string | undefined) => !isRemoteHarness(harness) && !sandboxed(harness ?? DEFAULT_HARNESS);

/**
 * The store's folders a step's `reads:` names, each read-only: the inbox (`inbox`, its absolute path) when it names it. It reads the
 * cards and writes none of them, whatever its fence. None on a harness fenced by a sandbox, which reads the disk already, nor on a remote
 * agent, filed no local field.
 * @param step The step to file: its harness and its `reads:`.
 * @param inbox The store's inbox folder, absolute.
 */
export const readsMounts = (step: Pick<StepSpec, 'harness' | 'reads'>, inbox: string) =>
  local(step.harness) && step.reads?.includes('inbox') ? [{ path: inbox, readOnly: true }] : [];

/**
 * The run's inputs folder (`dir`, its absolute path, undefined for a run given no input), read-only, for a step of a repository run: it
 * reads the files `nemia start --input` gave the run and writes none of them. None on a harness fenced by a sandbox, which reads the disk
 * already, nor on a remote agent, filed no local field, nor in a folder team (`isFolderTeam`), whose steps read the copy in their own
 * folder.
 * @param step The step to file: its harness.
 * @param steps Every step of the run's workflow, which says whether it is a folder team.
 * @param dir The run's inputs folder, absolute, or undefined for a run given no input.
 */
export const inputsMounts = (step: Pick<StepSpec, 'harness'>, steps: readonly Pick<StepSpec, 'place'>[], dir: string | undefined) =>
  dir !== undefined && local(step.harness) && !isFolderTeam(steps) ? [{ path: dir, readOnly: true }] : [];

/**
 * The folders of each run this one is handed (`found`), each read-only, for a step whatever steps it comes after: it reads another run's
 * work and writes none of it, and Read, Grep and Glob reach them. Only the folders found are mounted. None on a harness fenced by a
 * sandbox, which reads the disk already, nor on a remote agent, filed no local field; the default harness (no `harness:`) is fenced by
 * its mode (`local`, spelled out so its proof reads no declaration).
 * @param step The step to file: its harness.
 * @param found Each run this one is handed and its folders, as the pass found them on disk.
 */
export const handedRunMounts: HandedRunMounts = (step, found) =>
  !isRemoteHarness(step.harness) && (step.harness === undefined || !sandboxed(step.harness))
    ? handedFolders(found).map((folder) => ({ path: folder, readOnly: true }))
    : [];

/**
 * The run's copy of its workflow folder (`dir`, its absolute path, undefined where the record names none), read-only, for a step whose
 * harness fences it by a permission mode: it reads the scripts and notes its run took and writes none of them, folder teams included,
 * whose sessions, held to their own folder, read no folder outside it but a mounted one. None on a harness fenced by a sandbox,
 * which reads the disk already, on a harness fenced by neither — a command, whose session reads the disk unfenced, and which may hold
 * no mount — nor on a remote agent, filed no local field. Nor where the harness's permission rules cannot carry a character of its path
 * (`unruledIn`), as for the step's own files directory (`ownMounts`): the session is still told the folder (`WORKFLOW_FILES`).
 * @param step The step to file: its harness.
 * @param dir The run's copy of the folder to mount, absolute, or undefined where the record names none.
 */
export const workflowMounts = (step: Pick<StepSpec, 'harness'>, dir: string | undefined) => {
  const harness = step.harness ?? DEFAULT_HARNESS;
  return dir !== undefined && fenceReach(harness)?.by === 'mode' && unruledIn(harness, dir) === undefined
    ? [{ path: dir, readOnly: true }]
    : [];
};

/**
 * The MCP servers a step's sessions load, as a config holds them: the names its frozen agent gives (`StepAgent.mcp`), split against the
 * factory's record (`splitServers`) — a name the factory records rides the task's own `mcp`, as the servers themselves, and is left out
 * of `projectMcp`; the rest stay `projectMcp`, names of the checkout's `.mcp.json`.
 *
 * The factory comes first, and the name is *removed* from `projectMcp` rather than left on both: a name on both lists trips the
 * runtime's own "one would hide the other" refusal (`projectMcpRefusalOf`) and refuses the step instead of resolving it.
 *
 * None for a step with no agent, and no key at all for an agent frozen before it named any, whose sessions load the whole file as they
 * did.
 */
const serversOf = (step: Pick<StepSpec, 'agent'>, record: FactoryServers | undefined) => {
  if (step.agent === undefined)
    return { projectMcp: [] } satisfies { projectMcp?: string[]; mcp?: Record<string, FactoryServer> } as {
      projectMcp?: string[];
      mcp?: Record<string, FactoryServer>;
    };
  if (step.agent.mcp === undefined)
    return {} satisfies { projectMcp?: string[]; mcp?: Record<string, FactoryServer> } as {
      projectMcp?: string[];
      mcp?: Record<string, FactoryServer>;
    };
  const { mcp, checkout } = splitServers(step.agent.mcp, record);
  return { projectMcp: checkout, ...(mcp === undefined ? {} : { mcp }) } satisfies {
    projectMcp?: string[];
    mcp?: Record<string, FactoryServer>;
  } as { projectMcp?: string[]; mcp?: Record<string, FactoryServer> };
};

/** `mounts` as a config holds them: the key, or none for no folder. */
const mountsOf = (mounts: Mount[]) => (mounts.length ? { mounts } : {}) satisfies { mounts?: Mount[] } as { mounts?: Mount[] };

/**
 * The model a try runs on: a fresh one on the model it asked for, or the step's; any other on the one its session was started on.
 * @param step The step, whose `model` a try runs on where it asked for none and its session says none.
 * @param record The step's record, whose tries say the model its session was started on; undefined for a step with none.
 * @param how How the try runs: fresh or continued, and the model it asked for.
 */
export const tryModel = (step: StepSpec, record: StepRecord | undefined, how: Pick<RetryHow, 'mode' | 'model'>) =>
  how.mode === 'fresh' ? (how.model ?? step.model) : sessionModel(step, record);
