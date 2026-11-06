/**
 * `nemia apply -f` against a served store (`served.ts`): a Workflow of yours made, then left alone, then written after an edit; a Card
 * written whole with a new `spec.from`; and the refusals, each exit 2 naming the command to type: a missing Card (`nemia inbox add`), a
 * changed Run, which the api writes no way (`nemia explain`), and an `apiVersion` other than `nemia/v1`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { servedStore, write } from './served.ts';

const store = await servedStore('nemia-cli-apply-', (root) => {
  write(path.join(root, 'inbox', 'cache-the-views.md'), '---\nlabels:\n  team: core\n---\nCache the views.\n');
  write(
    path.join(root, 'runs', 'r-done.json'),
    JSON.stringify({
      id: 'r-done',
      place: { kind: 'folder' },
      workspace: root,
      brief: 'A run to hand on',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-09-12T00:10:00.000Z',
      workflow: [{ name: 'build', after: [], body: 'Build it.', workspace: 'folder', harness: 'codex' }],
      steps: { build: { taskId: null } },
    }),
  );
});
test.after(() => store.stop());

/** A Workflow of one step working in folders, whose step's note is `body`. */
const workflow = (body: string) =>
  `apiVersion: nemia/v1\nkind: Workflow\nmetadata:\n  name: tidy\nspec:\n  steps:\n    - name: build\n      keys:\n        place: folder\n      body: ${body}\n`;

test('a Workflow of yours, in default: created, then unchanged, then configured after an edit', async () => {
  const file = path.join(store.home, 'tidy.yaml');
  fs.writeFileSync(file, workflow('Build it.'));
  const made = await store.nemia(['apply', '-f', file]);
  assert.equal(made.code, 0, made.err);
  assert.equal(made.out, 'workflows/tidy created\n');
  const again = await store.nemia(['apply', '-f', file]);
  assert.equal(again.code, 0, again.err);
  assert.equal(again.out, 'workflows/tidy unchanged\n');
  fs.writeFileSync(file, workflow('Build it twice.'));
  const edited = await store.nemia(['apply', '-f', file]);
  assert.equal(edited.code, 0, edited.err);
  assert.equal(edited.out, 'workflows/tidy configured\n');
  const read = await store.nemia(['get', 'workflow', 'tidy', '-o', 'yaml']);
  assert.match(read.out, /body: Build it twice\./, 'the edit was written');
  const back = await store.nemia(['apply', '-f', '-'], read.out);
  assert.equal(back.out, 'workflows/tidy unchanged\n', '`get -o yaml` reads back as unchanged');
});

test('a Card with a new spec.from is configured: written whole through its update', async () => {
  const read = await store.nemia(['get', 'card', 'cache-the-views', '-n', 'default', '-o', 'yaml']);
  assert.equal(read.code, 0, read.err);
  const changed = read.out.replace(/^spec:\n/m, 'spec:\n  from:\n    - r-done\n');
  assert.notEqual(changed, read.out);
  const applied = await store.nemia(['apply', '-f', '-'], changed);
  assert.equal(applied.code, 0, applied.err);
  assert.equal(applied.out, 'cards/cache-the-views configured\n');
  const after = await store.nemia(['get', 'card', 'cache-the-views', '-n', 'default', '-o', 'json']);
  assert.match(after.out, /"r-done"/);
});

test('REFUSED: a Card whose spec.queued the file changes exits 2 naming `nemia inbox queue`, the card left as it was', async () => {
  const file = path.join(store.root, 'inbox', 'cache-the-views.md');
  const before = fs.readFileSync(file, 'utf8');
  const read = await store.nemia(['get', 'card', 'cache-the-views', '-n', 'default', '-o', 'yaml']);
  assert.equal(read.code, 0, read.err);
  const queued = read.out.replace(/^spec:\n/m, 'spec:\n  queued: 2026-11-01T10:00:00.000Z\n');
  assert.notEqual(queued, read.out);
  const refused = await store.nemia(['apply', '-f', '-'], queued);
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /nemia inbox queue/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('REFUSED: a missing Card is refused exit 2 naming `nemia inbox add`, which files one', async () => {
  const refused = await store.nemia(
    ['apply', '-f', '-'],
    'apiVersion: nemia/v1\nkind: Card\nmetadata:\n  name: no-such-card\nspec:\n  body: An idea.\n',
  );
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /nemia inbox add/);
  assert.equal(refused.out, '');
});

test('REFUSED: a Run the file changes is refused exit 2 (no-update), naming `nemia explain`', async () => {
  const refused = await store.nemia(
    ['apply', '-f', '-'],
    'apiVersion: nemia/v1\nkind: Run\nmetadata:\n  name: r-done\nspec:\n  brief: Another brief\n',
  );
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /nemia explain runs/);
});

test('REFUSED: an apiVersion other than nemia/v1 exits 2, naming the one served; the next object of the file is still applied', async () => {
  const refused = await store.nemia(
    ['apply', '-f', '-'],
    `apiVersion: nemia.dev/v1alpha1\nkind: Workflow\nmetadata:\n  name: tidy\nspec: {}\n---\n${workflow('Build it twice.')}`,
  );
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /apiVersion: nemia\/v1/);
  assert.match(refused.out, /^workflows\/tidy (?:created|unchanged|configured)$/m);
});

test('REFUSED: a kind the api does not serve, and a namespace the file says other than -n, each exit 2', async () => {
  const kind = await store.nemia(['apply', '-f', '-'], 'apiVersion: nemia/v1\nkind: Pod\nmetadata:\n  name: p\n');
  assert.equal(kind.code, 2, kind.err);
  assert.match(kind.err, /nemia explain/);
  const namespace = await store.nemia(
    ['apply', '-f', '-', '-n', 'other'],
    workflow('Build it.').replace('  name: tidy\n', '  name: tidy\n  namespace: default\n'),
  );
  assert.equal(namespace.code, 2, namespace.err);
  assert.match(namespace.err, /-n default/);
});

test('`nemia apply --help` is its own; `--local` is refused exit 2 naming `nemia service status`', async () => {
  const help = await store.nemia(['apply', '--help']);
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /^nemia apply -f/);
  const local = await store.nemia(['apply', '-f', '-', '--local']);
  assert.equal(local.code, 2, local.err);
  assert.match(local.err, /nemia service status/);
});
