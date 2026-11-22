/**
 * The keyspace: the orchestrator's store of records, one SQLite file (`<store>/db/state.db`), opened through Effect's SQL client
 * (`@effect/sql-sqlite-node`, over `node:sqlite`) and laid out as Kine lays it out: one table `kine`, every write a new row whose `id` is
 * the store's next revision, the row it follows named by `prev_revision`, a delete a tombstone row, superseded rows compacted away.
 * Each write is decided by `keyspaceWrite` (`keyspace.ts`, proved by `contracts/keyspace.contract.ts`) inside the transaction that read
 * the key and the head (`BEGIN IMMEDIATE`), so the check and the write are one step; a transaction of several writes decides each against
 * the head the one before it left, and is rolled back whole on the first refusal. The file is in write-ahead-log mode with
 * `synchronous=FULL`, so a write that was answered is on disk, and waits 30 s for another process's lock, as Kine does.
 *
 * The table changes over releases by Effect's Migrator, its migrations `KEYSPACE_MIGRATIONS`: a change of the table is a migration
 * appended there. The Migrator applies what a file lacks and skips a file a newer release wrote; the loader refuses that file
 * (`schemaDue`), inside the Migrator's own transaction, and the open is refused `Invalid`, naming `nemia upgrade`, the file untouched.
 *
 * One client per file per process (`keyspaceAt`), kept for the process's life; a failed open is not kept, so the next asks again, and
 * `:memory:` is a fresh database each time. A `SqlError` is a defect: the program dies of it, as `fromThrow` treats any throw that is
 * not a refusal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node';
import { Context, Data, Duration, Effect, Layer, Scope, Semaphore } from 'effect';
import { SqlClient, SqlError } from 'effect/sql';
import { Invalid } from '../refusal/refusal.ts';
import { compactTo, keyspaceWrite, schemaDue, watchStart, type Held, type WriteRefusal, type WriteVerb } from './keyspace.ts';

/** The largest record the keyspace holds, in bytes: 1.5 MiB, etcd's limit. */
export const RECORD_CEILING = 1_572_864;

/** Kine's name of the row that holds the revision the store has compacted up to, in its `prev_revision`. */
const COMPACT_KEY = 'compact_rev_key';

/** The keyspace's migrations, by `<id>_<name>`, each run once in id order by Effect's Migrator: a table change is one appended here. */
export const KEYSPACE_MIGRATIONS = {
  '0001_kine': Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE IF NOT EXISTS kine
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT,
	created INTEGER,
	deleted INTEGER,
	create_revision INTEGER,
	prev_revision INTEGER,
	lease INTEGER,
	value BLOB,
	old_value BLOB
)`;
    yield* sql`CREATE INDEX IF NOT EXISTS kine_name_index ON kine (name)`;
    yield* sql`CREATE INDEX IF NOT EXISTS kine_name_id_index ON kine (name,id)`;
    yield* sql`CREATE INDEX IF NOT EXISTS kine_id_deleted_index ON kine (id,deleted)`;
    yield* sql`CREATE INDEX IF NOT EXISTS kine_prev_revision_index ON kine (prev_revision)`;
    yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS kine_name_prev_revision_uindex ON kine (name, prev_revision)`;
    yield* sql`CREATE INDEX IF NOT EXISTS kine_id_compact_rev_key_with_prev_revision_index ON kine(id, name, prev_revision) WHERE name != 'compact_rev_key' AND prev_revision != 0`;
  }),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;

/** The highest migration the code knows: the id of the last of `KEYSPACE_MIGRATIONS`. */
export const KEYSPACE_SCHEMA = Math.max(...Object.keys(KEYSPACE_MIGRATIONS).map((key) => Number.parseInt(key, 10)));

/** A record as the keyspace holds it: its key, its value, its revision (`modRevision`) and its life's first (`createRevision`). */
export type KeyRecord = { readonly key: string; readonly value: string; readonly revision: number; readonly createRevision: number };

