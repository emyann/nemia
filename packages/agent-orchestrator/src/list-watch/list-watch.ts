/**
 * What a watch of a list says changed between two reads (`watchChanges`, proved by contracts/watch-changes.contract.ts): each object by
 * its key and its version, ADDED where it is new, MODIFIED where its version moved, DELETED where it is gone, nothing where it stands.
 * Which object a key names, the order of the events and the BOOKMARK between reads are the door's. Pure.
 */
import type { WatchChanges } from '../../contracts/watch-changes.contract.ts';
import type { WatchChange } from '../../contracts/watch-changes.contract.ts';

export type { WatchChangeType } from '../../contracts/watch-changes.contract.ts';

export type { Versioned, WatchChange } from '../../contracts/watch-changes.contract.ts';

export type { WatchChanges };

/**
 * What changed between the objects sent a watcher (`sent`) and those the list holds now (`now`): each object of `now` it was never sent,
 * ADDED; each it was sent at another version, MODIFIED; then each of `sent` the list no longer holds, DELETED. With nothing sent, every
 * object is ADDED: a watch's first read. The three are apart, so each key is said at most once.
 */
export const watchChanges: WatchChanges = (sent, now) =>
  [
    ...now.map((n): WatchChange | null =>
      !sent.some((s) => s.key === n.key)
        ? { type: 'ADDED', key: n.key }
        : sent.find((s) => s.key === n.key)?.version === n.version
          ? null
          : { type: 'MODIFIED', key: n.key },
    ),
    ...sent.map((s): WatchChange | null => (now.some((n) => n.key === s.key) ? null : { type: 'DELETED', key: s.key })),
  ].filter((c) => c !== null);
