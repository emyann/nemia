/**
 * The Task door's rules for one append, pure (`contracts/journal.contract.ts`): asked by `Journal.layer` before any store is
 * written, so every store a caller gives holds them. A task is opened by its filing alone, once, under an id a file can be named by
 * (`taskIdRefusal`, whose words the door passes as `idRefusal`), and its attempts number from 1 with no gap (`Task`, `model.ts`).
 */
import type { AppendRefusal } from '../../../contracts/journal.contract.ts';

export type { AppendRefusalReason } from './append-refusals.ts';
export { APPEND_REFUSALS } from './append-refusals.ts';

/**
 * Why the door refuses one append, with the words that say what to do, or `undefined` where it takes it: a filing under a malformed
 * id or of a task already filed, any other entry to a task with no journal, and a start out of its attempts' order.
 * Proved by `contracts/journal.contract.ts`.
 * @param idRefusal What is wrong with the task's id (`taskIdRefusal`), or undefined where it can name a file.
 * @param event The entry to append.
 * @param held What the door holds of the task before the append: whether it has a journal, and how many attempts it started.
 */
export const appendRefusal: AppendRefusal = (idRefusal, event, held) => {
  if (event.kind === 'filed') {
    if (idRefusal !== undefined) return { reason: 'malformed-id', message: idRefusal };
    if (held.journal)
      return {
        reason: 'filed-twice',
        message: 'This task id is already filed, and a task is filed once. File the new task under another id, or leave `id` out.',
      };
    return undefined;
  }
  if (!held.journal)
    return {
      reason: 'not-filed',
      message: 'This task has no journal: it was forgotten, or never filed, and is not written to again. File a new task.',
    };
  if (event.kind === 'starting' && event.attempt !== held.started + 1)
    return {
      reason: 'attempt-out-of-order',
      message: `This task has started ${held.started} attempts, so its next start is attempt ${held.started + 1}: start it at \`attempts.length + 1\`.`,
    };
  return undefined;
};
