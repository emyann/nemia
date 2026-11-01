/**
 * The Task door's rules for one append, pure (`contracts/journal.contract.ts`): asked by `Journal.layer` before any store is
 * written, so every store a caller gives holds them. A task is opened by its filing alone, once, under an id a file can be named by
 * (`taskIdRefusal`, whose words the door passes as `idRefusal`), and its attempts number from 1 with no gap (`Task`, `model.ts`).
 */
import type { AppendRefusal } from '../../../contracts/journal.contract.ts';

/** Why the door refuses an append, a closed set: the words of `JournalError.reason`. */
export const APPEND_REFUSALS = ['malformed-id', 'filed-twice', 'not-filed', 'attempt-out-of-order'] as const;
export type AppendRefusalReason = (typeof APPEND_REFUSALS)[number];

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
