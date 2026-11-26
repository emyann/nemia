/**
 * The keyspace's compaction, for as long as the daemon runs: every `KEYSPACE_COMPACT_EVERY`, the superseded rows and tombstones up to
 * the head the sweep of at least `KEYSPACE_WINDOW` ago saw removed (`compact`, as Kine compacts), so a watch can start from any revision
 * of the last 5 minutes at least and is refused `gone` before it. The sweeps' heads and times are rows of the file (`kine_sweeps`), so a
 * restart carries nothing.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { sweepLoop } from '../forget/prune/free.verb.ts';
import { keyspaceAt, keyspaceFile } from './keyspace.store.ts';

/** How often the daemon compacts the keyspace: every 5 minutes, as etcd's history is kept by Kubernetes. */
const KEYSPACE_COMPACT_EVERY = '5 minutes';

/** How long a revision is kept at least: the window a watch can start from, in milliseconds. */
const KEYSPACE_WINDOW = 5 * 60_000;

/**
 * One compaction of the keyspace of the store `home`: the revision it compacted up to.
 * @param home The store's root folder.
 */
const compactOnce = (home: string) => Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) => keyspace.compact(KEYSPACE_WINDOW, Date.now()));

/** The compaction of the keyspace of the store `StoreRoot` names, for as long as the daemon runs (`sweepLoop`). */
export const compaction = () =>
  Effect.flatMap(StoreRoot, (home) =>
    sweepLoop(() => compactOnce(home), KEYSPACE_COMPACT_EVERY, 'The keyspace could not be compacted this sweep'),
  );
