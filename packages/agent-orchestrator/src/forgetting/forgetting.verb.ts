/**
 * The engine's tasks of a run forgotten through the runtime's `forget`: by `nemia rm` once the run is removed (`forgetTasks`), by the
 * tick for what had not settled then (`finishForgetting`), and asked without removing anything (`engineForgetting` with `yes: false`).
 * A controller, reaching the runtime through the client (`runtime-client.ts`): Effect programs that require the engine as a service
 * (`EngineService`). What `nemia rm` has yet to see forgotten is written down beside the store's runs (`runStore.forgetting`), so a
 * pass reads it again until nothing of it is left: nothing is carried between passes.
 */
import { Cause, Effect, Result } from 'effect';
import { EngineService, ForgetRefused, type ForgetReport } from '../runtime-client.ts';
import { runStore } from '../record/files.store.ts';
import {
  engineWords,
  forgettingDone,
  forgettingOf,
  forgettingRefused,
  type EngineAnswer,
  type TaskForgotten,
  type TaskKept,
} from './forgetting.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** A task of the engine's report as `EngineAnswer` keeps it: what its harness leaves, every session's together. */
const forgottenOf = (t: ForgetReport['tasks'][number]): TaskForgotten => ({
  taskId: t.taskId,
  journalBytes: t.journalBytes,
  feedLines: t.feedLines,
  left: t.sessions.flatMap((s) => s.left),
});

/**
 * The tasks `ids` forgotten by the engine, or, without `yes`, counted: each viewed first, one the engine has no record of — forgotten
 * already, or never filed — left out, and one not settled set waiting. The settled ones are asked of `forget` together, which refuses
 * the whole call for one task it cannot forget: that task is set refused with the runtime's words, and the rest asked again, so it costs
 * one call, and one more for each task refused on its own. A refusal that names no task, or any other failure of the engine's, is the
 * answer's `refusal`, and nothing more is asked. A view that fails sets its task refused in the runtime's words. Never fails.
 */
export const engineForgetting = Effect.fn('engineForgetting')(function* (ids: readonly string[], { yes }: { yes: boolean }) {
  const e = yield* EngineService;
  const waiting: TaskKept[] = [];
  const refused: TaskKept[] = [];
  let settled: string[] = [];
  for (const taskId of new Set(ids)) {
    const view = yield* e.view(taskId).pipe(Effect.catch((err) => Effect.sync(() => void refused.push({ taskId, why: err.message }))));
    if (!view?.state.brief) continue;
    if (view.state.settled === null) waiting.push({ taskId, why: `${taskId} has not settled yet` });
    else settled.push(taskId);
  }
  while (settled.length) {
    const asked = yield* Effect.result(e.forget(settled, { yes }));
    if (Result.isSuccess(asked)) return { tasks: asked.success.tasks.map(forgottenOf), waiting, refused } satisfies EngineAnswer;
    const err = asked.failure;
    const taskId = err instanceof ForgetRefused ? err.taskId : undefined;
    if (taskId === undefined || !settled.includes(taskId))
      return { tasks: [], waiting, refused, refusal: err.message } satisfies EngineAnswer;
    refused.push({ taskId, why: err.message });
    settled = settled.filter((id) => id !== taskId);
  }
  return { tasks: [], waiting, refused } satisfies EngineAnswer;
});

/**
 * The tasks `taskIds` of the run `id`, whose record is gone, forgotten by the engine (`engineForgetting`), and the run's marker lifted
 * once nothing of them is left (`forgettingDone`): kept while a task waits or the engine refused, for a pass to finish
 * (`finishForgetting`), and then named on the answer. Answers what the engine did with them.
 */
export const forgetTasks = Effect.fn('forgetTasks')(function* (id: string, taskIds: readonly string[]) {
  const forgetting = forgettingOf(yield* engineForgetting(taskIds, { yes: true }), taskIds);
  if (!forgettingDone(forgetting)) return { ...forgetting, marker: runStore.forgetting.where(id) };
  yield* (yield* RunDoor).forgetting.lift(RunId.read(id));
  return forgetting;
});

/** A line of what a pass forgot of removed runs (`finishForgetting`): a warning where the engine refused, or a marker does not read. */
export type ForgettingLine = { text: string; warn?: true };

/**
 * Once a pass: for each run `nemia rm` left a marker of whose record is gone, its tasks forgotten that have settled since, and the marker
 * lifted when none is left (`forgetTasks`). A marker beside a record is a `nemia rm` not finished, and is not touched: the run is still
 * listed, and its views are read. Answers a line for each run the engine forgot something of, or refused, and for each marker that does
 * not read, which only a person removes; none when there is no marker, and then the engine is not asked. Never fails: what fails is a line.
 */
export const finishForgetting = (): Effect.Effect<ForgettingLine[], never, EngineService> =>
  Effect.gen(function* () {
    const said: ForgettingLine[] = [];
    for (const id of yield* (yield* RunDoor).forgetting.list()) {
      if (yield* (yield* RunDoor).runs.exists(RunId.read(id))) continue;
      const marker = runStore.forgetting.where(id);
      const taskIds = yield* (yield* RunDoor).forgetting.read(RunId.read(id));
      if (!taskIds) {
        said.push({
          text: `${marker} does not read as the tasks nemia rm forgets of ${id}: nothing of it is forgotten; a person removes it: rm ${marker}`,
          warn: true,
        });
        continue;
      }
      const forgetting = yield* forgetTasks(id, taskIds);
      const refused = forgettingRefused(forgetting);
      if (forgetting.forgotten.length || refused)
        said.push({ text: `${id} (removed): ${engineWords(forgetting, { id })}`, ...(refused ? { warn: true as const } : {}) });
    }
    return said;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed([
        {
          text: `the tasks of removed runs were not forgotten on this pass: ${(Cause.squash(cause) as Error).message}`,
          warn: true as const,
        },
      ]),
    ),
  );
