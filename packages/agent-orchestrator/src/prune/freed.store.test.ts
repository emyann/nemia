/**
 * What a removal frees (`freedBytes`): a file with a name outside the folders counts nothing, one with every name inside counts once, a
 * link is never followed, and a folder that is gone is zero. Every expected number is read off the fixture's own files with `lstat`. And
 * that a walk longer than a burst (`WALK_BURST`) lets the process's other work run. And of the walk itself (`walk`): a name that does
 * not read is counted unread, its cost is the names it read and the bursts it yielded, and told a `Sort`, its bytes by kind add up to
 * the folder's, each file once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { freedBytes, walk, WALK_BURST, WHOLE, type Sort } from './freed.store.ts';

const ROOT = scratch('wf-freed-');

/** The bytes `lstat` says a path holds on disk. */
const held = (at: string): number => fs.lstatSync(at).blocks * 512;

/** A file of `kb` kilobytes at `at`. */
const file = (at: string, kb = 8): string => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, Buffer.alloc(kb * 1024, 1));
  return at;
};

const freed = (...dirs: string[]) => Effect.runPromise(freedBytes(dirs));

test('a folder frees its own files and folders, and nothing of a file whose other name is outside it', async () => {
  const dir = path.join(ROOT, 'own');
  const own = file(path.join(dir, 'sub', 'own.bin'));
  const outside = file(path.join(ROOT, 'main', 'shared.bin'), 64);
  fs.linkSync(outside, path.join(dir, 'sub', 'shared.bin'));
  assert.ok(held(outside) > 0, 'the fixture holds blocks');
  assert.deepEqual(await freed(dir), [held(dir) + held(path.join(dir, 'sub')) + held(own)]);
});

test('a file with both its names inside the folder is counted once', async () => {
  const dir = path.join(ROOT, 'twice');
  const one = file(path.join(dir, 'one.bin'), 32);
  fs.linkSync(one, path.join(dir, 'two.bin'));
  assert.deepEqual(await freed(dir), [held(dir) + held(one)]);
});

test('a link is counted as a link and never followed', async () => {
  const dir = path.join(ROOT, 'linked');
  const target = path.join(ROOT, 'target');
  file(path.join(target, 'big.bin'), 128);
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(target, path.join(dir, 'link'));
  assert.deepEqual(await freed(dir), [held(dir) + held(path.join(dir, 'link'))]);
});

test('a file shared by two folders asked together, with no name outside, is counted once and for one of them', async () => {
  const a = path.join(ROOT, 'pair-a');
  const b = path.join(ROOT, 'pair-b');
  const shared = file(path.join(a, 'shared.bin'), 64);
  fs.mkdirSync(b, { recursive: true });
  fs.linkSync(shared, path.join(b, 'shared.bin'));
  const both = await freed(a, b);
  assert.equal(both[0] + both[1], held(a) + held(b) + held(shared), 'once in the sum');
  assert.ok(both[0] === held(a) || both[1] === held(b), `and for one folder alone: ${JSON.stringify(both)}`);
  assert.deepEqual(await freed(a), [held(a)], 'asked alone, the other folder still holds it');
});

test('a folder that is gone frees nothing, beside one that is there', async () => {
  const dir = path.join(ROOT, 'there');
  const own = file(path.join(dir, 'own.bin'));
  assert.deepEqual(await freed(path.join(ROOT, 'gone'), dir), [0, held(dir) + held(own)]);
});

test('a walk of more names than WALK_BURST lets a fiber started after it run before it ends', async () => {
  const dir = path.join(ROOT, 'many');
  fs.mkdirSync(dir, { recursive: true });
  for (let k = 0; k <= WALK_BURST; k++) fs.writeFileSync(path.join(dir, `f${k}`), '');
  const ended: string[] = [];
  await Effect.runPromise(
    Effect.gen(function* () {
      const walk = yield* Effect.forkChild(freedBytes([dir]).pipe(Effect.tap(() => Effect.sync(() => ended.push('walk')))));
      const other = yield* Effect.forkChild(Effect.sync(() => ended.push('other')));
      yield* Fiber.join(walk);
      yield* Fiber.join(other);
    }),
  );
  assert.deepEqual(ended, ['other', 'walk']);
});

test('a name that does not read is counted unread and holds no byte, and a folder asked that is gone did not read', async () => {
  const dir = path.join(ROOT, 'unread');
  const own = file(path.join(dir, 'own.bin'));
  const shut = path.join(dir, 'shut');
  file(path.join(shut, 'hidden.bin'), 64);
  const heldShut = held(shut);
  fs.chmodSync(shut, 0o000);
  try {
    const walked = await Effect.runPromise(walk([path.join(ROOT, 'never'), dir]));
    assert.deepEqual(walked.read, [false, true]);
    assert.deepEqual(walked.unread, [1, process.getuid?.() === 0 ? 0 : 1], 'the folder gone, and the folder that does not list');
    if (process.getuid?.() !== 0) assert.deepEqual(walked.bytes, [0, held(dir) + held(own) + heldShut], 'nothing under what did not list');
  } finally {
    fs.chmodSync(shut, 0o755);
  }
});

