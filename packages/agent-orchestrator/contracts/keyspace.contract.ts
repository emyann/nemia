/**
 * The keyspace's decisions (agent-orchestrator, src/keyspace/keyspace.ts): what the store of records — one SQLite file at
 * `<store>/db/state.db`, opened through Effect's SQL client (`@effect/sql-sqlite-node`, over `node:sqlite`), one table laid out as Kine
 * lays it out (`kine`: `id`, `name`, `created`, `deleted`, `create_revision`, `prev_revision`, `lease`, `value`, `old_value`) — does with
 * a write, with a watch's start, with a compaction, and with a file as it is opened. Each is asked by `src/keyspace/keyspace.store.ts`
 * inside the SQLite transaction (`sql.withTransaction`, which begins `BEGIN IMMEDIATE`) that read what it is handed, so the check and
 * the write are one step.
 *
 * The six guarantees as etcd and Kubernetes state them, and which law holds each here:
 *
 * 1. A revision on every write: a row's `id` is its revision, one number that only grows, store-wide (`revisionIsNextOfStore`); a record's
 *    `resourceVersion` is the revision of its latest row, written as decimal digits and passed back unmodified.
 * 2. Change only if still at that revision: a write naming a revision its key no longer holds is refused `stale`, the door's `Conflict`,
 *    the api's 409 (`staleRevisionRefused`); a write naming none overwrites, as in Kubernetes (`writtenExactlyWhenNothingRefuses`). Beside
 *    the decision, Kine's unique index on `(name, prev_revision)` refuses a second hand that read the same row (`prevIsLatestRow`).
 * 3. Watch from a revision, within the history compaction keeps: `watchStart` and `compactTo`.
 * 4. A transaction across several records: each write of it decided in turn against the head the one before it left, in one SQLite
 *    transaction, rolled back whole on the first refusal. Its rows take consecutive revisions committed together, as Kine's rows do,
 *    where etcd assigns a transaction one revision: the owner's choice. Held by the store's tests, not by a law.
 * 5. Small records: a record over the ceiling is never written (`overCeilingNeverWritten`); what is larger is a file a record points to,
 *    a later card's.
 * 6. A write that was answered is on disk: the file in write-ahead-log mode with `synchronous=FULL`, held by the store's tests.
 *
 * The table changes over releases by Effect's Migrator (`SqliteMigrator.run`, its table `effect_sql_migrations`), which applies the
 * code's migrations the file has not recorded and, of a file a newer release wrote, applies none and carries on: `schemaDue` is what
 * refuses that file, asked by the Migrator's loader inside the Migrator's own transaction.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The latest row the keyspace holds of a key, its tombstone included: its life's first revision, its own, and whether it deletes the
 * key.
 */
export type Held = { readonly createRevision: number; readonly modRevision: number; readonly deleted: boolean };

/** What a write does to its key: makes it, changes it, or deletes it (a tombstone row, as Kine writes one). */
export type WriteVerb = 'create' | 'update' | 'delete';

/**
 * A write of one key: its verb, the revision the writer read the key at (`expected`, null where it names none: an update or a delete
 * that overwrites, and every create), and the size of the record's value in bytes (0 for a delete).
 */
export type KeyWrite = { readonly verb: WriteVerb; readonly expected: number | null; readonly size: number };

/**
 * Why a write is refused: its record is over the ceiling (`too-large`, the door's `Invalid`), its key is live already (`exists`, a
 * create: `Conflict`), its key is not live (`missing`, an update or a delete: `Missing`), or its key is no longer at the revision it
 * names (`stale`: `Conflict`, the api's 409).
 */
export type WriteRefusal = 'too-large' | 'exists' | 'missing' | 'stale';

/**
 * The row a write appends, as Kine's columns hold it: its revision (`id`), its key's life's first revision (`create_revision`), the
 * revision of the row it follows (`prev_revision`, 0 where the key never had one the store still holds), and whether it makes or
 * deletes the key (`created`, `deleted`).
 */
export type RowWritten = {
  readonly revision: number;
  readonly createRevision: number;
  readonly prevRevision: number;
  readonly created: boolean;
  readonly deleted: boolean;
};

/** A write's answer: the row it appends, or why it is refused. */
export type WriteDecision = { readonly written: RowWritten } | { readonly refused: WriteRefusal };

/** The largest whole number a double holds exactly, `Number.MAX_SAFE_INTEGER`, written out: the verifier reads no global's constant. */
const MAX_SAFE = 9_007_199_254_740_991;

