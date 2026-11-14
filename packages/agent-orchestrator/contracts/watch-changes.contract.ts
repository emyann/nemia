/**
 * What a watch of a list says changed (agent-orchestrator, src/list-watch/list-watch.ts, `watchChanges`): between the objects it has
 * sent a watcher (`sent`) and those the list answers now (`now`), each object by its key (its namespace and its name) and its version (the
 * object as served, so a change of its status is a change though its `resourceVersion` stands). An object the list holds now and the
 * watcher was never sent is ADDED; one it was sent at another version is MODIFIED; one it was sent that the list no longer holds is
 * DELETED; one it holds at the version sent is not said. A watch's first read is this with nothing sent: every object ADDED, the
 * initial state Kubernetes calls synthetic "Added" events. Which object each key names, and the BOOKMARK between reads, are the door's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { WatchEventType } from 'objects';

/** What a watch says of one object, as `objects` names them (`WATCH_EVENT_TYPES` but `BOOKMARK`). */
export type WatchChangeType = Exclude<WatchEventType, 'BOOKMARK'>;

/**
 * An object of a list, by its key, unique in the list, and its version: the object as its list's route compares it, its JSON as served
 * unless the route leaves out parts measured to the read (a run's, `runWatchVersion`).
 */
export type Versioned = { readonly key: string; readonly version: string };

/** What a watch sends of one object: what happened to it, and its key. */
export type WatchChange = { readonly type: WatchChangeType; readonly key: string };

/** Whether no key is in `objects` twice, as a list names each object once. */
const distinct = (objects: readonly Versioned[]): boolean => objects.every((o, i) => !objects.slice(0, i).some((p) => p.key === o.key));

/** Whether `objects` holds the object of `key`. */
const holds = (objects: readonly Versioned[], key: string): boolean => objects.some((o) => o.key === key);

/** The version `objects` holds of `key`, undefined where it holds none. */
const versionIn = (objects: readonly Versioned[], key: string): string | undefined => objects.find((o) => o.key === key)?.version;

const watchChangesSpec = spec<(sent: readonly Versioned[], now: readonly Versioned[]) => WatchChange[]>({
  requires: ({ input: [sent, now] }) => distinct(sent) && distinct(now),
  /**
   * Narrowed to what tsverify proves today: each change said is the right one (the three `…OnlyThe…` laws). The other halves — every
   * object new now is ADDED, every one sent at another version MODIFIED, every one gone DELETED — and that no object is said twice run out
   * of the solver's work through the `filter` of the result (the last on some runs and not others), and are held whole by
   * `src/list-watch/list-watch.test.ts` until tsverify card `src-a-filter-s-result-is-pro-p25m` (a filter's result proved to keep every
   * element that passes) restores them here; tsverify 0.9.0 still leaves each `bounded`.
   */
  ensures: {
    addedOnlyTheNew: {
      description: 'An object ADDED is one the list holds now and the watcher was never sent',
      condition: ({ input: [sent, now], output }) => output.every((c) => c.type !== 'ADDED' || (holds(now, c.key) && !holds(sent, c.key))),
    },
    modifiedOnlyTheChanged: {
      description: 'An object MODIFIED is one the list holds now at another version than the one the watcher was sent',
      condition: ({ input: [sent, now], output }) =>
        output.every(
          (c) => c.type !== 'MODIFIED' || (holds(now, c.key) && holds(sent, c.key) && versionIn(sent, c.key) !== versionIn(now, c.key)),
        ),
    },
    deletedOnlyTheGone: {
      description: 'An object DELETED is one the watcher was sent and the list no longer holds',
      condition: ({ input: [sent, now], output }) =>
        output.every((c) => c.type !== 'DELETED' || (holds(sent, c.key) && !holds(now, c.key))),
    },
  },
});

/** `watchChanges`'s type, which `src/list-watch/list-watch.ts` takes. */
export type WatchChanges = Implementation<typeof watchChangesSpec>;
