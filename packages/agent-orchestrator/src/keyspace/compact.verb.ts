/**
 * The keyspace's compaction, for as long as the daemon runs: every `KEYSPACE_COMPACT_EVERY`, the superseded rows and tombstones older
 * than the last `KEYSPACE_RETAIN` revisions removed (`compact`, as Kine compacts), so a watch can start within that window and is refused
 * `gone` before it. The target is read from the table on each sweep (`compactTo`), so a restart carries nothing.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { sweepLoop } from '../forget/prune/free.verb.ts';
import { keyspaceAt, keyspaceFile } from './keyspace.store.ts';

/** How often the daemon compacts the keyspace: every 5 minutes, as etcd's history is kept by Kubernetes. */
const KEYSPACE_COMPACT_EVERY = '5 minutes';

/** How many of the last revisions a compaction keeps: the window a watch can start from. */
const KEYSPACE_RETAIN = 1000;

/**
 * One compaction of the keyspace of the store `home`: the revision it compacted up to.
 * @param home The store's root folder.
 */
const compactOnce = (home: string) => Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) => keyspace.compact(KEYSPACE_RETAIN));

/** The compaction of the keyspace of the store `StoreRoot` names, for as long as the daemon runs (`sweepLoop`). */
export const compaction = () =>
  Effect.flatMap(StoreRoot, (home) =>
    sweepLoop(() => compactOnce(home), KEYSPACE_COMPACT_EVERY, 'The keyspace could not be compacted this sweep'),
  );
