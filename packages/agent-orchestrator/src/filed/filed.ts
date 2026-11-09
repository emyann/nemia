/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import path from 'node:path';
import { modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { isFolderTeam, sandboxed, writesOutsideByRule } from '../workflow/index.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Mount, Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import { volumeMounts } from '../factory/volume/volume.ts';
import { handedMounts, type HandedFiles } from '../artifacts/artifacts.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { fenceReach, unruledIn } from 'agent-runtime/vocabulary';
import { filedSettings, SETTINGS_HARNESS } from '../harness-settings/harness-settings.ts';
import { splitServers, type FactoryServer, type FactoryServers } from '../factory/servers/index.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow the
 * run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues (`sessionContext`), its
 * deny list with what the run's place denies an ending (`filedDenies`, `t.landingDenied`, asked of an ending alone), its allow list with
 * an ending's read of the run's artifacts folder (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start),
 * writable where the step's `writable:` names one (`stepMounts`), then its factory's volumes (`run.volumes`), a writable one writable only
 * where the step's fence writes (`volumeMounts`), then the folders its brief names beside them (`filedFolders`): its own
 * files directory, read-only, for a step that writes outside its directory only by rule (`ownMounts`), the
 * artifacts folder of each step it comes after, read-only, then the store's folders its `reads:` names, read-only, the inbox at `t.inbox`,
 * then the run's inputs folder at `t.inputs`, read-only, given only for a run given inputs, then the run's copy of its workflow folder
 * at `t.workflowFiles`, read-only (`workflowMounts`); the key left out with none, the MCP servers
 * its sessions load, its factory's record first and the checkout's `.mcp.json` for the rest (`serversOf`), the step's files directory and
 * the run's copy of its workflow folder, the run's labels and the try's session token in its session's environment (`stepFilesEnv`),
 * and the harness's own arguments (`own`) last, a step's settings given its factory's harness settings beneath its own (`ownWith`). The
 * runtime judges no budget:
 * `budgetUsd` is the harness's own cap, and whether the step went over is this package's (`ownStatus`). Pure.
 */
export const filedConfig = <Own extends object>(
  step: Workflow,
  steps: readonly Workflow[],
  run: Pick<Run, 'gates' | 'mounts' | 'volumes' | 'harnessSettings' | 'labels'>,
  t: {
    model: string | undefined;
    budgetUsd: number | undefined;
    runArtifacts: string;
    inbox: string;
    inputs?: string;
    /** The run's copy of its workflow folder (`workflowFilesDir`), absolute: absent where the record names none. */
    workflowFiles?: string;
    /** The artifacts folders of the run that routed on to this one, for a root (`callerMounts`): absent for every other step. */
    caller?: readonly Mount[];
    own: Own;
    landingDenied: () => readonly string[];
    /**
     * The servers the run's factory records (`factoryServers`), read by the caller's store and handed in: a name the step's agent gives
     * resolves against these before the checkout's `.mcp.json`. One writer hands it — `filedAt`, which every caller spreads — because a
     * caller that passed none would silently give the step no factory server and have it refused for a name the checkout does not
     * declare. `{}` or absent: every name resolves against the checkout, as it did.
     */
    servers?: FactoryServers;
    /**
     * The session's token, minted for this try as it is filed (`stepToken`, token.store.ts) and handed as `SESSION_TOKEN`: absent where
     * nothing is filed — a check of the config a try or a start would file — and the variable left out.
     */
    sessionToken?: string;
  },
) => ({
  model: t.model,
  effort: step.effort,
  contextTokens: sessionContext(step, steps),
  permissionMode: modeOf(step),
  tools: step.tools,
  disallowedTools: filedDenies(step, run, t.landingDenied),
  allowedTools: filedAllows(step, t.runArtifacts),
  budgetUsd: t.budgetUsd,
  ...mountsOf([...(stepMounts(step, run.mounts) ?? []), ...volumeMounts(step, run.volumes), ...folders(filedFolders(step, steps, t))]),
  ...serversOf(step, t.servers),
  ...stepFilesEnv(step, t.runArtifacts, t.workflowFiles, run.labels, t.sessionToken),
  ...ownWith(step, run.harnessSettings, t.own),
});

/**
 * A step's own harness arguments with its factory's harness settings (`frozen`, the run's) given on a step on the harness they are for
 * (`SETTINGS_HARNESS`): its rendered `settings` laid over the allowed ones (`filedSettings`), a step with no agent given the harness's key
 * for them. As they were for a run that froze none, on another harness, and on a remote agent.
 */
function ownWith<Own extends object>(step: Pick<Workflow, 'harness'>, frozen: Run['harnessSettings'], own: Own): Own {
  const harness = step.harness ?? DEFAULT_HARNESS;
  const given = frozen?.[SETTINGS_HARNESS];
  if (harness !== SETTINGS_HARNESS || given === undefined) return own;
  const rendered: unknown = Reflect.get(own, harness);
  const flags = typeof rendered === 'object' && rendered !== null ? rendered : {};
  const settings = filedSettings(given, 'settings' in flags && typeof flags.settings === 'string' ? flags.settings : undefined);
  return settings === undefined ? own : { ...own, [harness]: { ...flags, settings } };
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
 * as `WORKFLOW_FILES` where the record names one (`workflowFiles`), the run's labels as `RUN_LABELS`, and its session token as
 * `SESSION_TOKEN` where one was minted (`sessionToken`).
 */
const stepFilesEnv = (
  step: Pick<Workflow, 'name'>,
  runArtifacts: string,
  workflowFiles: string | undefined,
  labels: Run['labels'],
  sessionToken: string | undefined,
): { env: Record<string, string> } => ({
  env: {
    [STEP_FILES]: stepFilesOf(step, runArtifacts),
    ...(workflowFiles === undefined ? {} : { [WORKFLOW_FILES]: workflowFiles }),
    [RUN_LABELS]: JSON.stringify(labels ?? {}),
    ...(sessionToken === undefined ? {} : { [SESSION_TOKEN]: sessionToken }),
  },
});

/** A step's files directory, the run's artifacts folder of that step under `runArtifacts`: what `STEP_FILES` names to its session. */
const stepFilesOf = (step: Pick<Workflow, 'name'>, runArtifacts: string): string => path.join(runArtifacts, step.name);

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
 */
export const ownMounts = (step: Workflow, runArtifacts: string): Mount[] => {
  const own = stepFilesOf(step, runArtifacts);
  return local(step.harness) && writesOutsideByRule(modeOf(step)) && unruledIn(step.harness ?? DEFAULT_HARNESS, own) === undefined
    ? [{ path: own, readOnly: true }]
    : [];
};

/**
 * The folders a step is filed with beyond its factory's, each read-only: those the steps before it handed over, then the store's, then
 * the run's inputs folder. And `named`, for its brief alone and no part of the filing: by the path of a handed folder, which of the
 * files its step's closeout named are there as the step is filed (`HandedFiles`), where the tick read them; and `closeouts`, the paths of
 * the handed folders that hold the step's `closeout.json` (`HANDED_CLOSEOUT`), whose files the brief does not list.
 */
export type FiledFolders = {
  /** The step's own files directory, read-only, where its mode writes outside its directory only by rule (`ownMounts`). */
  own?: Mount[];
  handed: Mount[];
  store: Mount[];
  inputs: Mount[];
  /** The run's copy of its workflow folder, read-only (`workflowMounts`): absent or empty where it is not mounted. */
  workflow?: Mount[];
  /** The result steps' artifacts folders of the run that routed on to this one, read-only, on a local root (`callerMounts`). */
  caller?: Mount[];
  named?: Readonly<Record<string, HandedFiles>>;
  closeouts?: readonly string[];
};

/**
 * The folders a step is filed with beyond its factory's, the one source of the filing's (`filedConfig`) and of what its brief names
 * (`mountsLine`, `inputsLine`): its own files directory (`ownMounts`), the artifacts folder of each step it comes after, under
 * `t.runArtifacts` (`handedMounts`), the store's folders its `reads:` names, the inbox at `t.inbox` (`readsMounts`), the run's inputs
 * folder at `t.inputs`, given only for a run given inputs (`inputsMounts`), and on a local root the caller's folders at `t.caller`
 * (`callerMounts` in brief/handed.ts). Pure.
 */
export const filedFolders = (
  step: Workflow,
  steps: readonly Workflow[],
  t: { runArtifacts: string; inbox: string; inputs?: string; workflowFiles?: string; caller?: readonly Mount[] },
): FiledFolders => ({
  own: ownMounts(step, t.runArtifacts),
  handed: handedMounts(step, steps, t.runArtifacts),
  store: readsMounts(step, t.inbox),
  inputs: inputsMounts(step, steps, t.inputs),
  workflow: workflowMounts(step, t.workflowFiles),
  caller: local(step.harness) ? [...(t.caller ?? [])] : [],
});

/**
 * A step's folders beyond its factory's, in the order they are filed: its own, the handed ones, the caller's, the store's, the run's
 * inputs, then the run's copy of its workflow folder.
 */
const folders = (f: FiledFolders): Mount[] => [
  ...(f.own ?? []),
  ...f.handed,
  ...(f.caller ?? []),
  ...f.store,
  ...f.inputs,
  ...(f.workflow ?? []),
];

/** Whether a step's harness reads the disk only through what it is filed: neither a remote agent nor one fenced by a sandbox. */
const local = (harness: string | undefined): boolean => !isRemoteHarness(harness) && !sandboxed(harness ?? DEFAULT_HARNESS);

/**
 * The store's folders a step's `reads:` names, each read-only: the inbox (`inbox`, its absolute path) when it names it. It reads the
 * cards and writes none of them, whatever its fence. None on a harness fenced by a sandbox, which reads the disk already, nor on a remote
 * agent, filed no local field.
 */
export const readsMounts = (step: Pick<Workflow, 'harness' | 'reads'>, inbox: string): Mount[] =>
  local(step.harness) && step.reads?.includes('inbox') ? [{ path: inbox, readOnly: true }] : [];

/**
 * The run's inputs folder (`dir`, its absolute path, undefined for a run given no input), read-only, for a step of a repository run: it
 * reads the files `nemia start --input` gave the run and writes none of them. None on a harness fenced by a sandbox, which reads the disk
 * already, nor on a remote agent, filed no local field, nor in a folder team (`isFolderTeam`), whose steps read the copy in their own
 * folder.
 */
export const inputsMounts = (
  step: Pick<Workflow, 'harness'>,
  steps: readonly Pick<Workflow, 'place'>[],
  dir: string | undefined,
): Mount[] => (dir !== undefined && local(step.harness) && !isFolderTeam(steps) ? [{ path: dir, readOnly: true }] : []);

/**
 * The run's copy of its workflow folder (`dir`, its absolute path, undefined where the record names none), read-only, for a step whose
 * harness fences it by a permission mode: it reads the scripts and notes its run took and writes none of them, folder teams included,
 * whose sessions, held to their own folder, read no folder outside it but a mounted one. None on a harness fenced by a sandbox,
 * which reads the disk already, on a harness fenced by neither — a command, whose session reads the disk unfenced, and which may hold
 * no mount — nor on a remote agent, filed no local field. Nor where the harness's permission rules cannot carry a character of its path
 * (`unruledIn`), as for the step's own files directory (`ownMounts`): the session is still told the folder (`WORKFLOW_FILES`).
 */
export const workflowMounts = (step: Pick<Workflow, 'harness'>, dir: string | undefined): Mount[] => {
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
const serversOf = (
  step: Pick<Workflow, 'agent'>,
  record: FactoryServers | undefined,
): { projectMcp?: string[]; mcp?: Record<string, FactoryServer> } => {
  if (step.agent === undefined) return { projectMcp: [] };
  if (step.agent.mcp === undefined) return {};
  const { mcp, checkout } = splitServers(step.agent.mcp, record);
  return { projectMcp: checkout, ...(mcp === undefined ? {} : { mcp }) };
};

/** `mounts` as a config holds them: the key, or none for no folder. */
const mountsOf = (mounts: Mount[]): { mounts?: Mount[] } => (mounts.length ? { mounts } : {});

/** The model a try runs on: a fresh one on the model it asked for, or the step's; any other on the one its session was started on. */
export const tryModel = (step: Workflow, record: StepRecord | undefined, how: Pick<RetryHow, 'mode' | 'model'>): string | undefined =>
  how.mode === 'fresh' ? (how.model ?? step.model) : sessionModel(step, record);
