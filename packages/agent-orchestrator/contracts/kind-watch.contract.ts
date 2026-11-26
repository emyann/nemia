/**
 * What a watch from a revision sends of one object (agent-orchestrator, src/list-watch/kind-watch.ts, `objectChange`): a kind's object
 * is composed of records of the keyspace — its own record (a card's `/registry/cards/<name>`, a run's `/registry/runs/<id>`, a
 * definition's index record) and those beside it that it reads (a run's markers, asks and observed status) — and the watch, asked to
 * start after revision `after`, is handed the rows written since (`Keyspace.since`), grouped by the object each key names
 * (`WATCHED_KINDS`). Of each object it is handed the latest row of its own record among them, or none where only records beside it moved,
 * and decides what the watcher, who holds the object as it stood at `after`, is sent: the object as it is now, ADDED or MODIFIED; DELETED,
 * the last state its tombstone row holds; or nothing, where the object was made and removed after `after`, so the watcher never held it.
 * Pure. The object's own `resourceVersion`, the highest revision of its records, and the order of the events (by that revision) are the
 * watch's, held by its tests.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The latest row of an object's own record among the rows written after the revision a watch starts from: its life's first revision
 * (`createRevision`), its own (`revision`), and whether it deletes the record (a tombstone, as Kine writes one).
 */
export type OwnRow = { readonly createRevision: number; readonly revision: number; readonly deleted: boolean };

/**
 * What a watch sends of an object whose records moved: Kubernetes' three events, or `unseen`, nothing, for an object made and removed
 * since the watcher's revision.
 */
export type ObjectChange = 'ADDED' | 'MODIFIED' | 'DELETED' | 'unseen';

/** Whether `n` is a whole number from 0 that a double holds exactly, as a revision is. */
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Whether the object's own record was made after `after`: the watcher, who holds the list as it stood at `after`, never held it. */
const bornAfter = (after: number, own: OwnRow | null) => own !== null && own.createRevision > after;

/** Whether the object's own record is gone: its latest row is a tombstone. */
const gone = (own: OwnRow | null) => own !== null && own.deleted;

const objectChangeSpec = spec<(after: number, own: OwnRow | null) => ObjectChange>({
  requires: ({ input: [after, own] }) =>
    whole(after) &&
    (own === null || (whole(own.createRevision) && whole(own.revision) && own.createRevision <= own.revision && own.revision > after)),
  ensures: {
    deletedExactlyWhenAHeldObjectIsGone: {
      description: 'An object the watcher held whose own record is now a tombstone is sent DELETED, and no other is',
      condition: ({ input: [after, own], output }) => (output === 'DELETED') === (gone(own) && !bornAfter(after, own)),
    },
    unseenExactlyWhenBornAndGoneSince: {
      description: 'An object made and removed since the watcher’s revision is sent nothing, and every other is sent an event',
      condition: ({ input: [after, own], output }) => (output === 'unseen') === (gone(own) && bornAfter(after, own)),
    },
    addedExactlyWhenBornSince: {
      description: 'An object made since the watcher’s revision and still there is sent ADDED, and no other is',
      condition: ({ input: [after, own], output }) => (output === 'ADDED') === (!gone(own) && bornAfter(after, own)),
    },
    modifiedWhenHeldAndStillThere: {
      description:
        'An object the watcher held that is still there is sent MODIFIED, whether its own record moved or only a record beside it',
      condition: ({ input: [after, own], output }) => gone(own) || bornAfter(after, own) || output === 'MODIFIED',
    },
  },
});

/** `objectChange`'s type, which `src/list-watch/kind-watch.ts` takes and the api's watch asks of each object a replay names. */
export type ObjectChangeOf = Implementation<typeof objectChangeSpec>;
