/**
 * One file a step left, read by name and never by path (`fileIn`, `artifactFile`): the bytes of a regular file, and none for a name that
 * is a path, even to a file that is there, for a folder, and for a link, which is never followed. `WF_ROOT` is set before the import,
 * since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-artifacts-root-');
process.env.WF_ROOT = ROOT;
const { artifactFile, fileIn } = await import('./artifacts.store.ts');

test("a step's file is read by its name, from its files directory or from any folder", () => {
  const dir = path.join(ROOT, 'runs', 'r-1', 'artifacts', 'build');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
  assert.equal(artifactFile({ id: 'r-1' }, 'build', 'shot.png')?.toString(), 'png');
  assert.equal(fileIn(dir, 'shot.png')?.toString(), 'png');
  assert.equal(fileIn(dir, 'gone.png'), null);
});

test('REFUSED: a name that is a path reads none, though the file it reaches is there; nor does a folder, nor a link', () => {
  const dir = scratch('wf-artifacts-');
  const beside = scratch('wf-artifacts-beside-');
  fs.writeFileSync(path.join(beside, 'secret.txt'), 'secret');
  fs.mkdirSync(path.join(dir, 'inner'));
  fs.writeFileSync(path.join(dir, 'inner', 'notes.md'), 'notes');
  fs.symlinkSync(path.join(beside, 'secret.txt'), path.join(dir, 'link.txt'));
  assert.equal(fileIn(dir, `../${path.basename(beside)}/secret.txt`), null);
  assert.equal(fileIn(dir, 'inner/notes.md'), null);
  assert.equal(fileIn(dir, 'inner'), null);
  assert.equal(fileIn(dir, 'link.txt'), null);
});
