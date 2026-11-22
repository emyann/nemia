/**
 * What the keyspace's I/O holds that no law of its contract can (`contracts/keyspace.contract.ts` proves the decisions): a transaction
 * changes all of its records or none; a write that was answered is on disk (write-ahead log, `synchronous=FULL`, read again after its
 * client closed); two clients writing one key from one revision write it once; Kine's unique index refuses a second row after one
 * revision; a watch from a revision and a compaction answer rows, `gone` and `ahead`; a list answers live keys at its revision. And the
 * table's migrations: applied once, what a file lacks applied, a file a newer release wrote refused `Invalid` and left as it was.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Effect, Exit, Scope } from 'effect';
import { scratch } from 'test-kit/scratch';
import { KEYSPACE_MIGRATIONS, KEYSPACE_SCHEMA, keyspaceAt, keyspaceIn, type KeyWriteOf } from './keyspace.store.ts';

/** A fresh keyspace file of its own. */
const fileOf = () => path.join(scratch('wf-keyspace-'), 'db', 'state.db');

/** A write that makes its key. */
const create = (value: string) => ({ verb: 'create', expected: null, value }) satisfies KeyWriteOf;

/** A write that changes its key from `expected`, or overwrites where it is null. */
const update = (value: string, expected: number | null) => ({ verb: 'update', expected, value }) satisfies KeyWriteOf;

/** What an Effect answered, or the tag of what it failed with. */
async function answered<A>(effect: Effect.Effect<A, { readonly _tag: string; readonly refusal?: string }>) {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failed = exit.cause.reasons.find((r) => r._tag === 'Fail');
  if (failed?._tag === 'Fail') return { refused: failed.error.refusal ?? failed.error._tag };
  throw exit.cause;
}

