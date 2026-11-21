/**
 * The files a factory keeps for a start (`files.store.ts`): one begun, kept and found again by its id in its own namespace alone; one let
 * go of on its way; a namespace the store keeps none under and an id that is none found nothing; and every file let go of a day after it
 * was last written, by the next upload's pruning, a younger one kept.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { FILE_KEPT_FOR } from 'objects';
import { fileAt, fileBegun, fileDropped, fileKept, filePut, filesDir, filesPruned } from './files.store.ts';

const NOW = Date.parse('2026-11-16T00:00:00.000Z');

/** A file of `namespace` uploaded with `bytes` in the store `home`, kept whole. */
const uploaded = (home: string, namespace: string, bytes: Buffer, name = 'shot.png') => {
  const begun = fileBegun(home, namespace, NOW);
  assert.ok(begun, `a file is begun in ${namespace}`);
  begun.write(bytes.subarray(0, 2));
  begun.write(bytes.subarray(2));
  begun.close();
  return fileKept(home, namespace, {
    id: begun.id,
    name,
    mediaType: 'image/png',
    size: bytes.length,
    createdAt: new Date(NOW).toISOString(),
  });
};

test('a file kept is found by its id in its own namespace, its bytes as they were written, and in no other namespace', () => {
  const home = scratch('nemia-files-');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
  const file = uploaded(home, 'acme', bytes);
  assert.match(file.id, /^file_[0-9a-f]{32}$/);
  const found = fileAt(home, 'acme', file.id);
  assert.deepEqual(found?.file, file);
  assert.deepEqual(fs.readFileSync(found?.path ?? ''), bytes);
  assert.equal(fileAt(home, 'other', file.id), undefined);
  assert.equal(fileAt(home, 'default', file.id), undefined);
});

test('REFUSED: a kept file whose record does not read as a file is found nowhere', () => {
  const home = scratch('nemia-files-');
  const file = uploaded(home, 'acme', Buffer.from([0x89, 0x50]));
  fs.writeFileSync(path.join(filesDir(home, 'acme'), `${file.id}.json`), JSON.stringify({ id: 5 }));
  assert.equal(fileAt(home, 'acme', file.id), undefined);
});

test('two files begun in one namespace have two ids', () => {
  const home = scratch('nemia-files-');
  const a = uploaded(home, 'acme', Buffer.from('a'));
  const b = uploaded(home, 'acme', Buffer.from('b'));
  assert.notEqual(a.id, b.id);
});

test('REFUSED: a namespace the store keeps no files under, a name that climbs out, is begun nothing and finds nothing', () => {
  const home = scratch('nemia-files-');
  for (const namespace of ['..', '../x', 'A', '']) {
    assert.equal(fileBegun(home, namespace, NOW), undefined, namespace);
    assert.equal(fileAt(home, namespace, `file_${'0'.repeat(32)}`), undefined, namespace);
  }
  assert.equal(fs.existsSync(path.join(home, 'files')), false);
});

test('an id that is no file id finds nothing, a path among them', () => {
  const home = scratch('nemia-files-');
  const file = uploaded(home, 'acme', Buffer.from('x'));
  for (const id of [`${file.id}.json`, `../acme/${file.id}`, 'file_x', file.id.toUpperCase()])
    assert.equal(fileAt(home, 'acme', id), undefined, id);
});

test('a file let go of on its way leaves nothing, and its id finds nothing', () => {
  const home = scratch('nemia-files-');
  const begun = fileBegun(home, 'acme', NOW);
  assert.ok(begun);
  begun.write(Buffer.from('half'));
  begun.close();
  fileDropped(home, 'acme', begun.id);
  assert.deepEqual(fs.readdirSync(filesDir(home, 'acme')), []);
  assert.equal(fileAt(home, 'acme', begun.id), undefined);
});

test('a file last written a day ago is let go of by the next upload, a younger one kept', () => {
  const home = scratch('nemia-files-');
  const old = uploaded(home, 'acme', Buffer.from('old'));
  const young = uploaded(home, 'default', Buffer.from('young'));
  const dayAgo = new Date(NOW - FILE_KEPT_FOR);
  for (const name of [old.id, `${old.id}.json`]) fs.utimesSync(path.join(filesDir(home, 'acme'), name), dayAgo, dayAgo);
  const hourShort = new Date(NOW - FILE_KEPT_FOR + 60 * 60 * 1000);
  for (const name of [young.id, `${young.id}.json`]) fs.utimesSync(path.join(filesDir(home, 'default'), name), hourShort, hourShort);
  assert.deepEqual(filesPruned(home, NOW).sort(), [`acme/${old.id}`, `acme/${old.id}.json`].sort());
  assert.equal(fileAt(home, 'acme', old.id), undefined);
  assert.ok(fileAt(home, 'default', young.id));
  uploaded(home, 'acme', Buffer.from('new'));
  assert.ok(fileAt(home, 'default', young.id), 'an upload lets go of nothing younger than a day');
});

test('a File an inbox card names is kept past its day, a card that does not read included, and let go of once no card names it', () => {
  const home = scratch('nemia-files-');
  const named = uploaded(home, 'acme', Buffer.from('a'));
  const strayNamed = uploaded(home, 'acme', Buffer.from('b'));
  const old = new Date(NOW - 2 * FILE_KEPT_FOR);
  for (const f of [named, strayNamed])
    for (const name of [f.id, `${f.id}.json`]) fs.utimesSync(path.join(filesDir(home, 'acme'), name), old, old);
  fs.mkdirSync(path.join(home, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(home, 'inbox', 'look.md'), `---\nfactory: acme\nfiles: { shot.png: ${named.id} }\n---\nLook.\n`);
  fs.writeFileSync(path.join(home, 'inbox', 'broken.md'), `---\nnot a key: ${strayNamed.id}\n---\n`);
  assert.deepEqual(filesPruned(home, NOW), []);
  assert.ok(fileAt(home, 'acme', named.id));
  assert.ok(fileAt(home, 'acme', strayNamed.id));
  fs.rmSync(path.join(home, 'inbox', 'look.md'));
  assert.deepEqual(filesPruned(home, NOW).sort(), [`acme/${named.id}`, `acme/${named.id}.json`].sort());
  assert.ok(fileAt(home, 'acme', strayNamed.id), 'the card that does not read still keeps its File');
});

test('a file put at a fresh id is kept there, and an id taken or malformed is refused by its kind', () => {
  const home = scratch('nemia-files-');
  const id = `file_${'c'.repeat(32)}`;
  const begun = filePut(home, 'acme', id, NOW);
  assert.ok(!('refused' in begun));
  begun.write(Buffer.from('bytes'));
  begun.close();
  fileKept(home, 'acme', { id, name: 'a.txt', mediaType: 'text/plain', size: 5, createdAt: new Date(NOW).toISOString() });
  assert.equal(fs.readFileSync(fileAt(home, 'acme', id)?.path ?? '', 'utf8'), 'bytes');
  assert.deepEqual(filePut(home, 'acme', id, NOW), { refused: 'taken' });
  assert.deepEqual(filePut(home, 'acme', 'file_nope', NOW), { refused: 'id' });
  assert.deepEqual(filePut(home, '..', id, NOW), { refused: 'namespace' });
});
