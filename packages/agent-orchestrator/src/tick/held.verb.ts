/**
 * A person's verbs a pass or `nemia cancel` asks of the engine for a task it read — stop it (`stopAsked`), close it (`closeHeld`), answer
 * it (`answerHeld`), close every task of a run that waits for a word (`closeWaitingTasks`) — each an Effect that succeeds with undefined
 * once asked, and with the engine's refusal in its words where it refused: the task moved since it was read, so a refusal is a note, not
 * a failure. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { Cause, Effect, Exit } from 'effect';
import { asked, type Engine, type TaskView } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { waitsForWord } from '../views/views-words.ts';

/**
 * Undefined once the engine's verb `verb`, `ask`, succeeds; the message of what it refused with (`asked`: an error whose `exitCode` is 2);
 * anything else it failed with is the Effect's defect.
 */
const refusedWords = Effect.fnUntraced(function* <E>(verb: string, ask: Effect.Effect<unknown, E>) {
  const done = yield* Effect.exit(asked(verb, ask));
  if (Exit.isSuccess(done)) return undefined;
  const err = Cause.squash(done.cause);
  if ((err as { exitCode?: number }).exitCode === 2) return (err as Error).message;
  return yield* Effect.die(err);
});

/**
 * Ask the engine to stop a task (`e.stop`): undefined once asked, and the engine's refusal in its words where it refused — the task
 * settled, or was asked to stop, since the caller read it, so what the stop was for is met. Any other error is the engine's, and the
 * Effect dies of it.
 */
export const stopAsked = Effect.fn('stopAsked')(function* (e: Engine, taskId: string) {
  return yield* refusedWords('stop', e.stop(taskId));
});

/**
 * Close a task held open that waits for a word (`e.close`): undefined once closed, and the engine's refusal in its words where it refused
 * — the task was answered, settled or stopped since this pass read it. The next pass reads the task again. Any other error is the
 * engine's, and the Effect dies of it.
 */
export const closeHeld = Effect.fn('closeHeld')(function* (e: Engine, taskId: string) {
  return yield* refusedWords('close', e.close(taskId));
});

/**
 * Answer a task held open that waits for a word (`e.answer`), with a turn's cap where there is one — the turn's own `config`, laid over
 * the filing's by the runtime: undefined once answered, as `closeHeld`. `text` is a nudge's brief, which the runtime hands the session it
 * continues as the turn's words; the tools, the model and the fence stay the task's, as filed.
 */
export const answerHeld = Effect.fn('answerHeld')(function* (e: Engine, taskId: string, text: string, budgetUsd: number | undefined) {
  return yield* refusedWords('answer', e.answer(taskId, text, budgetUsd === undefined ? {} : { config: { budgetUsd } }));
});

/**
 * Close each step's task held open that waits for a word, for a verb that ends what the run waits on — `nemia cancel`, `nemia rm` — at once
 * rather than on the next pass. A close is no stop: nothing is running, and the engine settles the task as it signed. Only a step's current
 * task can wait: a try or a round filed as a task of its own closed the one before it. What the engine refuses is returned, worded, and a
 * cancelled run's next pass closes it again (the sweep in `advancePass`).
 */
export const closeWaitingTasks = Effect.fn('closeWaitingTasks')(function* (e: Engine, run: Run, views: ReadonlyMap<string, TaskView>) {
  const waits = waitsForWord(views);
  const refused: string[] = [];
  for (const [name, { taskId }] of Object.entries(run.steps)) {
    if (!taskId || !waits(taskId)) continue;
    const said = yield* closeHeld(e, taskId);
    if (said) refused.push(`${name}: ${said}`);
  }
  return refused;
});
