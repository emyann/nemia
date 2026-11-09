/**
 * A file written whole (`writeWhole`): its content replaced and no temp file left beside it; the file replaced rather than rewritten, so a
 * reader that opened it before reads all of what it had; and a rename that fails, onto a directory planted at the target, leaving what
 * was there as it was, with no temp file behind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { writeWhole } from './whole-file.store.ts';

const ROOT = scratch('wf-whole-file-');

/** A folder of its own for one test, holding `name` with `text` in it. */
const planted = (name: string, text: string): { dir: string; file: string } => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'case-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return { dir, file };
};

test("writeWhole replaces a file's content and leaves no temp file in its folder", () => {
  const { dir, file } = planted('a.json', '{"old":true}\n');
  writeWhole(file, '{"new":true}\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"new":true}\n');
  assert.deepEqual(fs.readdirSync(dir), ['a.json']);
});

test('writeWhole writes a file that was not there', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'case-'));
  writeWhole(path.join(dir, 'b.md'), 'hello\n');
  assert.equal(fs.readFileSync(path.join(dir, 'b.md'), 'utf8'), 'hello\n');
  assert.deepEqual(fs.readdirSync(dir), ['b.md']);
});

test('writeWhole replaces the file rather than rewriting it: a reader that opened it before reads the old content whole', () => {
  const old = 'x'.repeat(4096);
  const { file } = planted('c.txt', old);
  const fd = fs.openSync(file, 'r');
  try {
    writeWhole(file, 'y');
    assert.equal(fs.readFileSync(fd, 'utf8'), old);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), 'y');
});

test('REFUSED: a rename onto a directory planted at the target throws, the directory and its file whole, and no temp file left', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'case-'));
  const target = path.join(dir, 'd.json');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'kept'), 'old');
  assert.throws(() => writeWhole(target, 'new'));
  assert.equal(fs.readFileSync(path.join(target, 'kept'), 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(dir), ['d.json']);
});

test('writeWhole given a mode lands the file at it: set on the hidden file before the rename, a read-only file stays read-only', () => {
  const { dir, file } = planted('e.md', 'old');
  fs.chmodSync(file, 0o444);
  writeWhole(file, 'new', { mode: 0o444 });
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  assert.equal(fs.statSync(file).mode & 0o777, 0o444);
  assert.deepEqual(fs.readdirSync(dir), ['e.md']);
});