/** Whether `n` is a whole number from 0 that a double holds exactly, as a revision, a size and a ceiling are. */
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Whether the key `held` names is live: it has a row, and that row deletes nothing. */
const live = (held: Held | null) => held !== null && !held.deleted;

/** Whether `write` carries a record over `ceiling`: a create or an update, whose value is larger. */
const overCeiling = (write: KeyWrite, ceiling: number) => write.verb !== 'delete' && write.size > ceiling;

/** Whether `write` names a revision other than the one the live key `held` is at. */
const namesOther = (held: Held | null, write: KeyWrite) => held !== null && write.expected !== null && write.expected !== held.modRevision;

/**
 * Whether `held` is a row the store can hold at `head`: whole revisions, its life's first at or before its own, its own at or before
 * the head.
 */
const heldAt = (held: Held | null, head: number) =>
  held === null ||
  (whole(held.createRevision) && whole(held.modRevision) && held.createRevision <= held.modRevision && held.modRevision <= head);

const keyspaceWriteSpec = spec<(held: Held | null, write: KeyWrite, head: number, ceiling: number) => WriteDecision>({
  requires: ({ input: [held, write, head, ceiling] }) =>
    whole(head) &&
    head < MAX_SAFE &&
    whole(ceiling) &&
    whole(write.size) &&
    heldAt(held, head) &&
    (write.expected === null || whole(write.expected)) &&
    (write.verb !== 'create' || write.expected === null),
  ensures: {
    overCeilingNeverWritten: {
      description: 'A create or an update whose record is over the ceiling is refused too-large, whatever the key holds',
      condition: ({ input: [, write, , ceiling], output }) =>
        !overCeiling(write, ceiling) || ('refused' in output && output.refused === 'too-large'),
    },
    createOnLiveKeyRefused: {
      description: 'A create of a key that is live, its record within the ceiling, is refused exists',
      condition: ({ input: [held, write, , ceiling], output }) =>
        write.verb !== 'create' || overCeiling(write, ceiling) || !live(held) || ('refused' in output && output.refused === 'exists'),
    },
    changeOfAbsentKeyRefused: {
      description: 'An update or a delete of a key that is not live, its record within the ceiling, is refused missing',
      condition: ({ input: [held, write, , ceiling], output }) =>
        write.verb === 'create' || overCeiling(write, ceiling) || live(held) || ('refused' in output && output.refused === 'missing'),
    },
    staleRevisionRefused: {
      description:
        'An update or a delete of a live key that names a revision other than the one the key is at, its record within the ceiling, is refused stale',
      condition: ({ input: [held, write, , ceiling], output }) =>
        write.verb === 'create' ||
        overCeiling(write, ceiling) ||
        !live(held) ||
        !namesOther(held, write) ||
        ('refused' in output && output.refused === 'stale'),
    },
    writtenExactlyWhenNothingRefuses: {
      description:
        'A write is written exactly when its record is within the ceiling, and it creates a key that is not live, or changes a live key naming no revision or the one it is at',
      condition: ({ input: [held, write, , ceiling], output }) =>
        'written' in output ===
        (!overCeiling(write, ceiling) && (write.verb === 'create' ? !live(held) : live(held) && !namesOther(held, write))),
    },
    revisionIsNextOfStore: {
      description: "A row written takes the store's next revision: one past the head, so a revision only grows, store-wide",
      condition: ({ input: [, , head], output }) => !('written' in output) || output.written.revision === head + 1,
    },
    createStartsItsLife: {
      description: "A create starts its key's life at its own revision; an update or a delete keeps the life's first revision the key held",
      condition: ({ input: [held, write], output }) =>
        !('written' in output) ||
        (write.verb === 'create'
          ? output.written.createRevision === output.written.revision
          : held !== null && output.written.createRevision === held.createRevision),
    },
    prevIsLatestRow: {
      description:
        "A row written follows the latest row of its key, its tombstone included, or none (0): Kine's unique index on the key and that revision refuses a second hand that read the same row",
      condition: ({ input: [held], output }) =>
        !('written' in output) || output.written.prevRevision === (held === null ? 0 : held.modRevision),
    },
    rowSaysItsVerb: {
      description: 'A row written makes its key exactly when it is a create, and deletes it exactly when it is a delete',
      condition: ({ input: [, write], output }) =>
        !('written' in output) ||
        (output.written.created === (write.verb === 'create') && output.written.deleted === (write.verb === 'delete')),
    },
  },
});

