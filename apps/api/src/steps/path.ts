/** A step's try and the task that ran it, for the path of that task through the runtime's lifecycle (`engine.path`). */
import type { Effect } from 'effect';
import type { Run } from 'agent-orchestrator/run';
import { turnOfTry } from '../detail/tries.ts';
import type { Engine } from '../store.ts';

/** One transition of a task's path: the lifecycle state its journal says once an entry is on it, the entry's kind and its `at`. */
export type LifecycleTransition = Effect.Success<ReturnType<Engine['Service']['path']>>[number];

/**
 * The path of one try of a step: its task, the try's number counted from 1 as the step's tries count them (`triesOf`), and the task's
 * path from its filing to the end of that try. A step not filed yet has no task and an empty path.
 */
export type StepPath = { taskId: string | null; try: number; path: LifecycleTransition[] };

/**
 * The try of `step` that `asked` names — the current one when it is undefined or empty — with its task, and the turn of that task it
 * ended on: undefined for the current try, whose path runs to now. Refused with 400 for a try that is not a whole number from 1, and 404
 * for one past the current.
 */
export function tryOfStep(
  run: Run,
  step: string,
  asked: string | undefined,
): { try: number; taskId: string | null; turn?: number } | { status: 400 | 404; error: string } {
  const record = run.steps[step];
  const earlier = record?.tries ?? [];
  const current = earlier.length + 1;
  if (asked === undefined || asked === '') return { try: current, taskId: record?.taskId ?? null };
  if (!/^[1-9]\d*$/.test(asked)) {
    return {
      status: 400,
      error: `\`${asked}\` is not a try: give a whole number from 1, as GET /api/runs/${run.id} numbers the step's \`tries\`, or none for the current one.`,
    };
  }
  const n = Number(asked);
  if (n > current) {
    return {
      status: 404,
      error: `Step '${step}' of run '${run.id}' has had ${current} ${current === 1 ? 'try' : 'tries'}, so it has no try ${n}. GET /api/runs/${run.id} lists them under \`tries\`.`,
    };
  }
  const at = earlier[n - 1];
  if (at === undefined) return { try: current, taskId: record?.taskId ?? null };
  return { try: n, taskId: at.taskId, turn: turnOfTry(earlier.slice(0, n - 1), at) };
}

/**
 * A task's path cut to the end of its turn `turn`: everything before the `input` entry that opened the turn after it. The whole path for
 * no turn, and for a turn no answer followed.
 */
export function pathToTurn(path: readonly LifecycleTransition[], turn: number | undefined): LifecycleTransition[] {
  if (turn === undefined) return [...path];
  let inputs = 0;
  const end = path.findIndex((s) => s.event === 'input' && ++inputs > turn);
  return end === -1 ? [...path] : path.slice(0, end);
}