/** A change a watch replays: the record a row holds, and whether the row deletes its key. */
export type KeyChange = KeyRecord & { readonly deleted: boolean };

/** A write of one key: its verb, the revision the writer read it at (null where it names none), and the record's value. */
export type KeyWriteOf = { readonly verb: WriteVerb; readonly expected: number | null; readonly value: string };

/** A write the keyspace refused: why (`WriteRefusal`), the key, and the revision the key is at (null where it holds none live). */
export class KeyRefused extends Data.TaggedError('KeyRefused')<{
  readonly refusal: WriteRefusal;
  readonly key: string;
  readonly at: number | null;
}> {}

/** A watch's answer: the changes after the revision it asked from, or why it cannot start there. */
export type Since = { readonly changes: readonly KeyChange[]; readonly head: number } | { readonly refused: 'gone' | 'ahead' };

/** The reads and writes of one transaction (`Keyspace.within`): the store's own, opening no transaction of their own. */
export type KeyTxn = {
  readonly get: (key: string) => Effect.Effect<KeyRecord | undefined>;
  readonly list: (prefix: string) => Effect.Effect<readonly KeyRecord[]>;
  readonly write: (key: string, write: KeyWriteOf) => Effect.Effect<KeyRecord, KeyRefused>;
};

/** The keyspace of one file, each method an Effect; `settings` its connection's journal mode and synchronous level, as SQLite says. */
export type Keyspace = {
  readonly head: Effect.Effect<number>;
  readonly get: (key: string) => Effect.Effect<KeyRecord | undefined>;
  readonly list: (prefix: string) => Effect.Effect<{ readonly records: readonly KeyRecord[]; readonly revision: number }>;
  readonly keys: (prefix: string) => Effect.Effect<readonly string[]>;
  readonly revisions: (prefix: string) => Effect.Effect<ReadonlyMap<string, number>>;
  readonly write: (key: string, write: KeyWriteOf) => Effect.Effect<KeyRecord, KeyRefused>;
  readonly txn: (writes: readonly (readonly [key: string, write: KeyWriteOf])[]) => Effect.Effect<readonly KeyRecord[], KeyRefused>;
  readonly within: <A, E>(body: (tx: KeyTxn) => Effect.Effect<A, E>) => Effect.Effect<A, E | KeyRefused>;
  readonly since: (revision: number, prefix: string) => Effect.Effect<Since>;
  readonly compact: (retain: number) => Effect.Effect<number>;
  readonly settings: Effect.Effect<{ readonly journal: string; readonly synchronous: number }>;
};

/** A row of `kine` as a read selects it. */
type Row = {
  readonly id: number;
  readonly name: string;
  readonly deleted: number;
  readonly create_revision: number;
  readonly value: string | Uint8Array | null;
};

/** A row's value as text: the keyspace writes text, and a blob is read as UTF-8. */
const textOf = (value: Row['value']) => (value === null ? '' : typeof value === 'string' ? value : Buffer.from(value).toString('utf8'));

/** A row as the record it holds. */
const recordOf = (row: Row) =>
  ({ key: row.name, value: textOf(row.value), revision: row.id, createRevision: row.create_revision }) satisfies KeyRecord;

/** The first string after every string `prefix` begins: its last character moved one up, the upper end of a range of names. */
const pastPrefix = (prefix: string) => `${prefix.slice(0, -1)}${String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)}`;

/** The highest revision the store has given, deleted rows included: AUTOINCREMENT's sequence, 0 for a new file. */
const headNow = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ seq: number }>`SELECT seq FROM sqlite_sequence WHERE name = 'kine'`;
  return rows[0]?.seq ?? 0;
});

/** The revision the store has compacted up to: the `prev_revision` of Kine's compact row, 0 where none was written. */
const compactedNow = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ prev_revision: number }>`SELECT prev_revision FROM kine WHERE name = ${COMPACT_KEY}`;
  return rows[0]?.prev_revision ?? 0;
});

