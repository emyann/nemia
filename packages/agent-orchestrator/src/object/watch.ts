/**
 * What a watch of a list says changed between two reads (`watchChanges`, proved by contracts/watch-changes.contract.ts): each object by
 * its key and its version, ADDED where it is new, MODIFIED where its version moved, DELETED where it is gone, nothing where it stands.
 * Which object a key names, the order of the events and the BOOKMARK between reads are the door's. Pure.
 */
import type { WatchChanges } from '../../contracts/watch-changes.contract.ts';

/** What a watch says of one object, as `objects` names them (`WATCH_EVENT_TYPES` but `BOOKMARK`). */
export type WatchChangeType = 'ADDED' | 'MODIFIED' | 'DELETED';

/** An object of a list, by its key, unique in the list, and its version (the object as served). */
export type Versioned = { readonly key: string; readonly version: string };

/** What a watch sends of one object: what happened to it, and its key. */
export type WatchChange = { readonly type: WatchChangeType; readonly key: string };

export type { WatchChanges };

/**
 * What changed between the objects sent a watcher (`sent`) and those the list holds now (`now`): each object of `now`, in its order,
 * ADDED where it was never sent and MODIFIED where it was sent at another version; then each of `sent` the list no longer holds,
 * DELETED. With nothing sent, every object is ADDED: a watch's first read. One candidate per object, none where it stands, so each key
 * is said at most once.
 */
export const watchChanges: WatchChanges = (sent, now) =>
  [
    ...now.map((n): WatchChange | null => {
      const was = sent.find((s) => s.key === n.key);
      return was === undefined ? { type: 'ADDED', key: n.key } : was.version === n.version ? null : { type: 'MODIFIED', key: n.key };
    }),
    ...sent.map((s): WatchChange | null => (now.some((n) => n.key === s.key) ? null : { type: 'DELETED', key: s.key })),
  ].filter((c) => c !== null);
