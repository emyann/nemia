/**
 * A kind's watch from a revision, read off the keyspace (`Keyspace.since`) of the store `StoreRoot` names: the changes written after a
 * revision to the objects of a kind (`kindReplay`); the revision each of its objects stands at is `kindRevisions`, beside it, from the
 * records `WATCHED_KINDS` says the kind is made of. A GET writes nothing here; nothing is kept between two reads.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { changesOf, WATCHED_KINDS, type KindChange, type RowSeen, type WatchedKind } from './kind-watch.ts';

/** What a replay answers: why a watch cannot start there, or the changes after it and the head it holds to. */
type KindReplay = { readonly refused: 'gone' | 'ahead' } | { readonly changes: readonly KindChange[]; readonly head: number };

/** The prefixes of the keyspace a kind is made of, each once. */
export const prefixesOf = (kind: WatchedKind) => [...new Set(WATCHED_KINDS[kind].map((s) => s.prefix))];

/**
 * The changes after revision `after` to the objects of `kind`: each object, or each of a namespace, whose records moved, as it is sent
 * (`changesOf`), with the keyspace head the replay holds to; or why a watch cannot start there — `gone`, a revision compaction removed
 * (410), `ahead`, one past the head (400).
 * @param kind The kind watched.
 * @param after The revision the watch starts after.
 */
export const kindReplay = Effect.fn('kindReplay')(function* (kind: WatchedKind, after: number) {
  const home = yield* StoreRoot;
  const keyspace = yield* keyspaceAt(keyspaceFile(home)).pipe(Effect.orDie);
  const rows: (RowSeen & { readonly prefix: string })[] = [];
  const before = new Map<string, string>();
  let head = Number.POSITIVE_INFINITY;
  for (const prefix of prefixesOf(kind)) {
    const since = yield* keyspace.since(after, prefix);
    if (!('changes' in since)) {
      const refused: KindReplay = { refused: since.refused };
      return refused;
    }
    head = Math.min(head, since.head);
    if (since.changes.length > 0) for (const [key, value] of yield* keyspace.before(after, prefix)) before.set(key, value);
    for (const c of since.changes)
      rows.push({ prefix, key: c.key, revision: c.revision, createRevision: c.createRevision, deleted: c.deleted });
  }
  rows.sort((a, b) => a.revision - b.revision);
  const changes: readonly KindChange[] = changesOf(kind, after, rows, before);
  const replayed: KindReplay = { changes, head };
  return replayed;
});

/** The keyspace's head of the store `StoreRoot` names: the position a list read after it stands at least at. */
export const keyspaceHead = Effect.fn('keyspaceHead')(function* () {
  const home = yield* StoreRoot;
  const keyspace = yield* keyspaceAt(keyspaceFile(home));
  return yield* keyspace.head;
});
