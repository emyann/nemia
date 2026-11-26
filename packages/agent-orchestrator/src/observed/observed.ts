/**
 * Whether the daemon writes a record of what it observed (contracts/observed.contract.ts, `recordDue`, proved law by law): a definition's
 * index record and a run's observed status are written only when what is observed differs from what the record holds, so the record's
 * revision moves exactly when the world it stands for does. Pure.
 */
import type { RecordDueOf } from '../../contracts/observed.contract.ts';

export type { RecordDue } from '../../contracts/observed.contract.ts';

/**
 * What to write of a record of an observed world.
 * @param held The text the record holds, or null where none is held.
 * @param now The text of what is observed now, or null where the world is gone.
 */
export const recordDue: RecordDueOf = (held, now) => {
  if (held === now) return { keep: true };
  if (now === null) return { write: 'delete' };
  return { write: held === null ? 'create' : 'update' };
};
