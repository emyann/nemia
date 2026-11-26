/**
 * The revision each object of a watched kind stands at, worked out with no write: the records of the keyspace it is made of, the
 * definition index's numbered by `definitionsNumbered`.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { definitionsNumbered } from '../definition-index/definition-index.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { DEFINITIONS_PREFIX, revisionTable, type WatchedKind } from './kind-watch.ts';
import { prefixesOf } from './kind-watch.store.ts';

/**
 * The revision each object of `kind` stands at, as of one read of its records, the revision a write of its spec waits on (`specOf`,
 * which leaves out the records its status reads), and the keyspace head the read was made at, or the highest revision a definition not
 * yet numbered is served at where that is past it, so no object of a list is past its position. The definitions' revisions are worked
 * out with no write (`definitionsNumbered`).
 * @param kind The kind served.
 */
export const kindRevisions = Effect.fn('kindRevisions')(function* (kind: WatchedKind) {
  const home = yield* StoreRoot;
  const keyspace = yield* keyspaceAt(keyspaceFile(home)).pipe(Effect.orDie);
  const held = new Map<string, ReadonlyMap<string, number>>();
  let head = yield* keyspace.head;
  for (const prefix of prefixesOf(kind)) {
    if (prefix !== DEFINITIONS_PREFIX) held.set(prefix, yield* keyspace.touched(prefix));
    else {
      const numbered = yield* definitionsNumbered();
      held.set(prefix, numbered.held);
      head = Math.max(head, numbered.head, ...numbered.held.values());
    }
  }
  return { of: revisionTable(kind, held), specOf: revisionTable(kind, held, true), head } as const;
});