/** The file `file` read raw, outside the keyspace: what `sql` answers. */
function raw(file: string, sql: string) {
  const db = new DatabaseSync(file);
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

describe('the keyspace on disk', () => {
  test('a transaction whose second write is stale writes neither, and the head stays where it was', async () => {
    const ks = await Effect.runPromise(keyspaceAt(fileOf()));
    const a = await Effect.runPromise(ks.write('/registry/t/a', create('1')));
    await Effect.runPromise(ks.write('/registry/t/a', update('2', a.revision)));
    const head = await Effect.runPromise(ks.head);
    const txn = await answered(
      ks.txn([
        ['/registry/t/b', create('b')],
        ['/registry/t/a', update('3', a.revision)],
      ]),
    );
    assert.deepEqual(txn, { refused: 'stale' });
    assert.equal(await Effect.runPromise(ks.head), head);
    assert.equal(await Effect.runPromise(ks.get('/registry/t/b')), undefined);
  });

  test("a transaction's records take consecutive revisions, committed together", async () => {
    const ks = await Effect.runPromise(keyspaceAt(fileOf()));
    const head = await Effect.runPromise(ks.head);
    const rows = await Effect.runPromise(
      ks.txn([
        ['/registry/t/a', create('a')],
        ['/registry/t/b', create('b')],
      ]),
    );
    assert.deepEqual(
      rows.map((r) => r.revision),
      [head + 1, head + 2],
    );
  });

  test('the file is in write-ahead-log mode and writes synchronously in full, and a write answered is read after its client closed', async () => {
    const file = fileOf();
    const scope = Scope.makeUnsafe();
    const ks = await Effect.runPromise(keyspaceIn(file, scope));
    assert.deepEqual(await Effect.runPromise(ks.settings), { journal: 'wal', synchronous: 2 });
    await Effect.runPromise(ks.write('/registry/t/a', create('kept')));
    await Effect.runPromise(Scope.close(scope, Exit.void));
    const again = Scope.makeUnsafe();
    const reopened = await Effect.runPromise(keyspaceIn(file, again));
    assert.equal((await Effect.runPromise(reopened.get('/registry/t/a')))?.value, 'kept');
    await Effect.runPromise(Scope.close(again, Exit.void));
  });

  test('two clients of one file writing a key from the same revision: the first is written, the second refused stale', async () => {
    const file = fileOf();
    const scope = Scope.makeUnsafe();
    const one = await Effect.runPromise(keyspaceIn(file, scope));
    const two = await Effect.runPromise(keyspaceIn(file, scope));
    const made = await Effect.runPromise(one.write('/registry/t/a', create('0')));
    const first = await answered(one.write('/registry/t/a', update('1', made.revision)));
    const second = await answered(two.write('/registry/t/a', update('2', made.revision)));
    assert.deepEqual([typeof first === 'object' && 'revision' in first, second], [true, { refused: 'stale' }]);
    assert.equal((await Effect.runPromise(two.get('/registry/t/a')))?.value, '1');
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test('fibers of one process writing a key from the same revision at once: one is written, the other refused stale', async () => {
    const ks = await Effect.runPromise(keyspaceAt(fileOf()));
    const made = await Effect.runPromise(ks.write('/registry/t/a', create('0')));
    const answers = await Promise.all([
      answered(ks.write('/registry/t/a', update('1', made.revision))),
      answered(ks.write('/registry/t/a', update('2', made.revision))),
    ]);
    assert.deepEqual(
      answers.filter((a) => 'refused' in a),
      [{ refused: 'stale' }],
    );
  });

  test("REFUSED by Kine's unique index: a second row following one revision of a key", async () => {
    const file = fileOf();
    const ks = await Effect.runPromise(keyspaceAt(file));
    const made = await Effect.runPromise(ks.write('/registry/t/a', create('0')));
    await Effect.runPromise(ks.write('/registry/t/a', update('1', made.revision)));
    assert.throws(
      () =>
        raw(
          file,
          `INSERT INTO kine (name, created, deleted, create_revision, prev_revision, lease, value, old_value) VALUES ('/registry/t/a', 0, 0, ${made.revision}, ${made.revision}, 0, '2', '1')`,
        ),
      /UNIQUE/,
    );
  });

  test('a list answers the live keys under its prefix, by key, no tombstone, at the revision it read, and its keys alone the same keys', async () => {
    const ks = await Effect.runPromise(keyspaceAt(fileOf()));
    await Effect.runPromise(ks.write('/registry/t/b', create('b')));
    await Effect.runPromise(ks.write('/registry/t/a', create('a')));
    await Effect.runPromise(ks.write('/registry/t/c', create('c')));
    await Effect.runPromise(ks.write('/registry/u/x', create('x')));
    await Effect.runPromise(ks.write('/registry/t/c', { verb: 'delete', expected: null, value: '' }));
    const { records, revision } = await Effect.runPromise(ks.list('/registry/t/'));
    assert.deepEqual(
      records.map((r) => [r.key, r.value]),
      [
        ['/registry/t/a', 'a'],
        ['/registry/t/b', 'b'],
      ],
    );
    assert.equal(revision, await Effect.runPromise(ks.head));
    assert.deepEqual(await Effect.runPromise(ks.keys('/registry/t/')), ['/registry/t/a', '/registry/t/b']);
  });

  test('a watch replays every change after its revision; past a compaction it is gone, past the head ahead', async () => {
    const ks = await Effect.runPromise(keyspaceAt(fileOf()));
    const a = await Effect.runPromise(ks.write('/registry/t/a', create('1')));
    const b = await Effect.runPromise(ks.write('/registry/t/a', update('2', a.revision)));
    await Effect.runPromise(ks.write('/registry/t/a', { verb: 'delete', expected: b.revision, value: '' }));
    const head = await Effect.runPromise(ks.head);
    const since = await Effect.runPromise(ks.since(a.revision, '/registry/t/'));
    assert.deepEqual('changes' in since ? since.changes.map((c) => [c.revision, c.deleted]) : since, [
      [b.revision, false],
      [head, true],
    ]);
    assert.deepEqual(await Effect.runPromise(ks.since(head + 1, '/registry/t/')), { refused: 'ahead' });
    assert.equal(await Effect.runPromise(ks.compact(1)), head - 1);
    assert.deepEqual(await Effect.runPromise(ks.since(0, '/registry/t/')), { refused: 'gone' });
    const kept = await Effect.runPromise(ks.since(head - 1, '/registry/t/'));
    assert.deepEqual('changes' in kept ? kept.changes.map((c) => c.revision) : kept, [head]);
  });
});

describe("the keyspace's table, migrated by Effect's Migrator", () => {
  test('a new file records every migration of the code, once, however many clients open it', async () => {
    const file = fileOf();
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(keyspaceIn(file, scope));
    await Effect.runPromise(keyspaceIn(file, scope));
    assert.deepEqual(
      raw(file, 'SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id').map((r) => r.migration_id),
      Object.keys(KEYSPACE_MIGRATIONS).map((key) => Number.parseInt(key, 10)),
    );
    assert.equal(KEYSPACE_SCHEMA, Object.keys(KEYSPACE_MIGRATIONS).length);
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test('a file that recorded none of them is given what it lacks', async () => {
    const file = fileOf();
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(keyspaceIn(file, scope));
    await Effect.runPromise(Scope.close(scope, Exit.void));
    raw(file, 'DELETE FROM effect_sql_migrations');
    raw(file, 'DROP TABLE kine');
    const again = Scope.makeUnsafe();
    const ks = await Effect.runPromise(keyspaceIn(file, again));
    await Effect.runPromise(ks.write('/registry/t/a', create('a')));
    assert.equal(raw(file, 'SELECT migration_id FROM effect_sql_migrations').length, KEYSPACE_SCHEMA);
    await Effect.runPromise(Scope.close(again, Exit.void));
  });

  test('REFUSED: a file a newer release wrote is Invalid, and its records and migrations are left as they were', async () => {
    const file = fileOf();
    const scope = Scope.makeUnsafe();
    const ks = await Effect.runPromise(keyspaceIn(file, scope));
    await Effect.runPromise(ks.write('/registry/t/a', create('a')));
    await Effect.runPromise(Scope.close(scope, Exit.void));
    raw(file, `INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${KEYSPACE_SCHEMA + 1}, 'newer')`);
    const rows = raw(file, 'SELECT id, name, value FROM kine ORDER BY id');
    const migrations = raw(file, 'SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id');
    const again = Scope.makeUnsafe();
    assert.deepEqual(await answered(keyspaceIn(file, again)), { refused: 'Invalid' });
    await Effect.runPromise(Scope.close(again, Exit.void));
    assert.deepEqual(raw(file, 'SELECT id, name, value FROM kine ORDER BY id'), rows);
    assert.deepEqual(raw(file, 'SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id'), migrations);
  });
});
