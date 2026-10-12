/**
 * The store's root listed for a sweep (`storeRoots`) and the room on its file system (`storeFree`), on a store of scratch. `WF_ROOT` is
 * set before the store is imported, which reads it as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = path.join(scratch('wf-disk-store-'), 'store');
process.env.WF_ROOT = ROOT;
const { storeFree, storeRoots } = await import('./disk.store.ts');

/** A file at `at`, under the store. */
const file = (...at: string[]): void => {
  fs.mkdirSync(path.dirname(path.join(ROOT, ...at)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, ...at), 'x');
};

test('REFUSED: a store whose root does not list has no roots, and says so', () => {
  assert.throws(
    () => storeRoots(),
    (err: Error) => err.message.includes('ENOENT') && err.message.includes(ROOT),
  );
});

test('the roots are the store itself alone, each name under it by its part, and each name under a part kept by run', () => {
  file('runs', 'a', 'artifacts', 'p.png');
  file('runs', 'a.json');
  file('worktrees', 'a', 'design', 'f');
  file('engine', 'runs', 'deep');
  file('checks', 'a-work-check.stdout');
  file('metrics', 'minute', 'd.jsonl');
  file('inbox', 'card.md');
  file('feed.jsonl');
  const held = (...at: string[]) => fs.lstatSync(path.join(ROOT, ...at)).blocks * 512;
  const roots = storeRoots().map((root) => ({ ...root, path: path.relative(ROOT, root.path) }));
  const sorted = roots.sort((x, y) => x.path.localeCompare(y.path));
  assert.deepEqual(sorted, [
    { part: 'other', path: '', own: held() },
    { part: 'checks', path: 'checks' },
    { part: 'engine', path: 'engine' },
    { part: 'other', path: 'feed.jsonl' },
    { part: 'other', path: 'inbox' },
    { part: 'series', path: 'metrics' },
    { part: 'runs', path: 'runs', own: held('runs') },
    { part: 'runs', name: 'a', path: 'runs/a' },
    { part: 'runs', name: 'a.json', path: 'runs/a.json' },
    { part: 'worktrees', path: 'worktrees', own: held('worktrees') },
    { part: 'worktrees', name: 'a', path: 'worktrees/a' },
  ]);
});

test('a part kept by run that does not list is one root whole, for the walk to say unread', () => {
  fs.rmSync(path.join(ROOT, 'worktrees'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'worktrees'), 'no folder');
  assert.deepEqual(
    storeRoots().filter((root) => root.part === 'worktrees'),
    [{ part: 'worktrees', path: path.join(ROOT, 'worktrees') }],
  );
});

test('the room on the store’s file system is no more than its size', () => {
  const { free, size } = storeFree();
  assert.ok(Number.isSafeInteger(free) && Number.isSafeInteger(size), `${free} of ${size}`);
  assert.ok(free >= 0 && size > 0 && free <= size, `${free} of ${size}`);
});
