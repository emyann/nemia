/**
 * Which of a step's named checks the pass files now, and where the step stands on them (`checksDue`, proved by
 * contracts/checks-due.contract.ts), and where one check stands off its task (`standingOf`). Pure: the pass reads each check's task, asks
 * this, and carries nothing to the next pass.
 */
import type { CheckNode, CheckStanding, ChecksDue, ChecksDueOf } from '../../contracts/checks-due.contract.ts';
import { checkTaskId, type Run, type TaskPhase } from '../record/record.ts';
import { stepChecks, type StepSpec } from '../step/step.ts';

export type { CheckNode, CheckStanding, ChecksDue, ChecksVerdict } from '../../contracts/checks-due.contract.ts';

/**
 * The checks the pass files now and the step's verdict on its checks: once one refused or did not finish nothing more is filed, and the
 * step fails once none still runs; until then every waiting check whose waits all passed is filed, and the step passes once every check
 * passed.
 * @param checks The step's checks in its order, each with its waits and where it stands.
 */
export const checksDue: ChecksDueOf = (checks) => {
  const stopped = checks.some((c) => c.standing === 'refused' || c.standing === 'unfinished');
  const running = checks.some((c) => c.standing === 'running');
  const passed = (name: string) => checks.some((c) => c.name === name && c.standing === 'passed');
  const file = stopped ? [] : checks.filter((c) => c.standing === 'waiting' && c.after.every(passed)).map((c) => c.name);
  const verdict = checks.every((c) => c.standing === 'passed') ? 'passed' : stopped && !running ? 'failed' : 'checking';
  return { file, verdict } satisfies ChecksDue;
};

/**
 * Where a check stands off its task's phase and its last attempt's exit: `waiting` for a task the engine has no record of (not filed on
 * this try), `passed` once it succeeded, `refused` once it failed with an exit code, `unfinished` once it settled with none, and
 * `running` until it settles.
 * @param phase The phase the check's task stands in.
 * @param exited Whether its last attempt exited with a code (`attemptVerdict` a number).
 */
export const standingOf = (phase: TaskPhase, exited: boolean) => {
  const standing: CheckStanding =
    phase === 'unknown'
      ? 'waiting'
      : phase === 'succeeded'
        ? 'passed'
        : phase === 'failed' && exited
          ? 'refused'
          : phase === 'failed' || phase === 'stopped'
            ? 'unfinished'
            : 'running';
  return standing;
};

/**
 * A step's checks as the pass reads them (`CheckNode`), each from its plan and the phase of its task: what `checksDue` judges.
 * @param plan The step's checks, each its name and its waits.
 * @param standing Where each check stands, by its name.
 */
export const checkNodes = (plan: readonly { name: string; after: readonly string[] }[], standing: (name: string) => CheckStanding) =>
  plan.map((c) => ({ name: c.name, after: c.after, standing: standing(c.name) }) satisfies CheckNode);

/** A check on a step's or a try's record: its first task, and each task by its check's name where it has several (`checkTasksOf`). */
type CheckOnRecord = { readonly taskId: string; readonly tasks?: Readonly<Record<string, string>> };

/**
 * The phase a step's checks stand in together, read as one check's task phase is: the one task's own phase for a step with one check, and
 * for several, off `checksDue`'s verdict on them — `succeeded` once every one passed, `failed` once one refused and none still runs
 * (`stopped` where none of those that stopped exited with a code), `running` until then. What every reader of a step's check verdict
 * reads (`onItsCheck`, `refusedCheck`'s callers), so a step judged by several checks is judged as one judged by one. Pure.
 * @param check The check on the step's record.
 * @param phaseOf The phase of a task the engine holds, by its id.
 */
export const checksPhase = (check: CheckOnRecord, phaseOf: (taskId: string) => TaskPhase) => {
  if (check.tasks === undefined) return phaseOf(check.taskId);
  const tasks = Object.values(check.tasks ?? { check: check.taskId });
  const phases = tasks.map((id) => phaseOf(id));
  if (phases.length <= 1) return phases[0] ?? phaseOf(check.taskId);
  const { verdict } = checksDue(tasks.map((id, i) => ({ name: `${i}`, after: [], standing: standingOf(phases[i] ?? 'unknown', true) })));
  const phase: TaskPhase =
    verdict === 'passed' ? 'succeeded' : verdict === 'checking' ? 'running' : phases.includes('failed') ? 'failed' : 'stopped';
  return phase;
};

/**
 * The task of a step's checks whose end says why they failed: the first that failed with an exit code (`exited`), else the first that
 * stopped or failed with none, else the first; what the step's verdict is read off (`exitVerdicts`) and its out-of-memory kill.
 * @param check The check on the step's record.
 * @param phaseOf The phase of a task the engine holds, by its id.
 * @param exited Whether a task's last attempt exited with a code, by its id.
 */
export const decidingCheckTask = (check: CheckOnRecord, phaseOf: (taskId: string) => TaskPhase, exited: (taskId: string) => boolean) => {
  const tasks = Object.values(check.tasks ?? { check: check.taskId });
  return (
    tasks.find((id) => phaseOf(id) === 'failed' && exited(id)) ??
    tasks.find((id) => phaseOf(id) === 'failed' || phaseOf(id) === 'stopped') ??
    check.taskId
  );
};

/**
 * The task of a step's check on its current try, by the check's name: the one its record names where the record holds it, else the id
 * the check is filed under (`checkTaskId`), derived so a pass that dies after filing it adopts it on the next.
 * @param run The run, whose record names the step's checks.
 * @param step The step's name.
 * @param name The check's name.
 */
export const currentCheckTask = (run: Run, step: string, name: string) => {
  const check = run.steps[step]?.check;
  return check?.tasks?.[name] ?? (check && !check.tasks && name === 'check' ? check.taskId : checkTaskId(run, step, undefined, name));
};

/**
 * The phase a check on the record stands in: a step's one check (`check:`, no `tasks` on its record) is on the record once it was filed,
 * so a task the engine has no record of is one still checking, never one to file again; a check of several is named on the record before
 * it is filed, so its task's phase is read as it is.
 * @param check The check on the step's record.
 * @param phase The phase of the check's task.
 */
const filedPhase = (check: CheckOnRecord, phase: TaskPhase) =>
  (check.tasks === undefined && phase === 'unknown' ? 'running' : phase) satisfies TaskPhase;

/**
 * What the pass does with a step's checks on its current try (`checksDue`): each check of its plan read where its task stands, a check not
 * filed yet `waiting`, and a step's one check, once on the record, never so (`filedPhase`). Pure.
 * @param run The run, whose record names the step's checks.
 * @param step The step, whose plan of checks is read (`stepChecks`).
 * @param phaseOf The phase of a task the engine holds, by its id: `unknown` for one it has no record of.
 */
export const stepChecksDue = (run: Run, step: StepSpec, phaseOf: (taskId: string) => TaskPhase) => {
  const filed = run.steps[step.name]?.check;
  return checksDue(
    checkNodes(stepChecks(step), (name) =>
      filed === undefined ? 'waiting' : standingOf(filedPhase(filed, phaseOf(currentCheckTask(run, step.name, name))), true),
    ),
  );
};
