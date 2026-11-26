/**
 * What a kind's import does with one file of a store kept before the kind's records were in the keyspace, proved law by law
 * (contracts/kind-import.contract.ts) and asked by the one import every kind opens its keyspace through (`import.store.ts`). Pure.
 */
import type { ImportActOf } from '../../contracts/kind-import.contract.ts';

export type { FileRead, ImportAct, ImportFile } from '../../contracts/kind-import.contract.ts';

/**
 * What the import does with `file`: stop the whole import where it is larger than a record holds, pass over one gone, leave one that does
 * not read as its kind, move aside unwritten one whose key is held, and else write its record.
 * @param file How the file read, its size in bytes, and whether its key is held.
 * @param ceiling The largest record the keyspace holds, in bytes.
 */
export const importAct: ImportActOf = (file, ceiling) => {
  if (file.read === 'gone') return 'none';
  if (file.size > ceiling) return 'stop';
  if (file.read === 'unreadable') return 'leave';
  return file.held ? 'aside' : 'write';
};
