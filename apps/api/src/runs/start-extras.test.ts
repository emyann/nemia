/**
 * What a start takes beyond a workflow and a brief, on the Run's `create` and the Card's `start` alike (`objects`' `startExtras`): each
 * step's model for this run alone, the steps gated, a run with no worktree, and the files handed to its steps, sent by their names and
 * their bytes; and what a start answers beside its id, the lines `nemia start` prints of it. Then the run's removal whole
 * (`DELETE …/runs/:name?whole=true`), with its branches deleted where asked (`deleteBranches`, `forceUnmerged`).
 *
 * In a factory of the store (`acme`, the orchestrator's test team's `dev`), on a scratch repository: each run is written and nothing is
 * filed.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, eachTest } from '../../test/placed.ts';
import { runsAtOnce } from 'agent-orchestrator';
import { TEAM } from '../../test/team.ts';

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * The factory `acme`, made from a template, on one scratch repository, its tree holding the test team's `dev`: a repository of the test
 * place (`testPlace`), given to it for each test, the api served over it and the runtime's stand-in.
 */
const repo = scratch('nemia-api-start-extras-');
process.env.HKB_REPO = repo;
const stand = eachTest(() => {
  const place = testPlace();
  place.world.repository(repo, {});
  return place;
});
const engine = eachTest(testEngine);
const app = () => appOver(engine(), stand());
const tree = path.join(root, 'factories', 'acme', 'tree');
fs.cpSync(TEAM, path.join(tree, 'workflows'), { recursive: true });
write(
  path.join(root, 'factories', 'acme.json'),
  JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
);
write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));

const JSON_TYPE = { 'content-type': 'application/json' };

/** `body` posted to `url` in `acme`'s namespace. */
const post = (url: string, body: unknown) =>
  app().request(`/api/namespaces/acme/${url}`, { method: 'POST', headers: JSON_TYPE, body: JSON.stringify(body) });

/** A picture's first bytes, which are no UTF-8 text. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);

/** What a start of `dev` sends beside its workflow and brief. */
const EXTRAS = {
  models: { implement: 'sonnet' },
  gates: ['implement'],
  inputs: [
    { name: 'notes.md', text: 'Read me first.\n' },
    { name: 'shot.png', base64: PNG.toString('base64') },
  ],
};

test("POST /api/namespaces/acme/runs with models, gates and inputs starts a run whose record has them, the inputs' bytes copied by name", async () => {
  const res = await post('runs', { workflow: 'dev', brief: 'Add a cache.', ...EXTRAS });
  assert.equal(res.status, 201, await res.clone().text());
  const started = (await res.json()) as { id: string; lines?: string[] };
  const run = runsAtOnce(root).runs.read(started.id);
  assert.deepEqual(run.models, { implement: 'sonnet' });
  assert.deepEqual(run.inputs, ['notes.md', 'shot.png']);
  const inputs = path.join(root, 'runs', started.id, 'inputs');
  assert.equal(fs.readFileSync(path.join(inputs, 'notes.md'), 'utf8'), 'Read me first.\n');
  assert.deepEqual(fs.readFileSync(path.join(inputs, 'shot.png')), PNG);
  assert.ok(
    started.lines?.some((line) => line.startsWith('models: ')),
    `the lines nemia start prints: ${started.lines?.join('\n')}`,
  );
  assert.ok(
    started.lines?.some((line) => line.startsWith('gated at: implement')),
    started.lines?.join('\n'),
  );
});

test('POST /api/namespaces/acme/cards/:name/start with models starts a run whose record has them', async () => {
  write(path.join(root, 'inbox', 'cache-card.md'), '---\nworkflow: dev\nfactory: acme\n---\nAdd a cache, from the card\n');
  const res = await post('cards/cache-card/start', { models: { implement: 'sonnet' }, gates: ['implement'] });
  assert.equal(res.status, 201, await res.clone().text());
  const started = (await res.json()) as { id: string; card: string; lines?: string[] };
  assert.equal(started.card, 'cache-card');
  assert.deepEqual(runsAtOnce(root).runs.read(started.id).models, { implement: 'sonnet' });
  assert.ok(
    started.lines?.some((line) => line.startsWith('from inbox card cache-card')),
    started.lines?.join('\n'),
  );
});

test('`noWorktree` reaches the start: a workflow that ends by merging its result branch is refused it, naming --no-worktree', async () => {
  const res = await post('runs', { workflow: 'dev', brief: 'Add a cache.', noWorktree: true });
  assert.equal(res.status, 422, await res.clone().text());
  assert.match(((await res.json()) as { error: string }).error, /--no-worktree/);
});

test('REFUSED: an input whose name holds a folder, and one sent both as text and as bytes, are refused, nothing started', async () => {
  const before = fs.readdirSync(path.join(root, 'runs')).length;
  for (const input of [
    { name: '../escape.md', text: 'x' },
    { name: 'both.md', text: 'x', base64: 'eA==' },
  ]) {
    const res = await post('runs', { workflow: 'dev', brief: 'Add a cache.', inputs: [input] });
    assert.equal(res.status, 422, `${JSON.stringify(input)}: ${await res.clone().text()}`);
    assert.match(((await res.json()) as { error: string }).error, /--input/);
  }
  assert.equal(fs.readdirSync(path.join(root, 'runs')).length, before);
});

test('DELETE a run of a workflow: refused as a try alone, removed whole with ?whole=true, and --force-unmerged alone refused', async () => {
  const res = await post('runs', { workflow: 'dev', brief: 'Remove me.' });
  assert.equal(res.status, 201, await res.clone().text());
  const { id } = (await res.json()) as { id: string };
  const del = (query: string) =>
    app().request(`/api/namespaces/acme/runs/${id}${query}`, { method: 'DELETE', headers: JSON_TYPE, body: '{}' });
  assert.equal((await del('')).status, 409, 'a run of a workflow is no try: nemia rm removes it');
  assert.equal(
    (await del('?whole=true&forceUnmerged=true')).status,
    422,
    '--force-unmerged forces --delete-branches, and alone deletes nothing',
  );
  assert.equal(
    (await app().request(`/api/namespaces/acme/runs/${id}/cancel`, { method: 'POST', headers: JSON_TYPE, body: '{}' })).status,
    200,
  );
  const gone = await del('?whole=true&deleteBranches=true');
  assert.equal(gone.status, 200, await gone.clone().text());
  const removed = (await gone.json()) as { id: string; removed: boolean; line?: string };
  assert.deepEqual([removed.id, removed.removed], [id, true]);
  assert.ok(removed.line?.startsWith(id), removed.line);
  assert.equal(runsAtOnce(root).runs.exists(id), false);
});
