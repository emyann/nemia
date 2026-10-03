/** The configuration a step's task is filed with, built in one place for its first filing, a try, a round, and the asks before them. */
import { modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { filedAllows, filedDenies } from '../ending/ending.ts';
import { sessionModel, type RetryHow } from '../retry/index.ts';
import type { Run, StepRecord } from '../record/record.ts';
import { stepMounts } from '../factory/factory.ts';

/**
 * The harness's arguments a step is filed with, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow
 * the run froze: its model and cap as the filing chooses them (`t`), its context window off the session it continues
 * (`sessionContext`), its deny list with an ending's (`filedDenies`), its allow list with an ending's read of the run's artifacts folder
 * (`runArtifacts`, `filedAllows`), the folders the run mounts (`mounts`, frozen at start), writable where the step's `writable:` names
 * one (`stepMounts`), and the harness's own arguments (`own`) last. The runtime judges no budget: `budgetUsd` is the harness's own cap,
 * and whether the step went over is this package's (`ownStatus`). Pure.
 */
export const filedConfig = <Own extends object>(
  step: Workflow,
  steps: readonly Workflow[],
  run: Pick<Run, 'gates' | 'mounts'>,
  t: { model: string | undefined; budgetUsd: number | undefined; runArtifacts: string; own: Own },
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
  ...(run.mounts ? { mounts: stepMounts(step, run.mounts) } : {}),
  ...t.own,
});

/** The model a try runs on: a fresh one on the model it asked for, or the step's; any other on the one its session was started on. */
export const tryModel = (step: Workflow, record: StepRecord | undefined, how: Pick<RetryHow, 'mode' | 'model'>): string | undefined =>
  how.mode === 'fresh' ? (how.model ?? step.model) : sessionModel(step, record);
