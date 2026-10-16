/**
 * The watcher's cursor file: a missing file starts a watch where it was told, a write and a read round-trip, a write leaves nothing
 * behind, a cut rewrites 0, and a directory that is not there and a file that holds no number are each refused by name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { cursorFileStart, cutCursorFile, keepCursor } from './cursor.store.ts';

const ROOT = scratch('wf-cursor-file-');

/** A path of this test's own under `ROOT`, its directory there, the file not written. */
const at = (name: string): string => path.join(ROOT, `${name}.cursor`);

test('a cursor file that is not there starts the watch where it was told to', () => {
  assert.equal(cursorFileStart(at('none')), undefined);
});

test('a cursor written is the cursor read back, and nothing is left beside it', () => {
  const file = at('kept');
  keepCursor(file, 0);
  assert.equal(cursorFileStart(file), 0);
  keepCursor(file, 1834);
  assert.equal(cursorFileStart(file), 1834);
  assert.deepEqual(
    fs.readdirSync(ROOT).filter((n) => n.startsWith('kept')),
    ['kept.cursor'],
    'the temp name it was written to was renamed over it',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), '1834\n', 'one decimal number and a newline');
});

test('a feed cut under the watch rewrites the cursor file to 0', () => {
  const file = at('cut');
  keepCursor(file, 4096);
  cutCursorFile(file);
  assert.equal(cursorFileStart(file), 0);
});

test('REFUSED: a cursor file in a directory that is not there, named, before a line is read', () => {
  const file = path.join(ROOT, 'nope', 'watch.cursor');
  assert.throws(
    () => keepCursor(file, 12),
    (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.equal(
        err.message,
        `${path.join(ROOT, 'nope')} is no directory, so ${file} cannot be written: make it, or name a cursor file in one that is`,
      );
      return true;
    },
  );
});

test('REFUSED: a cursor file that holds anything but a whole number, named, never read as 0', () => {
  const file = at('junk');
  for (const text of ['abc', '', '-1', '12 34', '1.5']) {
    fs.writeFileSync(file, text);
    assert.throws(
      () => cursorFileStart(file),
      (err: Error & { exitCode?: number }) => {
        assert.equal(err.exitCode, 2);
        assert.match(err.message, new RegExp(`^${file.replaceAll('.', '\\.')} is no cursor file: it holds `));
        assert.match(err.message, /delete the file to watch from the start/);
        return true;
      },
      JSON.stringify(text),
    );
  }
});
