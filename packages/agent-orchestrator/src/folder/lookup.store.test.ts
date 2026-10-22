/**
 * The workflow folders a place holds (`foldersIn`): each folder directly in it, sorted, but a hidden one, `agents/` and `skills/`; none
 * where the place is not there, and a refusal naming the fix where it cannot be listed. `WF_ROOT` is set before the import, since the
 * store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-lookup-root-');
const { foldersIn } = await import('./lookup.store.ts');

test('a place that is not there holds no workflow', () => {
  assert.deepEqual(foldersIn(path.join(scratch('wf-lookup-'), 'workflows')), []);
});

test('REFUSED as workflows: a hidden folder, agents/, skills/ and a file; the folders left are sorted, a link to one included', () => {
  const dir = scratch('wf-lookup-');
  for (const name of ['review', '.git', 'agents', 'skills', 'build']) fs.mkdirSync(path.join(dir, name));
  fs.writeFileSync(path.join(dir, 'notes.md'), 'not a folder\n');
  fs.symlinkSync(path.join(dir, 'build'), path.join(dir, 'linked'));
  assert.deepEqual(foldersIn(dir), ['build', 'linked', 'review']);
});

test('REFUSED: a place that cannot be listed, naming the folder and what to check', (t) => {
  const dir = scratch('wf-lookup-');
  fs.mkdirSync(path.join(dir, 'build'));
  fs.chmodSync(dir, 0o000);
  t.after(() => fs.chmodSync(dir, 0o700));
  if (process.getuid?.() === 0) return t.skip('root lists any folder');
  let message = '';
  try {
    foldersIn(dir);
  } catch (err) {
    assert.ok(err instanceof Error, String(err));
    message = err.message;
  }
  assert.ok(message.includes('EACCES'), message);
  assert.ok(message.endsWith('Check its permissions.'), message);
  assert.ok(message.startsWith(`${dir} could not be listed`), message);
});