/** The latest row of `key`, its tombstone included, or undefined where the store holds none. */
const latestRow = (key: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Row>`SELECT id, name, deleted, create_revision, value FROM kine WHERE name = ${key} ORDER BY id DESC LIMIT 1`;
    return rows[0];
  });

/** One write decided against the key's latest row and the head, and appended as its row; refused `KeyRefused` as `keyspaceWrite` says. */
const writeOne = (key: string, write: KeyWriteOf) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* latestRow(key);
    const held: Held | null =
      row === undefined ? null : { createRevision: row.create_revision, modRevision: row.id, deleted: row.deleted !== 0 };
    const decided = keyspaceWrite(
      held,
      { verb: write.verb, expected: write.expected, size: write.verb === 'delete' ? 0 : Buffer.byteLength(write.value, 'utf8') },
      yield* headNow,
      RECORD_CEILING,
    );
    if ('refused' in decided)
      return yield* new KeyRefused({ refusal: decided.refused, key, at: held === null || held.deleted ? null : held.modRevision });
    const was = row === undefined ? '' : textOf(row.value);
    const value = write.verb === 'delete' ? was : write.value;
    const w = decided.written;
    yield* sql`INSERT INTO kine (id, name, created, deleted, create_revision, prev_revision, lease, value, old_value)
      VALUES (${w.revision}, ${key}, ${w.created ? 1 : 0}, ${w.deleted ? 1 : 0}, ${w.createRevision}, ${w.prevRevision}, 0, ${value}, ${was})`;
    return { key, value, revision: w.revision, createRevision: w.createRevision } satisfies KeyRecord;
  });

/**
 * Two records in their keys' order, as SQLite's binary collation orders the ASCII keys the keyspace holds. The list sorts here rather
 * than by `ORDER BY`, which copies every value into a temporary tree to sort them: 19 ms on a factory's 13 MB of proposals.
 */
const byKey = (a: KeyRecord, b: KeyRecord) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** The live keys that begin with `prefix`, by key, no value read: what a reader that asks only which keys there are pays. */
const keysUnder = (prefix: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly name: string }>`SELECT kv.name FROM kine AS kv
      JOIN (SELECT MAX(mkv.id) AS id FROM kine AS mkv WHERE mkv.name >= ${prefix} AND mkv.name < ${pastPrefix(prefix)} GROUP BY mkv.name) AS maxkv
      ON maxkv.id = kv.id
      WHERE kv.deleted = 0
      ORDER BY kv.name`;
    return rows.map((row) => row.name);
  });

/** The live keys that begin with `prefix`, each with its latest revision, no value read. */
const revisionsUnder = (prefix: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly name: string; readonly id: number }>`SELECT kv.name, kv.id FROM kine AS kv
      JOIN (SELECT MAX(mkv.id) AS id FROM kine AS mkv WHERE mkv.name >= ${prefix} AND mkv.name < ${pastPrefix(prefix)} GROUP BY mkv.name) AS maxkv
      ON maxkv.id = kv.id
      WHERE kv.deleted = 0`;
    return new Map(rows.map((row) => [row.name, row.id]));
  });

/** The live records whose key begins with `prefix`, by key, each its latest row that deletes nothing. */
const liveUnder = (prefix: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Row>`SELECT kv.id, kv.name, kv.deleted, kv.create_revision, kv.value FROM kine AS kv
      JOIN (SELECT MAX(mkv.id) AS id FROM kine AS mkv WHERE mkv.name >= ${prefix} AND mkv.name < ${pastPrefix(prefix)} GROUP BY mkv.name) AS maxkv
      ON maxkv.id = kv.id
      WHERE kv.deleted = 0`;
    return rows.map(recordOf).sort(byKey);
  });

