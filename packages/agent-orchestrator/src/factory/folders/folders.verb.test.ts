/**
 * The person's folder listing on a scratch disk, under a root given as `WF_FOLDER_ROOTS`: the folders under what was typed and never a
 * file, hidden ones only when asked, a missing folder answering none; refused for a relative path, a folder under no root, a link out of
 * the root, and the store; and the two writes it serves, a folder made a repository and a new one in the store, on the test place.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { storeConfigLayer } from '../../config/root.store.ts';
import type { Env } from '../../config/config.store.ts';
import { Invalid } from '../../refusal/refusal.ts';
import { PlaceService } from '../../place/place.store.ts';
import { testPlace } from '../../../place/memory/index.ts';
import { FOLDER_NAMES_MOST } from './folders.ts';
import { foldersNamed, repositoryMade, repositoryNew } from './folders.verb.ts';

/** A scratch root holding the folders `a-one`, `a-two`, `b`, `.hidden` and the file `a-file`, and a store of its own. */
function planted(storeInside = false) {
  const root = fs.realpathSync(scratch('wf-folders-root-'));
  for (const dir of ['a-one', 'a-two', 'b', '.hidden']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'a-file'), 'not a folder\n');
  const store = storeInside ? path.join(root, 'store') : scratch('wf-folders-store-');
  fs.mkdirSync(store, { recursive: true });
  const env: Env = { ...process.env, WF_ROOT: store, WF_FOLDER_ROOTS: root };
  const place = testPlace();
  const run = <A, E>(program: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(program));
  const given = <A, E, R>(program: Effect.Effect<A, E, R>) =>
    run(Effect.provide(program, Layer.merge(storeConfigLayer(env), PlaceService.layer(place.place))) as Effect.Effect<A, E>);
  return { root, store, given };
}

/** Whether `result` is a refusal `Invalid`. */
const invalid = (result: { _tag: string; failure?: unknown }) => result._tag === 'Failure' && result.failure instanceof Invalid;

describe('the folder listing names folders under its roots alone', () => {
  test('a typed folder ending in a slash names each folder in it, never a file, and no hidden one', async () => {
    const { root, given } = planted();
    const read = await given(foldersNamed(`${root}/`));
    assert.equal(read._tag, 'Success');
    if (read._tag === 'Success') assert.deepEqual([read.success.names, read.success.more], [['a-one', 'a-two', 'b'], false]);
  });
  test('a typed piece keeps the names that begin with it, and a dot asks for hidden ones', async () => {
    const { root, given } = planted();
    const typed = await given(foldersNamed(path.join(root, 'a')));
    const hidden = await given(foldersNamed(`${root}/.`));
    assert.deepEqual(
      [typed._tag === 'Success' && typed.success.names, hidden._tag === 'Success' && hidden.success.names],
      [['a-one', 'a-two'], ['.hidden']],
    );
  });
  test('a folder not there answers no names; a folder typed whole is said a folder, and in no repository', async () => {
    const { root, given } = planted();
    const missing = await given(foldersNamed(path.join(root, 'none', 'x')));
    const whole = await given(foldersNamed(path.join(root, 'b')));
    assert.deepEqual(missing._tag === 'Success' && missing.success.names, []);
    assert.deepEqual(whole._tag === 'Success' && [whole.success.folder, whole.success.repository], [true, false]);
  });
  test('REFUSED: a relative path, a folder under no root, a link out of the root, and the store inside a root', async () => {
    const { root, given } = planted();
    const elsewhere = fs.realpathSync(scratch('wf-folders-elsewhere-'));
    fs.mkdirSync(path.join(elsewhere, 'secret'));
    fs.symlinkSync(elsewhere, path.join(root, 'out'));
    const inside = planted(true);
    const results = [
      await given(foldersNamed('relative/path')),
      await given(foldersNamed(`${elsewhere}/`)),
      await given(foldersNamed(path.join(root, 'out', 's'))),
      await inside.given(foldersNamed(`${inside.store}/`)),
    ];
    assert.deepEqual(results.map(invalid), [true, true, true, true]);
  });
});

