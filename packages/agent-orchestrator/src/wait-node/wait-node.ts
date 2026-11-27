/**
 * A wait node (`waitsFor:`): a node of the workflow's graph that runs no session and no command, and passes once every condition it names
 * is written True for the try it is on, by a program of the factory or by a person (`nemia condition`). The way a Pod waits on the
 * conditions of its `readinessGates`, and a job on a deployment's protection rules. The loader lays each name as a condition check, so the
 * node stands on its checks alone (`ownStatus`); it files no task, and its record is filed once its checks are laid (`waitFiled`). Pure.
 */
import { checkTaskId, type Run, type StepRecord } from '../record/record.ts';
import { stepChecks, type StepSpec } from '../step/step.ts';

/**
 * Whether a step is a wait node: it has a `waitsFor:` list.
 * @param step The step read, or undefined where there is none.
 */
export const isWaitNode = (step: Pick<StepSpec, 'waitsFor'> | undefined): step is StepSpec & { waitsFor: string[] } =>
  step?.waitsFor !== undefined;

/**
 * Whether anything of a step is filed for the try it is on: its task, or, for a wait node, which files none, its checks laid on its record.
 * @param step The step read, or undefined where there is none.
 * @param record The step's record, or undefined where the run has none of it.
 */
export const waitFiled = (step: Pick<StepSpec, 'waitsFor'> | undefined, record: Pick<StepRecord, 'taskId' | 'check'> | undefined) =>
  Boolean(record?.taskId) || (step?.waitsFor !== undefined && Boolean(record?.check));

/**
 * The check a wait node's record holds for its try `n`: one task id per condition (`checkTaskId`), the first as `taskId`, none filed yet.
 * @param run The run, whose id the task ids carry.
 * @param step The wait node.
 * @param n The try the checks belong to, from 1.
 */
export const waitCheck = (run: Run, step: StepSpec, n: number) => {
  const plan = stepChecks(step);
  const tasks = Object.fromEntries(plan.map((c) => [c.name, checkTaskId(run, step.name, n, c.name)]));
  return { taskId: Object.values(tasks)[0] ?? checkTaskId(run, step.name, n), tasks } satisfies NonNullable<StepRecord['check']>;
};

/**
 * The record a wait node is filed with once it is ready: no task, its first parent's workspace and branch where that has them, the run's
 * workspace otherwise, and its checks laid for the try it is on.
 * @param run The run.
 * @param step The wait node.
 */
export const waitRecord = (run: Run, step: StepSpec) => {
  const parent = run.steps[step.after[0] ?? ''];
  return {
    ...run.steps[step.name],
    taskId: null,
    workspace: parent?.workspace ?? run.workspace,
    ...(parent?.branch === undefined ? {} : { branch: parent.branch }),
    check: waitCheck(run, step, (run.steps[step.name]?.tries?.length ?? 0) + 1),
  } satisfies StepRecord;
};