/** Kine's compaction of the rows in `(from, to]`: each row they supersede and each tombstone among them deleted. */
const compactRange = (from: number, to: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM kine AS kv
WHERE kv.id IN (
	SELECT kp.prev_revision AS id
	FROM kine AS kp
	WHERE
		kp.name != 'compact_rev_key' AND
		kp.prev_revision != 0 AND
		kp.id > ${from} AND
		kp.id <= ${to}
	UNION ALL
	SELECT kd.id AS id
	FROM kine AS kd
	WHERE
		kd.deleted != 0 AND
		kd.id > ${from} AND
		kd.id <= ${to}
)`;
    const held = yield* sql`SELECT 1 FROM kine WHERE name = ${COMPACT_KEY}`;
    if (held.length === 0)
      yield* sql`INSERT INTO kine (id, name, created, deleted, create_revision, prev_revision, lease, value, old_value)
        VALUES (0, ${COMPACT_KEY}, 0, 0, 0, ${to}, 0, '', '')`;
    else yield* sql`UPDATE kine SET prev_revision = ${to} WHERE name = ${COMPACT_KEY}`;
  });

/**
 * The Migrator's loader: the code's migrations, once `schemaDue` lets the file be opened. Run inside the Migrator's transaction, it reads
 * the highest migration the file recorded and fails the Migrator's own `MigrationError` (`BadState`) where a newer release wrote it.
 */
const loader = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ id: number | null }>`SELECT MAX(migration_id) AS id FROM effect_sql_migrations`.pipe(Effect.orDie);
  const due = schemaDue(rows[0]?.id ?? 0, KEYSPACE_SCHEMA);
  if ('refused' in due)
    return yield* new SqliteMigrator.MigrationError({
      kind: 'BadState',
      message: `the keyspace was written by a newer release of nemia (its migration ${rows[0]?.id ?? 0}, where this one knows ${KEYSPACE_SCHEMA})`,
    });
  return yield* SqliteMigrator.fromRecord(KEYSPACE_MIGRATIONS);
});

/** The keyspace over a client already opened and migrated. */
function keyspaceOver(client: Context.Context<SqlClient.SqlClient>) {
  const inTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    Effect.provide(
      Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(effect)),
      client,
    );
  const read = <A>(effect: Effect.Effect<A, SqlError.SqlError, SqlClient.SqlClient>) => Effect.orDie(Effect.provide(effect, client));
  const refusing = <A>(effect: Effect.Effect<A, KeyRefused | SqlError.SqlError>) =>
    Effect.catchTag(effect, 'SqlError', (err) => Effect.die(err));
  return {
    head: read(headNow),
    get: (key) => read(Effect.map(latestRow(key), (row) => (row === undefined || row.deleted !== 0 ? undefined : recordOf(row)))),
    list: (prefix) => Effect.orDie(inTxn(Effect.all({ records: liveUnder(prefix), revision: headNow }))),
    keys: (prefix) => read(keysUnder(prefix)),
    revisions: (prefix) => read(revisionsUnder(prefix)),
    write: (key, write) => refusing(inTxn(writeOne(key, write))),
    txn: (writes) => refusing(inTxn(Effect.forEach(writes, ([key, write]) => writeOne(key, write)))),
    within: (body) =>
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.withTransaction(
          body({
            get: (key) =>
              Effect.orDie(Effect.map(latestRow(key), (row) => (row === undefined || row.deleted !== 0 ? undefined : recordOf(row)))).pipe(
                Effect.provide(client),
              ),
            list: (prefix) => Effect.orDie(Effect.provide(liveUnder(prefix), client)),
            write: (key, write) => refusing(Effect.provide(writeOne(key, write), client)),
          }),
        ),
      ).pipe(
        Effect.provide(client),
        Effect.catchTag('SqlError', (err) => Effect.die(err)),
      ),
    since: (revision, prefix) =>
      Effect.orDie(
        inTxn(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const head = yield* headNow;
            const start = watchStart(revision, yield* compactedNow, head);
            if ('refused' in start) return { refused: start.refused } satisfies Since;
            const rows = yield* sql<Row>`SELECT id, name, deleted, create_revision, value FROM kine
            WHERE id > ${start.replayAfter} AND name >= ${prefix} AND name < ${pastPrefix(prefix)} ORDER BY id`;
            return { changes: rows.map((row) => ({ ...recordOf(row), deleted: row.deleted !== 0 })), head } satisfies Since;
          }),
        ),
      ),
    compact: (retain) =>
      Effect.orDie(
        inTxn(
          Effect.gen(function* () {
            const head = yield* headNow;
            const compacted = yield* compactedNow;
            const to = compactTo(head, compacted, retain);
            if (to > compacted) yield* compactRange(compacted, to);
            return to;
          }),
        ),
      ),
    settings: read(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const [journal] = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`;
        const [synchronous] = yield* sql<{ synchronous: number }>`PRAGMA synchronous`;
        return { journal: journal?.journal_mode ?? '', synchronous: synchronous?.synchronous ?? -1 };
      }),
    ),
  } satisfies Keyspace;
}

