/**
 * `POST /api/workflows/read`: a workflow's folder sent as its files, read into its spec by the package's own reader
 * (`workflowDraftOfFiles`), writing nothing, in no namespace. Its answer is the spec a GET of the same files written to yours answers;
 * a step file whose frontmatter does not read is refused with the file named, and a folder sent with no name is refused.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEAM } from '../../test/team.ts';
import type { Workflow, WorkflowCreate } from 'objects';
import { Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import type { Running } from 'agent-orchestrator';
import { app, appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';

const STORE = path.join(root, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });

const read = (body: unknown) =>
  app.request('/api/workflows/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Each file directly in `dir`, by its name, with its text: what the client sends of a folder. */
const filesIn = (dir: string) =>
  fs
    .readdirSync(dir)
    .sort()
    .map((name) => ({ path: name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));

/** Every file under the store, by its path there: what a read must leave as it was. */
const storeNow = (): string[] => (fs.readdirSync(root, { recursive: true }) as string[]).sort();

test('a folder sent as its files reads as the spec a GET of the same files in yours answers, and writes nothing', async () => {
  const dir = path.join(STORE, 'readback');
  fs.cpSync(path.join(TEAM, 'dev'), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pictures.ts'), 'process.exit(0);\n');
  const got = await app.request('/api/namespaces/default/workflows/readback?origin=yours');
  const workflow = (await got.json()) as Workflow;
  assert.equal(got.status, 200, JSON.stringify(workflow));
  assert.equal(workflow.status.error, null, 'the folder written to yours reads');

  const files = filesIn(dir);
  fs.rmSync(dir, { recursive: true });
  const before = storeNow();
  const res = await read({ name: 'readback', files });
  const answer = (await res.json()) as WorkflowCreate;
  assert.equal(res.status, 200, JSON.stringify(answer));
  assert.deepEqual(answer, { metadata: { name: 'readback' }, spec: workflow.spec });
  assert.ok(
    (answer.spec.files ?? []).some((f) => f.path === 'pictures.ts'),
    'the files it carries are read',
  );
  assert.deepEqual(storeNow(), before, 'a read writes nothing');
});

test('REFUSED: a step file whose frontmatter does not read, named; a folder sent with no name; a file named by a path', async () => {
  const files = filesIn(path.join(TEAM, 'dev'));
  const broken = [...files, { path: 'broken.md', text: '---\nplace: [git\n---\nDo it.\n' }];
  for (const [what, body, names] of [
    ['a step that does not read', { name: 'broken', files: broken }, 'broken'],
    ['no name', { files }, 'name'],
    ['a path, not a name in the folder', { name: 'climbs', files: [...files, { path: '../out.ts', text: 'x' }] }, '../out.ts'],
  ] as const) {
    const before = storeNow();
    const res = await read(body);
    const { error } = (await res.json()) as { error: string };
    assert.ok([400, 422].includes(res.status), `${what}: ${res.status} ${error}`);
    assert.ok(error.includes(names), `${what}: ${JSON.stringify(error)} names ${names}`);
    assert.deepEqual(storeNow(), before, `${what}: a refused read writes nothing`);
  }
});

test('an install with no repository of its own and no factory named reads a folder sent, its agents found in yours alone', async () => {
  const release = scratch('nemia-api-read-install-');
  const running: Running = {
    kind: 'install',
    root: release,
    tag: 'v1.0.0',
    commit: 'abc',
    source: 'https://example.invalid/releases',
    builtAt: '2026-11-12T00:00:00.000Z',
    from: 'archive',
  };
  const { HKB_REPO: _noRepoOfItsOwn, WF_EXPOSED: _notExposed, ...env } = process.env;
  const { app: installed } = appOf(Layer.merge(liveOf(env), ApiConfig.layer(env, running)));
  const res = await installed.request('/api/workflows/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'readback', files: filesIn(path.join(TEAM, 'dev')) }),
  });
  const answer = (await res.json()) as WorkflowCreate;
  assert.equal(res.status, 200, JSON.stringify(answer));
  assert.ok(answer.spec.steps.length > 0, 'its steps are read');
});
