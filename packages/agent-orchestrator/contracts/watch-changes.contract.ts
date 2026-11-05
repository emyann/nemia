/**
 * What a watch of a list says changed (agent-orchestrator, src/object/watch.ts, `watchChanges`; no code yet): between the objects it has
 * sent a watcher (`sent`) and those the list answers now (`now`), each object by its key (its namespace and its name) and its version (the
 * object as served, so a change of its status is a change though its `resourceVersion` stands). An object the list holds now and the
 * watcher was never sent is ADDED; one it was sent at another version is MODIFIED; one it was sent that the list no longer holds is
 * DELETED; one it holds at the version sent is not said. A watch's first read is this with nothing sent: every object ADDED, the
 * initial state Kubernetes calls synthetic "Added" events. Which object each key names, and the BOOKMARK between reads, are the door's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a watch says of one object, as `objects` will name them (`WATCH_EVENT_TYPES` but `BOOKMARK`). Declared here until it does. */
export type WatchChangeType = 'ADDED' | 'MODIFIED' | 'DELETED';

/** An object of a list, by its key, unique in the list, and its version. Declared here until `src/object/watch.ts` holds it. */
export type Versioned = { readonly key: string; readonly version: string };

/** What a watch sends of one object: what happened to it, and its key. */
export type WatchChange = { readonly type: WatchChangeType; readonly key: string };

/** Whether no key is in `objects` twice, as a list names each object once. */
const distinct = (objects: readonly Versioned[]): boolean =>
  objects.every((o, i) => !objects.slice(0, i).some((p) => p.key === o.key));

/** Whether `objects` holds the object of `key`. */
const holds = (objects: readonly Versioned[], key: string): boolean => objects.some((o) => o.key === key);

/** The version `objects` holds of `key`, undefined where it holds none. */
const versionIn = (objects: readonly Versioned[], key: string): string | undefined => objects.find((o) => o.key === key)?.version;

/** Whether the watch says `type` of `key`. */
const says = (changes: readonly WatchChange[], type: WatchChangeType, key: string): boolean =>
  changes.some((c) => c.type === type && c.key === key);

const watchChangesSpec = spec<(sent: readonly Versioned[], now: readonly Versioned[]) => WatchChange[]>({
  requires: ({ input: [sent, now] }) => distinct(sent) && distinct(now),
  ensures: {
    addedExactlyTheNew: {
      description: 'An object is ADDED exactly when the list holds it now and the watcher was never sent it',
      condition: ({ input: [sent, now], output }) =>
        now.every((n) => says(output, 'ADDED', n.key) === !holds(sent, n.key)) &&
        output.every((c) => c.type !== 'ADDED' || (holds(now, c.key) && !holds(sent, c.key))),
    },
    modifiedExactlyTheChanged: {
      description: 'An object is MODIFIED exactly when the list holds it now at another version than the one the watcher was sent',
      condition: ({ input: [sent, now], output }) =>
        now.every((n) => says(output, 'MODIFIED', n.key) === (holds(sent, n.key) && versionIn(sent, n.key) !== n.version)) &&
        output.every((c) => c.type !== 'MODIFIED' || holds(now, c.key)),
    },
    deletedExactlyTheGone: {
      description: 'An object is DELETED exactly when the watcher was sent it and the list no longer holds it',
      condition: ({ input: [sent, now], output }) =>
        sent.every((s) => says(output, 'DELETED', s.key) === !holds(now, s.key)) &&
        output.every((c) => c.type !== 'DELETED' || holds(sent, c.key)),
    },
    eachObjectOnce: {
      description: 'A watch says at most one thing of an object between two reads',
      condition: ({ output }) => output.every((c, i) => !output.slice(0, i).some((d) => d.key === c.key)),
    },
  },
});

/** `watchChanges`'s type, which `src/object/watch.ts` takes. */
export type WatchChanges = Implementation<typeof watchChangesSpec>;
