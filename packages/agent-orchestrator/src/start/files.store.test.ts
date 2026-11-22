/**
 * The File door's two layers held to its walks (`test/file-walks.ts`): the rooted door, each walk on the keyspace of a fresh scratch
 * store, and the memory stand-in, each on a keyspace in memory of its own with its bytes under a scratch root — what the one says, the
 * other says. And what only a store's root can be asked: the import of the File records of before the keyspace, each with the digest of
 * its bytes and moved aside once imported, one whose bytes are gone left where it is, and a second open importing nothing.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { doorFrom, settled, told, unwalked } from '../../test/door-walks.ts';
import { digestOf, FILE_WALKS, NOW, type FileSide } from '../../test/file-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, type Keyspace } from '../keyspace/keyspace.store.ts';
import { FileDoor, filesDir, filesImported, filesKeyspace, type FileDoorShape } from './files.store.ts';
import { fileDoorMemory } from './memory.store.ts';

/** The rooted door at `root`: each method given the store's root, as a program composed at it is. */
function rootedAt(root: string) {
  const door = Effect.runSync(FileDoor);
  const given = Object.fromEntries(
    Object.entries(door.files).map(([name, method]) => [
      name,
      (...args: never[]) => Effect.provideService((method as (...a: never[]) => Effect.Effect<unknown, unknown>)(...args), StoreRoot, root),
    ]),
  );
  return { files: given } as unknown as FileDoorShape;
}

/** A side on the rooted keyspace of a fresh store. */
function rootedSide() {
  const root = scratch('wf-file-door-');
  return {
    door: rootedAt(root),
    root,
    layer: 'keyspace',
    keyspace: () => Effect.runPromise(filesKeyspace(root)),
  } satisfies FileSide;
}

/** A side on the memory stand-in, its records in a keyspace in memory of its own. */
async function memorySide() {
  const root = scratch('wf-file-memory-');
  const keyspace: Keyspace = await Effect.runPromise(keyspaceAt(':memory:'));
  return {
    door: doorFrom(FileDoor, fileDoorMemory(root, keyspace)),
    root,
    layer: 'memory',
    keyspace: async () => keyspace,
  } satisfies FileSide;
}

for (const [layer, sideOf] of [
  ['keyspace', async () => rootedSide()],
  ['memory', memorySide],
] as const) {
  test(`${layer}: every method of the door has a walk`, async () => {
    assert.deepEqual(unwalked((await sideOf()).door, FILE_WALKS), []);
  });
  for (const [method, walks] of Object.entries(FILE_WALKS))
    for (const w of walks)
      test(`${layer}: ${method}: ${w.name}`, async () => {
        const side = await sideOf();
        assert.deepEqual(told(await w.walk(side), side.root), w.says);
      });
}

/** A File record of before the keyspace planted in `root`: its bytes, and its `<id>.json` without a digest, as those stores wrote it. */
function planted(root: string, namespace: string, n: number, bytes: Buffer | null = Buffer.from(`bytes ${n}`)) {
  const id = `file_${String(n).repeat(32)}`;
  const dir = filesDir(root, namespace);
  fs.mkdirSync(dir, { recursive: true });
  if (bytes !== null) fs.writeFileSync(path.join(dir, id), bytes);
  const record = path.join(dir, `${id}.json`);
  fs.writeFileSync(
    record,
    JSON.stringify({ id, name: `f${n}.txt`, mediaType: 'text/plain', size: bytes?.length ?? 0, createdAt: new Date(NOW).toISOString() }),
  );
  return { id, record, bytes };
}

test("a store's File records are imported on the first open, each with its bytes' digest, moved aside, and a second open makes none", async () => {
  const root = scratch('wf-file-import-');
  const a = planted(root, 'acme', 1);
  const b = planted(root, 'default', 2);
  const door = rootedAt(root);
  const read = await settled(door.files.read('acme', a.id));
  assert.equal(read?.file.digest, digestOf(a.bytes ?? Buffer.alloc(0)));
  assert.equal((await settled(door.files.read('default', b.id)))?.file.name, 'f2.txt');
  assert.equal(fs.existsSync(a.record), false);
  assert.equal(fs.existsSync(path.join(root, 'imported', 'files', 'acme', `${a.id}.json`)), true);
  assert.equal(fs.existsSync(path.join(root, 'imported', 'files', 'default', `${b.id}.json`)), true);
  planted(root, 'acme', 1);
  const keyspace = await Effect.runPromise(filesKeyspace(root));
  const head = await Effect.runPromise(keyspace.head);
  assert.equal(await Effect.runPromise(filesImported(root, keyspace)), 0, 'none made twice');
  assert.equal(await Effect.runPromise(keyspace.head), head, 'and no record written');
});

test('a File record whose bytes are gone, or that does not read, stays where it is, and the rest are imported', async () => {
  const root = scratch('wf-file-import-');
  const gone = planted(root, 'acme', 1, null);
  const bad = planted(root, 'acme', 2);
  fs.writeFileSync(bad.record, '{');
  const good = planted(root, 'acme', 3);
  const door = rootedAt(root);
  assert.ok(await settled(door.files.read('acme', good.id)));
  assert.equal(await settled(door.files.read('acme', gone.id)), undefined);
  assert.equal(fs.existsSync(gone.record), true);
  assert.equal(fs.existsSync(bad.record), true);
});

test('a store with no keyspace and no File record is read as holding no File, and the read makes no file', async () => {
  const root = scratch('wf-file-unmade-');
  const door = rootedAt(root);
  assert.equal(await settled(door.files.read('acme', `file_${'0'.repeat(32)}`)), undefined);
  assert.deepEqual(await settled(door.files.pruned(NOW)), []);
  assert.deepEqual(fs.readdirSync(root), []);
});
