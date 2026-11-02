/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import path from 'node:path';
import { modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { isFolderTeam, sandboxed, writesOutsideByRule } from '../workflow/index.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Mount, Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import { handedMounts, type HandedFiles } from '../artifacts/artifacts.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { unruledIn } from 'agent-runtime/vocabulary';
import { splitServers, type FactoryServer, type FactoryServers } from '../servers/index.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow the
 * run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues (`sessionContext`), its
 * deny list with what the run's place denies an ending (`filedDenies`, `t.landingDenied`, asked of an ending alone), its allow list with
 * an ending's read of the run's artifacts folder (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start),
 * writable where the step's `writable:` names one (`stepMounts`), then the folders its brief names beside them (`filedFolders`): its own
 * files directory, read-only, for a step that writes outside its directory only by rule (`ownMounts`), the
 * artifacts folder of each step it comes after, read-only, then the store's folders its `reads:` names, read-only, the inbox at `t.inbox`,
 * then the run's inputs folder at `t.inputs`, read-only, given only for a run given inputs; the key left out with none, the MCP servers
 * its sessions load, its factory's record first and the checkout's `.mcp.json` for the rest (`serversOf`), the step's files directory in
 * its session's environment (`stepFilesEnv`), and the
 * harness's own arguments (`own`) last. The runtime judges no budget:
 * `budgetUsd` is the harness's own cap, and whether the step went over is this package's (`ownStatus`). Pure.
 */
export const filedConfig = <Own extends object>(
  step: Workflow,
  steps: readonly Workflow[],
  run: Pick<Run, 'gates' | 'mounts'>,
  t: {
    model: string | undefined;
    budgetUsd: number | undefined;
    runArtifacts: string;
    inbox: string;
    inputs?: string;
    own: Own;
    landingDenied: () => readonly string[];
    /**
     * The servers the run's factory records (`factoryServers`), read by the caller's store and handed in: a name the step's agent gives
     * resolves against these before the checkout's `.mcp.json`. One writer hands it — `filedAt`, which every caller spreads — because a
     * caller that passed none would silently give the step no factory server and have it refused for a name the checkout does not
     * declare. `{}` or absent: every name resolves against the checkout, as it did.
     */
    servers?: FactoryServers;
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
  ...mountsOf([...(stepMounts(step, run.mounts) ?? []), ...folders(filedFolders(step, steps, t))]),
  ...serversOf(step, t.servers),
  ...stepFilesEnv(step, t.runArtifacts),
  ...t.own,
});

/**
 * The variable a step's session finds its files directory in: the run's artifacts folder of the step (`artifactsDir`), outside every
 * workspace, where a file it or a process it starts writes is kept with the run and named in its closeout by its absolute path.
 */
export const STEP_FILES = 'WF_STEP_FILES';

/** A step's session's own environment: its files directory under `runArtifacts` as `STEP_FILES`. */
const stepFilesEnv = (step: Pick<Workflow, 'name'>, runArtifacts: string): { env: Record<string, string> } => ({
  env: { [STEP_FILES]: stepFilesOf(step, runArtifacts) },
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
  named?: Readonly<Record<string, HandedFiles>>;
  closeouts?: readonly string[];
};

/**
 * The folders a step is filed with beyond its factory's, the one source of the filing's (`filedConfig`) and of what its brief names
 * (`mountsLine`, `inputsLine`): its own files directory (`ownMounts`), the artifacts folder of each step it comes after, under
 * `t.runArtifacts` (`handedMounts`), the store's folders its `reads:` names, the inbox at `t.inbox` (`readsMounts`), and the run's inputs
 * folder at `t.inputs`, given only for a run given inputs (`inputsMounts`). Pure.
 */
export const filedFolders = (
  step: Workflow,
  steps: readonly Workflow[],
  t: { runArtifacts: string; inbox: string; inputs?: string },
): FiledFolders => ({
  own: ownMounts(step, t.runArtifacts),
  handed: handedMounts(step, steps, t.runArtifacts),
  store: readsMounts(step, t.inbox),
  inputs: inputsMounts(step, steps, t.inputs),
});

/** A step's folders beyond its factory's, in the order they are filed: its own, the handed ones, the store's, then the run's inputs. */
const folders = (f: FiledFolders): Mount[] => [...(f.own ?? []), ...f.handed, ...f.store, ...f.inputs];

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
