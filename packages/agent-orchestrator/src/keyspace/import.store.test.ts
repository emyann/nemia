/**
 * What a kind's import does on disk (`kindKeyspace`, `import.store.ts`), on a toy kind over a scratch store: a file becomes its record and
 * is moved aside under `imported/`, a file at a held key is moved aside unwritten, a file over the ceiling stops the import whole naming
 * it, a file that does not read stays where it is, a file planted after the first open is imported by the next, and a read of a store
 * with nothing to import makes no file. Which act each file gets is `importAct`'s, proved by `contracts/kind-import.contract.ts`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { asideOf, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from './import.store.ts';
import { keyspaceFile, RECORD_CEILING } from './keyspace.store.ts';

/** A toy kind: each `toys/<name>.json` that reads as JSON, at `/registry/toys/<name>`. */
const TOYS: ImportKind = {
  name: 'toys',
  folders: (home) => [path.join(home, 'toys')],
  files: (home) =>
    namesIn(path.join(home, 'toys'), '.json').map((name) => {
      const file = path.join(home, 'toys', `${name}.json`);
      return {
        file,
        key: `/registry/toys/${name}`,
        aside: asideOf(home, file),
        read: (text: string) => {
          try {
            JSON.parse(text);
            return { value: text };
          } catch {
            return { unreadable: 'it is no JSON' };
          }
        },
      };
    }),
};

/** `text` planted as the toy `name`'s file in the store `root`. */
function planted(root: string, name: string, text: string) {
  const file = path.join(root, 'toys', `${name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** The value of `key` in the store `root`'s keyspace, opened with its toys imported. */
const valueAt = async (root: string, key: string) =>
  Effect.runPromise(Effect.flatMap(kindKeyspace(root, TOYS), (ks) => ks.get(key))).then((r) => r?.value);

test('a planted file becomes its record and is moved under imported/', async () => {
  const root = scratch('wf-import-');
  const file = planted(root, 'a', '{"a":1}');
  assert.equal(await valueAt(root, '/registry/toys/a'), '{"a":1}');
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(root, 'imported', 'toys', 'a.json'), 'utf8'), '{"a":1}');
});

test('a file at a key held already is moved aside unwritten, and the record held is kept', async () => {
  const root = scratch('wf-import-');
  planted(root, 'a', '{"a":1}');
  assert.equal(await valueAt(root, '/registry/toys/a'), '{"a":1}');
  const again = planted(root, 'a', '{"a":2}');
  assert.equal(await valueAt(root, '/registry/toys/a'), '{"a":1}');
  assert.equal(fs.existsSync(again), false);
  assert.equal(fs.readFileSync(path.join(root, 'imported', 'toys', 'a.json.2'), 'utf8'), '{"a":2}');
});

test('a file over the ceiling stops the import Invalid, and nothing is written or moved', async () => {
  const root = scratch('wf-import-');
  const small = planted(root, 'a', '{"a":1}');
  const big = planted(root, 'b', JSON.stringify({ b: 'x'.repeat(RECORD_CEILING) }));
  const exit = await Effect.runPromiseExit(kindKeyspace(root, TOYS));
  assert.ok(Exit.isFailure(exit));
  assert.equal(exit.cause.reasons.find(Cause.isFailReason)?.error._tag, 'Invalid');
  assert.ok(fs.existsSync(small) && fs.existsSync(big));
  fs.rmSync(big);
  assert.equal(await valueAt(root, '/registry/toys/a'), '{"a":1}');
});

test('a file that does not read as its kind is left where it is', async () => {
  const root = scratch('wf-import-');
  const file = planted(root, 'a', 'not json');
  assert.equal(await valueAt(root, '/registry/toys/a'), undefined);
  assert.equal(fs.readFileSync(file, 'utf8'), 'not json');
});

test('a file planted after the first open is imported by the next', async () => {
  const root = scratch('wf-import-');
  planted(root, 'a', '{"a":1}');
  assert.equal(await valueAt(root, '/registry/toys/a'), '{"a":1}');
  planted(root, 'b', '{"b":1}');
  assert.equal(await valueAt(root, '/registry/toys/b'), '{"b":1}');
});

test('a read of a store with no keyspace and nothing to import makes no file', async () => {
  const root = scratch('wf-import-');
  assert.equal(await Effect.runPromise(kindKeyspaceHeld(root, TOYS)), undefined);
  assert.equal(fs.existsSync(keyspaceFile(root)), false);
});

test("the keyspace's folder and file are its owner's alone", async () => {
  const root = scratch('wf-import-');
  planted(root, 'a', '{"a":1}');
  await valueAt(root, '/registry/toys/a');
  assert.equal(fs.statSync(path.dirname(keyspaceFile(root))).mode & 0o777, 0o700);
  assert.equal(fs.statSync(keyspaceFile(root)).mode & 0o777, 0o600);
});

test("a keyspace an older release made at the umask's modes is made its owner's alone when it is opened", async () => {
  const root = scratch('wf-import-');
  fs.mkdirSync(path.dirname(keyspaceFile(root)), { recursive: true, mode: 0o755 });
  fs.chmodSync(path.dirname(keyspaceFile(root)), 0o755);
  fs.writeFileSync(keyspaceFile(root), '', { mode: 0o644 });
  fs.chmodSync(keyspaceFile(root), 0o644);
  planted(root, 'a', '{"a":1}');
  await valueAt(root, '/registry/toys/a');
  assert.equal(fs.statSync(path.dirname(keyspaceFile(root))).mode & 0o777, 0o700);
  assert.equal(fs.statSync(keyspaceFile(root)).mode & 0o777, 0o600);
});