/** What the listing answers of the folder `root`, typed with a slash, the root its one root and a store of its own. */
async function listedIn(root: string) {
  const env: Env = { ...process.env, WF_ROOT: scratch('wf-folders-store-'), WF_FOLDER_ROOTS: root };
  const layer = Layer.merge(storeConfigLayer(env), PlaceService.layer(testPlace().place));
  const read = await Effect.runPromise(Effect.result(Effect.provide(foldersNamed(`${root}/`), layer)));
  assert.equal(read._tag, 'Success');
  return read._tag === 'Success' ? { names: read.success.names, more: read.success.more } : { names: [], more: false };
}

/** A scratch root holding the folders `f-000`, `f-001`, … up to `count` of them, made last first, and their names in order. */
function plantedMany(count: number) {
  const root = fs.realpathSync(scratch('wf-folders-many-'));
  const names = Array.from({ length: count }, (_, i) => `f-${String(i).padStart(3, '0')}`);
  for (const name of [...names].reverse()) fs.mkdirSync(path.join(root, name));
  return { names, listed: () => listedIn(root) };
}

describe("the listing's order, its bound and its more, as folderNamesShown's contract leaves them to these rows", () => {
  test('the names are answered in order of their code units, each once, whatever order the disk made them in', async () => {
    const root = fs.realpathSync(scratch('wf-folders-order-'));
    for (const dir of ['c', 'a', 'B', 'b', 'a-b', 'a.b']) fs.mkdirSync(path.join(root, dir));
    assert.deepEqual((await listedIn(root)).names, ['B', 'a', 'a-b', 'a.b', 'b', 'c']);
  });
  test('every folder is answered or more is said, and more is said only then: at the bound none is left out, past it one is', async () => {
    const atBound = plantedMany(FOLDER_NAMES_MOST);
    const past = plantedMany(FOLDER_NAMES_MOST + 1);
    const at = await atBound.listed();
    const over = await past.listed();
    assert.deepEqual([at.names, at.more], [atBound.names, false]);
    assert.deepEqual([over.names.includes(past.names.at(-1) ?? ''), over.more], [false, true]);
  });
  test('where some are left out, the bound is filled with the first ones', async () => {
    const many = plantedMany(FOLDER_NAMES_MOST + 3);
    const read = await many.listed();
    assert.deepEqual([read.names, read.more], [many.names.slice(0, FOLDER_NAMES_MOST), true]);
  });
});

describe('the listing makes a repository of a folder under its roots, and a new one in the store', () => {
  test('a plain folder is made a repository, and the listing then says so', async () => {
    const { root, given } = planted();
    const made = await given(repositoryMade(path.join(root, 'b')));
    const read = await given(foldersNamed(path.join(root, 'b')));
    assert.deepEqual(made._tag === 'Success' && made.success, { path: path.join(root, 'b'), made: true });
    assert.equal(read._tag === 'Success' && read.success.repository, true);
  });
  test('a new repository is made under the store, and a name that climbs out is refused', async () => {
    const { store, given } = planted();
    const made = await given(repositoryNew('acme'));
    const bad = await given(repositoryNew('../x'));
    assert.deepEqual(made._tag === 'Success' && made.success, { path: path.join(store, 'repositories', 'acme'), made: true });
    assert.ok(fs.statSync(path.join(store, 'repositories', 'acme')).isDirectory());
    assert.equal(invalid(bad), true);
  });
  test('REFUSED: a folder under no root is made no repository', async () => {
    const { given } = planted();
    const elsewhere = scratch('wf-folders-elsewhere-');
    assert.equal(invalid(await given(repositoryMade(elsewhere))), true);
    assert.equal(fs.existsSync(path.join(elsewhere, '.test-place')), false);
  });
});
