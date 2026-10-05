/**
 * A person's verbs a pass or `nemia cancel` asks of the engine for a task it read — stop it (`stopAsked`), close it (`closeHeld`), answer it
 * (`answerHeld`) — each undefined once asked, and the engine's refusal in its words where it refused: the task moved since it was read,
 * so a refusal is a note, not a failure. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import type { Engine } from '../runtime-client.ts';

/** Undefined once `ask` resolves; the message of what it rejects with where that is a refusal (`exitCode` 2); anything else thrown. */
const refusedWords = async (ask: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await ask();
    return undefined;
  } catch (err) {
    if ((err as { exitCode?: number }).exitCode === 2) return (err as Error).message;
    throw err;
  }
};

/**
 * Ask the engine to stop a task (`e.stop`): undefined once asked, and the engine's refusal in its words where it refused — the task
 * settled, or was asked to stop, since the caller read it, so what the stop was for is met. Any other error is the engine's, and thrown.
 */
export const stopAsked = (e: Engine, taskId: string): Promise<string | undefined> => refusedWords(() => e.stop(taskId));

/**
 * Close a task held open that waits for a word (`e.close`): undefined once closed, and the engine's refusal in its words where it refused
 * — the task was answered, settled or stopped since this pass read it. The next pass reads the task again. Any other error is the
 * engine's, and thrown.
 */
export const closeHeld = (e: Engine, taskId: string): Promise<string | undefined> => refusedWords(() => e.close(taskId));

/**
 * Answer a task held open that waits for a word (`e.answer`), with a turn's cap where there is one — the turn's own `config`, laid over
 * the filing's by the runtime: undefined once answered, as `closeHeld`. `text` is a nudge's brief, which the runtime hands the session it
 * continues as the turn's words; the tools, the model and the fence stay the task's, as filed.
 */
export const answerHeld = (e: Engine, taskId: string, text: string, budgetUsd: number | undefined): Promise<string | undefined> =>
  refusedWords(() => e.answer(taskId, text, budgetUsd === undefined ? {} : { config: { budgetUsd } }));
