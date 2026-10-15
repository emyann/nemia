/**
 * One file a step left, read by name and never by path (`fileIn`, `artifactFile`): the bytes of a regular file, and none for a name that
 * is a path, even to a file that is there, for a folder, and for a link, which is never followed. And the files a closeout named that
 * the run does not have, off the disk alone (`filesLacked`), one case for each reason, with those that are there for the step after
 * (`filesHanded`). `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-artifacts-root-');
process.env.WF_ROOT = ROOT;
const { artifactFile, fileIn, filesHanded, filesLacked } = await import('./artifacts.store.ts');
const { REFUSING } = await import('./artifacts.ts');
import type { Run } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';

/** A run whose step `build` works in `workspace`, with its files directory made: the run, and that directory. */
function aRun(workspace: string | undefined): { run: Run; dir: string } {
  const id = path.basename(scratch('wf-lacked-'));
  const dir = path.join(ROOT, 'runs', id, 'artifacts', 'build');
  fs.mkdirSync(dir, { recursive: true });
  const run = { id, steps: { build: { taskId: 't1', ...(workspace ? { workspace } : {}) } } } as unknown as Run;
  return { run, dir };
}

/** A closeout that names `artifacts`. */
const naming = (...artifacts: string[]): Closeout => ({ outcome: 'done', summary: 'done', artifacts });

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

test('each reason a named file is not one the run has is read off the disk, and every one of them refuses', () => {
  const workspace = scratch('wf-lacked-ws-');
  const beside = scratch('wf-lacked-beside-');
  const { run, dir } = aRun(workspace);
  fs.writeFileSync(path.join(beside, 'secret.txt'), 'secret');
  fs.mkdirSync(path.join(workspace, 'shots'));
  fs.symlinkSync(path.join(beside, 'secret.txt'), path.join(workspace, 'link.txt'));
  const lacked = filesLacked(
    run,
    'build',
    naming('gone.md', path.join(dir, 'gone.png'), 'shots', 'link.txt', '../up.md', path.join(beside, 'secret.txt'), '.claude/note.md'),
  );
  assert.deepEqual(lacked, [
    { path: 'gone.md', why: 'not there' },
    { path: path.join(dir, 'gone.png'), why: 'missing' },
    { path: 'shots', why: 'directory' },
    { path: 'link.txt', why: 'escapes' },
    { path: '../up.md', why: 'escapes' },
    { path: path.join(beside, 'secret.txt'), why: 'outside' },
    { path: '.claude/note.md', why: 'configuration' },
  ]);
  for (const { why } of lacked) assert.ok(REFUSING.has(why as never), `${why} refuses`);
  assert.deepEqual([...REFUSING].sort(), [...new Set(lacked.map((l) => l.why))].sort(), 'and no other reason does');
});

test('a named file the run has is not lacked: in the files directory, collected there, or still in the workspace', () => {
  const workspace = scratch('wf-lacked-ws-');
  const { run, dir } = aRun(workspace);
  fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
  fs.writeFileSync(path.join(dir, 'collected.md'), 'copied, and since removed from the workspace');
  fs.writeFileSync(path.join(workspace, 'uncopied.md'), 'in the workspace');
  fs.mkdirSync(path.join(dir, 'blocked.md'));
  fs.writeFileSync(path.join(workspace, 'blocked.md'), 'its copy is refused by a directory in its place');
  assert.deepEqual(filesLacked(run, 'build', naming(path.join(dir, 'shot.png'), 'collected.md', 'uncopied.md', 'blocked.md')), []);
  assert.deepEqual(filesLacked(run, 'build', naming()), []);
  assert.deepEqual(filesLacked(run, 'build', undefined), []);
});

test('a path from the workspace root is not judged where there is no workspace to read: none on the record, or none on disk', () => {
  assert.deepEqual(filesLacked(aRun(undefined).run, 'build', naming('gone.md')), []);
  assert.deepEqual(filesLacked(aRun(path.join(scratch('wf-lacked-ws-'), 'removed')).run, 'build', naming('gone.md')), []);
});

test('the step after is handed the named files that are there, by absolute path, and a count of the rest', () => {
  const { run, dir } = aRun(scratch('wf-lacked-ws-'));
  fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.writeFileSync(path.join(dir, 'notes', 'a.md'), 'collected');
  const handed = filesHanded(
    run,
    'build',
    naming(path.join(dir, 'shot.png'), 'notes/a.md', path.join(dir, 'gone.png'), 'gone.md', '/etc/hosts'),
  );
  assert.deepEqual(handed, { there: [path.join(dir, 'shot.png'), path.join(dir, 'notes', 'a.md')], gone: 3 });
  assert.deepEqual(filesHanded(run, 'build', undefined), { there: [], gone: 0 });
});
