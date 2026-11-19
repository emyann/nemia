/** A step's try and the task that ran it, for the path of that task through the runtime's lifecycle (`engine.path`). */
import type { Effect } from 'effect';
import type { Run } from 'agent-orchestrator/run';
import { turnOfTry } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/** One transition of a task's path: the lifecycle state its journal says once an entry is on it, the entry's kind and its `at`. */
export type LifecycleTransition = Effect.Success<ReturnType<Engine['Service']['path']>>[number];

/**
 * The try of `step` that `asked` names — the current one when it is undefined or empty — with its task, and the turn of that task it
 * ended on: undefined for the current try, whose path runs to now. Refused with 400 for a try that is not a whole number from 1, and 404
 * for one past the current.
 * @param run The run.
 * @param step The step's name.
 * @param asked The try's number, as the request gives it; undefined or empty for the current one.
 */
export function tryOfStep(run: Run, step: string, asked: string | undefined) {
  const record = run.steps[step];
  const earlier = record?.tries ?? [];
  const current = earlier.length + 1;
  if (asked === undefined || asked === '')
    return { try: current, taskId: record?.taskId ?? null } satisfies
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string } as
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string };
  if (!/^[1-9]\d*$/.test(asked)) {
    return {
      status: 400,
      error: `\`${asked}\` is not a try: give a whole number from 1, as GET /api/runs/${run.id} numbers the step's \`tries\`, or none for the current one.`,
    } satisfies { try: number; taskId: string | null; turn?: number } | { status: 400 | 404; error: string } as
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string };
  }
  const n = Number(asked);
  if (n > current) {
    return {
      status: 404,
      error: `Step '${step}' of run '${run.id}' has had ${current} ${current === 1 ? 'try' : 'tries'}, so it has no try ${n}. GET /api/runs/${run.id} lists them under \`tries\`.`,
    } satisfies { try: number; taskId: string | null; turn?: number } | { status: 400 | 404; error: string } as
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string };
  }
  const at = earlier[n - 1];
  if (at === undefined)
    return { try: current, taskId: record?.taskId ?? null } satisfies
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string } as
      | { try: number; taskId: string | null; turn?: number }
      | { status: 400 | 404; error: string };
  return { try: n, taskId: at.taskId, turn: turnOfTry(earlier.slice(0, n - 1), at) } satisfies
    | { try: number; taskId: string | null; turn?: number }
    | { status: 400 | 404; error: string } as { try: number; taskId: string | null; turn?: number } | { status: 400 | 404; error: string };
}

/**
 * A task's path cut to the end of its turn `turn`: everything before the `input` entry that opened the turn after it. The whole path for
 * no turn, and for a turn no answer followed.
 * @param path The task's path.
 * @param turn The turn to cut at, counted from 0, or undefined for the whole path.
 */
export function pathToTurn(path: readonly LifecycleTransition[], turn: number | undefined) {
  if (turn === undefined) return [...path];
  let inputs = 0;
  const end = path.findIndex((s) => s.event === 'input' && ++inputs > turn);
  return end === -1 ? [...path] : path.slice(0, end);
}
