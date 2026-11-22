/**
 * The keyspace's decisions, proved law by law (contracts/keyspace.contract.ts), each asked by the store (`keyspace.store.ts`) inside the
 * SQLite transaction that read what it is handed: what a write does to its key (`keyspaceWrite`), where a watch starts (`watchStart`),
 * how far a compaction reaches (`compactTo`), what opening a file asks of its table (`schemaDue`), and whether a write's pointers hold
 * (`pointersHold`). Pure.
 */
import type { CompactTo, KeyspaceWrite, PointersHold, SchemaDueOf, WatchStartOf } from '../../contracts/keyspace.contract.ts';

export type {
  Held,
  KeyWrite,
  PointerCheck,
  PointerDecision,
  PointerRefusal,
  RowWritten,
  SchemaDue,
  WatchRefusal,
  WatchStart,
  WriteDecision,
  WriteRefusal,
  WriteVerb,
} from '../../contracts/keyspace.contract.ts';

/**
 * A write of a key decided against the latest row it holds and the store's head.
 * @param held The latest row the keyspace holds of the key, its tombstone included, or null where it holds none.
 * @param write The write: its verb, the revision it names, and its record's size in bytes.
 * @param head The store's highest revision.
 * @param ceiling The largest record the store holds, in bytes.
 */
export const keyspaceWrite: KeyspaceWrite = (held, write, head, ceiling) => {
  if (write.verb !== 'delete' && write.size > ceiling) return { refused: 'too-large' };
  const live = held !== null && !held.deleted;
  if (write.verb === 'create') {
    if (live) return { refused: 'exists' };
  } else {
    if (!live) return { refused: 'missing' };
    if (write.expected !== null && write.expected !== held.modRevision) return { refused: 'stale' };
  }
  const revision = head + 1;
  return {
    written: {
      revision,
      createRevision: write.verb === 'create' || held === null ? revision : held.createRevision,
      prevRevision: held === null ? 0 : held.modRevision,
      created: write.verb === 'create',
      deleted: write.verb === 'delete',
    },
  };
};

/**
 * Where a watch from `from` starts.
 * @param from The revision the watch asks to start after.
 * @param compacted The revision the store has compacted up to.
 * @param head The store's highest revision.
 */
export const watchStart: WatchStartOf = (from, compacted, head) => {
  if (from < compacted) return { refused: 'gone' };
  if (from > head) return { refused: 'ahead' };
  return { replayAfter: from };
};

/**
 * The revision a compaction removes superseded rows up to.
 * @param head The store's highest revision.
 * @param compacted The revision the store has compacted up to already.
 * @param retain How many of the last revisions it keeps.
 */
export const compactTo: CompactTo = (head, compacted, retain) => Math.max(compacted, head - retain);

/**
 * The migrations opening a file applies, or its refusal where a newer release wrote it.
 * @param file The highest migration the file has recorded, 0 for a new file.
 * @param code The highest migration the code knows.
 */
export const schemaDue: SchemaDueOf = (file, code) => (file > code ? { refused: 'newer' } : { from: file, to: code });

/**
 * Whether a write's pointers hold: a delete holds where no live record of another key points to its key, and a create or an update
 * where every key its record points to is live.
 * @param check The write's verb, how many of its pointers name no live key, and how many live records of other keys point to its key.
 */
export const pointersHold: PointersHold = (check) => {
  if (check.verb === 'delete') return check.referrers === 0 ? { held: true } : { refused: 'referenced' };
  return check.dangling === 0 ? { held: true } : { refused: 'dangling' };
};
