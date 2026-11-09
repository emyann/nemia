/**
 * `replaceFile`: a file replaced whole, through a file beside it renamed over it, so a reader finds the old or the new and never part
 * of either, and nothing is left beside it — whether it was replaced, the replacement was called off, or a write failed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { replaceFile } from './replace.ts';

/** A folder of its own with `file.json` in it, holding `old`. */
const placed = () => {
  const dir = scratch('ae-replace-');
  const file = path.join(dir, 'file.json');
  fs.writeFileSync(file, 'old');
  return { dir, file };
};

test('a file is replaced whole, and nothing is left beside it, however it ends', async (t) => {
  await t.test('replaced: the new text, from a string or bytes, flushed or not', () => {
    for (const [text, fsync] of [
      ['new', false],
      [Buffer.from('new bytes'), true],
    ] as const) {
      const { dir, file } = placed();
      assert.equal(replaceFile(file, text, { fsync }), true);
      assert.equal(fs.readFileSync(file, 'utf8'), String(text));
      assert.deepEqual(fs.readdirSync(dir), ['file.json']);
    }
  });
  await t.test('a file not there yet is written', () => {
    const dir = scratch('ae-replace-');
    const file = path.join(dir, 'new.json');
    assert.equal(replaceFile(file, 'first'), true);
    assert.equal(fs.readFileSync(file, 'utf8'), 'first');
  });
  await t.test('called off before the rename (`still`): the old file stands, and nothing is beside it', () => {
    const { dir, file } = placed();
    assert.equal(replaceFile(file, 'new', { still: () => false }), false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'old');
    assert.deepEqual(fs.readdirSync(dir), ['file.json']);
  });
  await t.test('given a mode and the times to keep, the new file carries them', () => {
    const { file } = placed();
    const times = { atimeMs: Date.parse('2026-01-01T00:00:00Z'), mtimeMs: Date.parse('2026-01-02T00:00:00Z') };
    replaceFile(file, 'new', { mode: 0o600, times });
    const stat = fs.statSync(file);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.mtimeMs, times.mtimeMs);
  });
  await t.test('a write that fails throws, and leaves the old file and nothing beside it', () => {
    const { dir, file } = placed();
    assert.throws(() => replaceFile(file, 'new', { still: () => assert.fail('the write failed before the rename') }));
    assert.equal(fs.readFileSync(file, 'utf8'), 'old');
    assert.deepEqual(fs.readdirSync(dir), ['file.json']);
  });
});
