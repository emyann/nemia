/**
 * What a watch of a list says changed (agent-orchestrator, src/object/watch.ts, `watchChanges`): between the objects it has
 * sent a watcher (`sent`) and those the list answers now (`now`), each object by its key (its namespace and its name) and its version (the
 * object as served, so a change of its status is a change though its `resourceVersion` stands). An object the list holds now and the
 * watcher was never sent is ADDED; one it was sent at another version is MODIFIED; one it was sent that the list no longer holds is
 * DELETED; one it holds at the version sent is not said. A watch's first read is this with nothing sent: every object ADDED, the
 * initial state Kubernetes calls synthetic "Added" events. Which object each key names, and the BOOKMARK between reads, are the door's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Versioned, WatchChange, WatchChangeType } from '../src/object/watch.ts';

/** Whether no key is in `objects` twice, as a list names each object once. */
const distinct = (objects: readonly Versioned[]): boolean => objects.every((o, i) => !objects.slice(0, i).some((p) => p.key === o.key));

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
    addedTheNew: {
      description: 'An object the list holds now that the watcher was never sent is ADDED',
      condition: ({ input: [sent, now], output }) => now.every((n) => holds(sent, n.key) || says(output, 'ADDED', n.key)),
    },
    addedOnlyTheNew: {
      description: 'An object ADDED is one the list holds now and the watcher was never sent',
      condition: ({ input: [sent, now], output }) => output.every((c) => c.type !== 'ADDED' || (holds(now, c.key) && !holds(sent, c.key))),
    },
    modifiedTheChanged: {
      description: 'An object the list holds now that the watcher was sent at another version is MODIFIED',
      condition: ({ input: [sent, now], output }) =>
        now.every((n) => !holds(sent, n.key) || versionIn(sent, n.key) === n.version || says(output, 'MODIFIED', n.key)),
    },
    modifiedOnlyTheChanged: {
      description: 'An object MODIFIED is one the list holds now at another version than the one the watcher was sent',
      condition: ({ input: [sent, now], output }) =>
        output.every(
          (c) => c.type !== 'MODIFIED' || (holds(now, c.key) && holds(sent, c.key) && versionIn(sent, c.key) !== versionIn(now, c.key)),
        ),
    },
    deletedTheGone: {
      description: 'An object the watcher was sent that the list no longer holds is DELETED',
      condition: ({ input: [sent, now], output }) => sent.every((s) => holds(now, s.key) || says(output, 'DELETED', s.key)),
    },
    deletedOnlyTheGone: {
      description: 'An object DELETED is one the watcher was sent and the list no longer holds',
      condition: ({ input: [sent, now], output }) =>
        output.every((c) => c.type !== 'DELETED' || (holds(sent, c.key) && !holds(now, c.key))),
    },
    eachObjectOnce: {
      description: 'A watch says at most one thing of an object between two reads',
      condition: ({ output }) => output.every((c, i) => !output.slice(0, i).some((d) => d.key === c.key)),
    },
  },
});

/** `watchChanges`'s type, which `src/object/watch.ts` takes. */
export type WatchChanges = Implementation<typeof watchChangesSpec>;