/** `keyspaceWrite`'s type, which `src/keyspace/keyspace.ts` takes and `src/keyspace/keyspace.store.ts` asks before each row it appends. */
export type KeyspaceWrite = Implementation<typeof keyspaceWriteSpec>;

/** Why a watch cannot start where it asks: its revision is compacted away (`gone`, the api's 410) or past the head (`ahead`). */
export type WatchRefusal = 'gone' | 'ahead';

/** A watch's start: the revision after which every row is replayed, or why it cannot start there. */
export type WatchStart = { readonly replayAfter: number } | { readonly refused: WatchRefusal };

const watchStartSpec = spec<(from: number, compacted: number, head: number) => WatchStart>({
  requires: ({ input: [from, compacted, head] }) => whole(from) && whole(compacted) && whole(head) && compacted <= head,
  ensures: {
    goneExactlyBelowCompacted: {
      description: 'A watch from a revision the store compacted away is refused gone, and no other is',
      condition: ({ input: [from, compacted], output }) => ('refused' in output && output.refused === 'gone') === from < compacted,
    },
    aheadExactlyPastHead: {
      description: 'A watch from a revision past the head is refused ahead, and no other is',
      condition: ({ input: [from, , head], output }) => ('refused' in output && output.refused === 'ahead') === from > head,
    },
    replaysEverythingAfter: {
      description: 'A watch that starts replays every row after the revision it asked from, none before it and none skipped',
      condition: ({ input: [from], output }) => !('replayAfter' in output) || output.replayAfter === from,
    },
  },
});

/** `watchStart`'s type, which `src/keyspace/keyspace.ts` takes and the store's `since` asks before it reads a row. */
export type WatchStartOf = Implementation<typeof watchStartSpec>;

const compactToSpec = spec<(head: number, compacted: number, retain: number) => number>({
  requires: ({ input: [head, compacted, retain] }) => whole(head) && whole(compacted) && whole(retain) && compacted <= head,
  ensures: {
    neverBack: {
      description: 'A compaction never moves the compacted revision back: a watch refused gone stays refused',
      condition: ({ input: [, compacted], output }) => output >= compacted,
    },
    keepsTheWindow: {
      description: 'A compaction keeps the last `retain` revisions, unless they were compacted already',
      condition: ({ input: [head, compacted, retain], output }) => output <= Math.max(compacted, head - retain),
    },
    dropsWhatIsOutside: {
      description: 'A compaction reaches every revision older than the last `retain`',
      condition: ({ input: [head, , retain], output }) => output >= head - retain,
    },
  },
});

/**
 * `compactTo`'s type, which `src/keyspace/keyspace.ts` takes: the revision a compaction removes superseded rows up to, as Kine's
 * `safeCompactRev` keeps `compactMinRetain` revisions.
 */
export type CompactTo = Implementation<typeof compactToSpec>;

/**
 * What opening the file asks of its table: the migrations of the code to apply, those whose id is after the highest the file has
 * recorded (`effect_sql_migrations`, 0 for a new file) up to the code's highest, which the Migrator then runs in its transaction; or a
 * refusal, where the file has recorded a migration the code does not know, written by a newer release (`newer`: the door's `Invalid`,
 * naming `nemia upgrade`), which the loader raises as the Migrator's `MigrationError` so the transaction leaves the file as it is.
 */
export type SchemaDue = { readonly from: number; readonly to: number } | { readonly refused: 'newer' };

const schemaDueSpec = spec<(file: number, code: number) => SchemaDue>({
  requires: ({ input: [file, code] }) => whole(file) && whole(code) && code >= 1,
  ensures: {
    newerFileRefused: {
      description: 'A file whose schema is newer than the code knows is refused, and no other is',
      condition: ({ input: [file, code], output }) => 'refused' in output === file > code,
    },
    appliesWhatTheFileLacks: {
      description: "Opening applies every migration after the file's highest, up to the code's, and none it holds already",
      condition: ({ input: [file, code], output }) => 'refused' in output || (output.from === file && output.to === code),
    },
  },
});

/** `schemaDue`'s type, which `src/keyspace/keyspace.ts` takes and the Migrator's loader in `src/keyspace/keyspace.store.ts` asks. */
export type SchemaDueOf = Implementation<typeof schemaDueSpec>;
