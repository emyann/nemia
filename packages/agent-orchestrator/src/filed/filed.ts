/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import { modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { isFolderTeam, sandboxed } from '../workflow/index.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Mount, Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import { handedMounts, type HandedFiles } from '../artifacts/artifacts.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow the
 * run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues (`sessionContext`), its
 * deny list with what the run's place denies an ending (`filedDenies`, `t.landingDenied`, asked of an ending alone), its allow list with
 * an ending's read of the run's artifacts folder (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start),
 * writable where the step's `writable:` names one (`stepMounts`), then the folders its brief names beside them (`filedFolders`): the
 * artifacts folder of each step it comes after, read-only, then the store's folders its `reads:` names, read-only, the inbox at `t.inbox`,
 * then the run's inputs folder at `t.inputs`, read-only, given only for a run given inputs; the key left out with none, the servers of
 * the checkout its sessions load (`checkoutMcpOf`), and the harness's own arguments (`own`) last. The runtime judges no budget:
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
  },
) => ({
  model: t.model,
  effort: step.effort,
  contextTokens: sessionContext(step, steps),
  permissionMode: modeOf(step),
  tools: step.tools,
  disallowedTools: filedDenies(step, run, t.landingDenied),
  allowedTools: filedAllows(step, t.runArtifacts),
  background: step.background,
  budgetUsd: t.budgetUsd,
  ...mountsOf([...(stepMounts(step, run.mounts) ?? []), ...folders(filedFolders(step, steps, t))]),
  ...checkoutMcpOf(step),
  ...t.own,
});

/**
 * The folders a step is filed with beyond its factory's, each read-only: those the steps before it handed over, then the store's, then
 * the run's inputs folder. And `named`, for its brief alone and no part of the filing: by the path of a handed folder, which of the
 * files its step's closeout named are there as the step is filed (`HandedFiles`), where the tick read them.
 */
export type FiledFolders = { handed: Mount[]; store: Mount[]; inputs: Mount[]; named?: Readonly<Record<string, HandedFiles>> };

/**
 * The folders a step is filed with beyond its factory's, the one source of the filing's (`filedConfig`) and of what its brief names
 * (`mountsLine`, `inputsLine`): the artifacts folder of each step it comes after, under `t.runArtifacts` (`handedMounts`), the store's
 * folders its `reads:` names, the inbox at `t.inbox` (`readsMounts`), and the run's inputs folder at `t.inputs`, given only for a run
 * given inputs (`inputsMounts`). Pure.
 */
export const filedFolders = (
  step: Workflow,
  steps: readonly Workflow[],
  t: { runArtifacts: string; inbox: string; inputs?: string },
): FiledFolders => ({
  handed: handedMounts(step, steps, t.runArtifacts),
  store: readsMounts(step, t.inbox),
  inputs: inputsMounts(step, steps, t.inputs),
});

/** A step's folders beyond its factory's, in the order they are filed: the handed ones, the store's, then the run's inputs folder. */
const folders = (f: FiledFolders): Mount[] => [...f.handed, ...f.store, ...f.inputs];

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
 * The MCP servers of its checkout a step's sessions load, as a config holds them: the names its frozen agent gives (`StepAgent.mcp`),
 * none for a step with no agent, and no key for an agent frozen before it named any, whose sessions load the whole file as they did.
 */
const checkoutMcpOf = (step: Pick<Workflow, 'agent'>): { checkoutMcp?: string[] } =>
  step.agent === undefined ? { checkoutMcp: [] } : step.agent.mcp === undefined ? {} : { checkoutMcp: step.agent.mcp };

/** `mounts` as a config holds them: the key, or none for no folder. */
const mountsOf = (mounts: Mount[]): { mounts?: Mount[] } => (mounts.length ? { mounts } : {});

/** The model a try runs on: a fresh one on the model it asked for, or the step's; any other on the one its session was started on. */
export const tryModel = (step: Workflow, record: StepRecord | undefined, how: Pick<RetryHow, 'mode' | 'model'>): string | undefined =>
  how.mode === 'fresh' ? (how.model ?? step.model) : sessionModel(step, record);
