/**
 * What a kind's import does with one file of a store kept before the kind's records were in the keyspace (agent-orchestrator,
 * src/keyspace/import.ts): asked by the one import every kind's door opens its keyspace through (`src/keyspace/import.store.ts`), once
 * for every file of the kind's folders before anything is written or moved, and again for each file as it is imported.
 *
 * The intent's rules for a kind that moves, and which law holds each here:
 *
 * - A live store's files are imported once and kept aside, never deleted, and none is orphaned: a file that reads becomes its record, or
 *   is moved aside unwritten where its key is held already (`writtenExactlyWhenItReadsAndIsNew`, `asideExactlyWhenItReadsAndIsHeld`).
 * - A key already held is never written over: the record the keyspace holds wins over a file an older process left
 *   (`heldNeverWrittenOver`).
 * - A file larger than a record holds stops the import whole, before anything is written or moved, naming the file
 *   (`overCeilingStops`): the shell asks every file first and stops on the first `stop`.
 * - A file that does not read as its kind is left where it is and said in the log, so no stray file becomes a record
 *   (`unreadableLeft`); a file gone since the folder was listed is passed over (`goneIsNothing`).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** How a file of a kind read: as its kind (`reads`), as no record of its kind (`unreadable`), or not at all, gone since it was listed. */
export type FileRead = 'reads' | 'unreadable' | 'gone';

/**
 * One file of a kind as the import found it: how it read, its size in bytes (0 where it is gone), and whether the keyspace holds a live
 * record at the key the file's record would be written at (`held`).
 */
export type ImportFile = { readonly read: FileRead; readonly size: number; readonly held: boolean };

/**
 * What the import does with the file: writes its record and then moves it aside (`write`), moves it aside unwritten (`aside`), leaves it
 * where it is and says so in the log (`leave`), does nothing (`none`), or stops the whole import before anything is written or moved
 * (`stop`, the door's `Invalid`, naming the file and the fix).
 */
export type ImportAct = 'write' | 'aside' | 'leave' | 'none' | 'stop';

/** Whether `n` is a whole number from 0 that a double holds exactly, as a size and a ceiling are. */
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Whether the file is there and larger than a record of the keyspace holds. */
const over = (file: ImportFile, ceiling: number) => file.read !== 'gone' && file.size > ceiling;

const importActSpec = spec<(file: ImportFile, ceiling: number) => ImportAct>({
  requires: ({ input: [file, ceiling] }) => whole(file.size) && whole(ceiling) && (file.read !== 'gone' || file.size === 0),
  ensures: {
    overCeilingStops: {
      description: 'A file there that is larger than a record holds stops the whole import, whatever it holds and whatever the keyspace holds',
      condition: ({ input: [file, ceiling], output }) => !over(file, ceiling) || output === 'stop',
    },
    stopsOnlyOverCeiling: {
      description: 'Nothing but a file larger than a record holds stops the import',
      condition: ({ input: [file, ceiling], output }) => output !== 'stop' || over(file, ceiling),
    },
    heldNeverWrittenOver: {
      description: 'A file whose key the keyspace holds already is never written: the record held wins',
      condition: ({ input: [file], output }) => !file.held || output !== 'write',
    },
    writtenExactlyWhenItReadsAndIsNew: {
      description: 'A file is written exactly when it reads as its kind, fits a record, and its key is not held',
      condition: ({ input: [file, ceiling], output }) =>
        (output === 'write') === (file.read === 'reads' && !over(file, ceiling) && !file.held),
    },
    asideExactlyWhenItReadsAndIsHeld: {
      description: 'A file is moved aside unwritten exactly when it reads as its kind, fits a record, and its key is held already',
      condition: ({ input: [file, ceiling], output }) =>
        (output === 'aside') === (file.read === 'reads' && !over(file, ceiling) && file.held),
    },
    unreadableLeft: {
      description: 'A file that does not read as its kind and fits a record is left where it is, and is never a record',
      condition: ({ input: [file, ceiling], output }) => file.read !== 'unreadable' || over(file, ceiling) || output === 'leave',
    },
    goneIsNothing: {
      description: 'A file gone since its folder was listed is passed over',
      condition: ({ input: [file], output }) => file.read !== 'gone' || output === 'none',
    },
  },
});

/** `importAct`'s type, which `src/keyspace/import.ts` takes and `src/keyspace/import.store.ts` asks of each file of a kind. */
export type ImportActOf = Implementation<typeof importActSpec>;
