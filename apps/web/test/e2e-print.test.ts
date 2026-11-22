/**
 * A worker's store after its last page is the store it seeded (e2e/print.ts): a file a page changed, added or removed and did not put
 * back is refused, naming it and the worker's pages; a write taken back, byte for byte, passes; and what git and the e2e's own `claude`
 * write is no page's; a keyspace is read by its live records, a record left live refused. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'vitest';
import { drift, fingerprint, leftOver } from './e2e/print.ts';
import { scratch } from 'test-kit/scratch';

/** A store with a run, a card and a repository, as the seed writes them. */
function store() {
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

/** The keyspace of `root`, laid out as the orchestrator lays it, with `rows` appended: each a key, its value, and if a tombstone. */
function keyspaceWith(root: string, rows: readonly (readonly [string, string, boolean])[]) {
  fs.mkdirSync(path.join(root, 'db'), { recursive: true });
  const db = new DatabaseSync(path.join(root, 'db', 'state.db'));
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS kine (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, deleted INTEGER, value BLOB)');
    for (const [name, value, deleted] of rows)
      db.prepare('INSERT INTO kine (name, deleted, value) VALUES (?, ?, ?)').run(name, deleted ? 1 : 0, value);
  } finally {
    db.close();
  }
}

test('a keyspace whose records a page wrote and took back passes, its new rows and its log no write of the page', () => {
  const root = store();
  const before = fingerprint(root);
  keyspaceWith(root, [
    ['/registry/proposals/acme/a', '{}', false],
    ['/registry/proposals/acme/a', '', true],
  ]);
  assert.equal(leftOver(before, fingerprint(root), PAGES), null);
});

test('REFUSED: a record a page left live in the keyspace', () => {
  const root = store();
  keyspaceWith(root, [['/registry/proposals/acme/kept', '{}', false]]);
  const before = fingerprint(root);
  keyspaceWith(root, [['/registry/proposals/acme/a', '{}', false]]);
  assert.deepEqual(drift(before, fingerprint(root)), ['changed db/state.db']);
});
