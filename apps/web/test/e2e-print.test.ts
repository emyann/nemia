/**
 * A worker's store after its last page is the store it seeded (e2e/print.ts): a file a page changed, added or removed and did not put
 * back is refused, naming it and the worker's pages; a write taken back, byte for byte, passes; and what git and the e2e's own `claude`
 * write is no page's. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { drift, fingerprint, leftOver } from './e2e/print.ts';
import { scratch } from './scratch.ts';

/** A store with a run, a card and a repository, as the seed writes them. */
function store(): string {
  const root = scratch('nemia-e2e-print-');
  for (const [rel, text] of Object.entries({
    'runs/r1.json': '{"id":"r1"}\n',
    'inbox/c1.md': 'a card\n',
    'checkout/README.md': 'hello\n',
    'checkout/.git/HEAD': 'ref: refs/heads/main\n',
    'bin/claude': '#!/bin/sh\n',
  })) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const PAGES = ['hold', 'say'];

test('a store whose pages took back what they wrote passes, the same bytes written again', () => {
  const root = store();
  const before = fingerprint(root);
  fs.writeFileSync(path.join(root, 'runs', 'r1.json'), '{"id":"r1","held":true}\n');
  fs.writeFileSync(path.join(root, 'inbox', 'c2.md'), 'another\n');
  fs.writeFileSync(path.join(root, 'runs', 'r1.json'), '{"id":"r1"}\n');
  fs.rmSync(path.join(root, 'inbox', 'c2.md'));
  assert.equal(leftOver(before, fingerprint(root), PAGES), null);
});

test('REFUSED: a file a page changed, added or removed and left so, each named, with the pages that may have', () => {
  const root = store();
  const before = fingerprint(root);
  fs.writeFileSync(path.join(root, 'runs', 'r1.json'), '{"id":"r1","held":true}\n');
  fs.writeFileSync(path.join(root, 'inbox', 'c2.md'), 'another\n');
  fs.rmSync(path.join(root, 'checkout', 'README.md'));
  const after = fingerprint(root);
  assert.deepEqual(drift(before, after), ['removed checkout/README.md', 'added inbox/c2.md', 'changed runs/r1.json']);
  const why = leftOver(before, after, PAGES);
  assert.ok(why !== null, 'a write left in the store is refused');
  assert.match(why, /^a page left a write in the store it did not take back, removed checkout\/README\.md and 2 more, /);
  assert.match(why, /^ {4}changed runs\/r1\.json$/m);
  assert.match(why, /One of hold, say wrote it/);
});

test("what git and the e2e's own claude write is no page's", () => {
  const root = store();
  const before = fingerprint(root);
  fs.writeFileSync(path.join(root, 'checkout', '.git', 'HEAD'), 'ref: refs/heads/other\n');
  fs.writeFileSync(path.join(root, 'bin', 'claude'), '#!/bin/sh\nexit 0\n');
  assert.equal(leftOver(before, fingerprint(root), PAGES), null);
  assert.ok(!before.has('checkout/.git/HEAD') && before.has('checkout/README.md'), 'left out of the print, the rest in it');
});

test('REFUSED: a link a page pointed elsewhere', () => {
  const root = store();
  fs.symlinkSync('r1.json', path.join(root, 'runs', 'latest'));
  const before = fingerprint(root);
  fs.rmSync(path.join(root, 'runs', 'latest'));
  fs.symlinkSync('r2.json', path.join(root, 'runs', 'latest'));
  assert.deepEqual(drift(before, fingerprint(root)), ['changed runs/latest']);
});