test('the walk says what it cost: every name it read, the folders asked among them, and a burst yielded each WALK_BURST of them', async () => {
  const dir = path.join(ROOT, 'cost');
  const other = path.join(ROOT, 'cost-other');
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  const planted = 2 * WALK_BURST + 7;
  for (let k = 0; k < planted; k++) fs.writeFileSync(path.join(k % 2 ? dir : path.join(dir, 'sub'), `f${k}`), '');
  const walked = await Effect.runPromise(walk([dir, other]));
  assert.equal(walked.names, planted + 1 + 2, 'the files, the folder under, and the two asked');
  assert.equal(walked.bursts, Math.floor(walked.names / WALK_BURST));
  assert.equal(walked.bursts, 2);
  assert.deepEqual(walked.unread, [0, 0]);
});

/** A sort by the first letter of a name inside a folder of kind `top`, and its own kind kept anywhere else. */
const byLetter: Sort = { kinds: ['top'], kindIn: (kind, name) => (kind === 'top' ? `kind-${name[0]}` : kind) };

test("a walk told how to sort counts each name to its kind, the kinds of a folder adding up to its bytes; a link counted as its own name's", async () => {
  const dir = path.join(ROOT, 'sorted');
  const a = file(path.join(dir, 'a', 'deep', 'one.bin'), 16);
  const b = file(path.join(dir, 'b.bin'), 32);
  fs.symlinkSync(path.join(ROOT, 'target'), path.join(dir, 'c-link'));
  const walked = await Effect.runPromise(walk([dir], byLetter));
  assert.deepEqual(walked.kinds, [
    {
      top: held(dir),
      'kind-a': held(path.join(dir, 'a')) + held(path.join(dir, 'a', 'deep')) + held(a),
      'kind-b': held(b),
      'kind-c': held(path.join(dir, 'c-link')),
    },
  ]);
  assert.equal(
    Object.values(walked.kinds[0]).reduce((n, v) => n + v, 0),
    walked.bytes[0],
  );
  const unsorted = await Effect.runPromise(walk([dir]));
  assert.deepEqual([unsorted.bytes, unsorted.kinds], [walked.bytes, [{ [WHOLE]: walked.bytes[0] }]], 'with no sort, one kind');
});

test('a file with two names inside under two kinds counts once, to one of them; one hardlinked from outside counts to none', async () => {
  const dir = path.join(ROOT, 'sorted-links');
  const one = file(path.join(dir, 'x', 'one.bin'), 64);
  fs.mkdirSync(path.join(dir, 'y'));
  fs.linkSync(one, path.join(dir, 'y', 'one.bin'));
  const outside = file(path.join(ROOT, 'sorted-main', 'shared.bin'), 128);
  fs.linkSync(outside, path.join(dir, 'y', 'shared.bin'));
  const { kinds, bytes } = await Effect.runPromise(walk([dir], byLetter));
  const folders = { x: held(path.join(dir, 'x')), y: held(path.join(dir, 'y')) };
  assert.equal(kinds[0]['kind-x'] + kinds[0]['kind-y'], folders.x + folders.y + held(one), 'the pair once');
  assert.ok(kinds[0]['kind-x'] === folders.x || kinds[0]['kind-y'] === folders.y, `and to one kind: ${JSON.stringify(kinds)}`);
  assert.equal(bytes[0], held(dir) + folders.x + folders.y + held(one), 'nothing of the file whose other name is outside');
});

test('REFUSED: a folder that does not list is unread and in no kind, never a kind at zero bytes', async () => {
  const dir = path.join(ROOT, 'sorted-shut');
  const shut = path.join(dir, 'z');
  file(path.join(shut, 'hidden.bin'), 64);
  fs.chmodSync(shut, 0o000);
  try {
    if (process.getuid?.() === 0) return;
    const walked = await Effect.runPromise(walk([dir, path.join(ROOT, 'sorted-never')], { ...byLetter, kinds: ['top', 'top'] }));
    assert.deepEqual(walked.unread, [1, 1]);
    assert.deepEqual(walked.kinds, [{ top: held(dir), 'kind-z': held(shut) }, {}], 'the folder itself counted, nothing under it');
  } finally {
    fs.chmodSync(shut, 0o755);
  }
});
