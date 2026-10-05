/**
 * The board's workflow entries (`WORKFLOWS_WRITE`, `WORKFLOWS_LIST`, `WORKFLOWS_STEP`), served on the api alone: a folder written from
 * its steps, or refused in the writer's words whole; each folder listed loaded, or with the loader's refusal, never failing the others;
 * and one step of a folder, or none, with the names of those it has. `WF_ROOT` is set before the import, since the store reads it as it
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-workflows-root-');
process.env.WF_ROOT = ROOT;
const { WORKFLOWS_LIST, WORKFLOWS_STEP, WORKFLOWS_WRITE } = await import('./workflows.verb.ts');
const { runWith, engine } = await import('../runner.ts');

const e = engine();

/** A folder of yours, `name`, with each step's file as given. */
function folder(name: string, files: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

test('a folder written from its steps through the entry is the folder its list and its step read back', async () => {
  const dir = path.join(ROOT, 'workflows', 'written');
  const draft = JSON.stringify([
    { name: 'plan', after: [], body: 'Plan it.' },
    { name: 'build', after: ['plan'], body: 'Build it.' },
  ]);
  const done = await runWith(e, WORKFLOWS_WRITE.handler({ from: 'yours', name: 'written', dir, draft }, undefined, ROOT));
  assert.deepEqual(done.written, ['build.md', 'plan.md']);
  const listed = await runWith(e, WORKFLOWS_LIST.handler({ dirs: [dir] }, undefined, ROOT));
  const loaded = listed[dir];
  assert.ok(loaded && 'steps' in loaded, JSON.stringify(loaded));
  assert.deepEqual(
    loaded.steps.map((s) => [s.name, s.after]),
    [
      ['plan', []],
      ['build', ['plan']],
    ],
  );
  const read = await runWith(e, WORKFLOWS_STEP.handler({ from: 'yours', name: 'written', step: 'build', dir }, undefined, ROOT));
  assert.equal(read.step?.body, 'Build it.');
  assert.deepEqual(read.steps, ['plan', 'build']);
});

test('a step the folder does not have is none, with the names of those it has', async () => {
  const dir = folder('one-step', { 'only.md': 'Do it.\n' });
  const read = await runWith(e, WORKFLOWS_STEP.handler({ from: 'yours', name: 'one-step', step: 'other', dir }, undefined, ROOT));
  assert.deepEqual(read, { step: null, steps: ['only'] });
});

test("REFUSED: a folder that does not load is listed with the loader's words whole, and the folder beside it still loads", async () => {
  const good = folder('good', { 'only.md': 'Do it.\n' });
  const bad = folder('bad', { 'only.md': '---\nafter: nowhere\n---\nDo it.\n' });
  const listed = await runWith(e, WORKFLOWS_LIST.handler({ dirs: [bad, good] }, undefined, ROOT));
  assert.deepEqual(listed[bad], { error: 'only: waits on "nowhere", which is not a step here' });
  assert.deepEqual(Object.keys(listed), [bad, good]);
  assert.ok(listed[good] && 'steps' in listed[good]);
});

test("REFUSED: a draft the writer refuses is thrown in the writer's words whole, and nothing is written", async () => {
  const dir = path.join(ROOT, 'workflows', 'twice');
  const draft = JSON.stringify([
    { name: 'plan', after: [], body: 'Plan it.' },
    { name: 'plan', after: [], body: 'Plan it again.' },
  ]);
  await assert.rejects(runWith(e, WORKFLOWS_WRITE.handler({ from: 'yours', name: 'twice', dir, draft }, undefined, ROOT)), (err: Error) => {
    assert.equal(err.message, 'two steps are named plan, and a step is its file, plan.md. Rename one of them.');
    return true;
  });
  assert.equal(fs.existsSync(dir), false);
});