/** Opens `file`, sets its pragmas and migrates it, into `scope`; refused `Invalid` where a newer release wrote it. */
const opened = (file: string, scope: Scope.Scope) =>
  Effect.gen(function* () {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    const client = yield* Layer.buildWithScope(SqliteClient.layer({ filename: file, busyTimeout: Duration.seconds(30) }), scope);
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA synchronous = FULL`;
      yield* SqliteMigrator.run({ loader });
    }).pipe(Effect.provide(client));
    return client;
  }).pipe(
    Effect.catchTag('MigrationError', (err) =>
      err.kind === 'BadState'
        ? Effect.fail(
            new Invalid({
              message: `${file}: ${err.message}. Nothing was read or written: upgrade this machine's nemia (nemia upgrade) and run it again.`,
            }),
          )
        : Effect.die(err),
    ),
    Effect.catchTag('SqlError', (err) => Effect.die(err)),
  );

/**
 * A keyspace of `file` with a client of its own, opened, set and migrated into `scope` and closed with it: what another process opening
 * the file is, beside the one `keyspaceAt` keeps. Refused `Invalid` where a newer release of nemia wrote the file.
 * @param file The SQLite file, created with its folder where none is, or `:memory:`.
 * @param scope The scope the client lives in.
 */
export const keyspaceIn = (file: string, scope: Scope.Scope) => Effect.map(opened(file, scope), keyspaceOver);

/** The scope every keyspace's client lives in: the process's, never closed. */
const PROCESS_SCOPE = Scope.makeUnsafe();

/** The keyspaces opened in this process, by file: one client each, kept once it opened. */
const OPENED = new Map<string, Keyspace>();

/** One open at a time, so two fibers asking for one file share its client. */
const OPENING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the SQLite file `file`, opened once per process and kept; `:memory:` opens a fresh database each time. Refused
 * `Invalid` where a newer release of nemia wrote the file, which is left as it is.
 * @param file The SQLite file, created with its folder where none is, or `:memory:`.
 */
export const keyspaceAt = (file: string) =>
  file === ':memory:'
    ? Effect.map(opened(file, PROCESS_SCOPE), keyspaceOver)
    : OPENING.withPermits(1)(
        Effect.suspend(() => {
          const kept = OPENED.get(file);
          if (kept !== undefined) return Effect.succeed(kept);
          return Effect.map(opened(file, PROCESS_SCOPE), (client) => {
            const keyspace = keyspaceOver(client);
            OPENED.set(file, keyspace);
            return keyspace;
          });
        }),
      );

/**
 * The keyspace's file in the store `home`.
 * @param home The store's root folder.
 */
export const keyspaceFile = (home: string) => path.join(home, 'db', 'state.db');
