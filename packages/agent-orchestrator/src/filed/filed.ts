/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import { modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { sandboxed } from '../workflow/index.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Mount, Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';
import { handedMounts } from '../artifacts/artifacts.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow
 * the run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues
 * (`sessionContext`), its deny list with an ending's (`filedDenies`), its allow list with an ending's read of the run's artifacts folder
 * (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start), writable where the step's `writable:` names
 * one (`stepMounts`), then the folders its brief names beside them (`filedFolders`): the artifacts folder of each step it comes after,
 * read-only, then the store's folders its `reads:` names, read-only, the inbox at `t.inbox`; the key left out with none, and the harness's own arguments (`own`)
 * last. The runtime judges no budget: `budgetUsd` is the harness's own cap,
 * and whether the step went over is this package's (`ownStatus`). Pure.
 */
export const filedConfig = <Own extends object>(
  step: Workflow,
  steps: readonly Workflow[],
  run: Pick<Run, 'gates' | 'mounts'>,
  t: { model: string | undefined; budgetUsd: number | undefined; runArtifacts: string; inbox: string; own: Own },
) => ({
  model: t.model,
  effort: step.effort,
  contextTokens: sessionContext(step, steps),
  permissionMode: modeOf(step),
  tools: step.tools,
  disallowedTools: filedDenies(step, run),
  allowedTools: filedAllows(step, t.runArtifacts),
  background: step.background,
  budgetUsd: t.budgetUsd,
  ...mountsOf([...(stepMounts(step, run.mounts) ?? []), ...folders(filedFolders(step, steps, t))]),
  ...t.own,
});

/** The folders a step is filed with beyond its factory's, each read-only: those the steps before it handed over, then the store's. */
export type FiledFolders = { handed: Mount[]; store: Mount[] };

/**
 * The folders a step is filed with beyond its factory's, the one source of the filing's (`filedConfig`) and of what its brief names
 * (`mountsLine`): the artifacts folder of each step it comes after, under `t.runArtifacts` (`handedMounts`), and the store's folders its
 * `reads:` names, the inbox at `t.inbox` (`readsMounts`). Pure.
 */
export const filedFolders = (
  step: Workflow,
  steps: readonly Workflow[],
  t: { runArtifacts: string; inbox: string },
): FiledFolders => ({ handed: handedMounts(step, steps, t.runArtifacts), store: readsMounts(step, t.inbox) });

/** A step's folders beyond its factory's, in the order they are filed: the handed ones, then the store's. */
const folders = (f: FiledFolders): Mount[] => [...f.handed, ...f.store];

/**
 * The store's folders a step's `reads:` names, each read-only: the inbox (`inbox`, its absolute path) when it names it. It reads the
 * cards and writes none of them, whatever its fence. None on a harness fenced by a sandbox, which reads the disk already, nor on a remote
 * agent, filed no local field.
 */
export const readsMounts = (step: Pick<Workflow, 'harness' | 'reads'>, inbox: string): Mount[] =>
  isRemoteHarness(step.harness) || sandboxed(step.harness ?? DEFAULT_HARNESS) || !step.reads?.includes('inbox')
    ? []
    : [{ path: inbox, readOnly: true }];

/** `mounts` as a config holds them: the key, or none for no folder. */
const mountsOf = (mounts: Mount[]): { mounts?: Mount[] } => (mounts.length ? { mounts } : {});

/** The model a try runs on: a fresh one on the model it asked for, or the step's; any other on the one its session was started on. */
export const tryModel = (step: Workflow, record: StepRecord | undefined, how: Pick<RetryHow, 'mode' | 'model'>): string | undefined =>
  how.mode === 'fresh' ? (how.model ?? step.model) : sessionModel(step, record);
