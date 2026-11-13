/**
 * A draft of a factory's own workflow read for that factory (`POST /api/workflows/read?factory=`), as `nemia workflows write factory`
 * sends it: each step the factory hires an agent into is read as if its file named that agent, as a run's start reads it, so a step
 * with `skills:` and no `agent:` line of its own reads; and the draft then proposed and approved writes the tree. A step the factory hires
 * no one into keeps its refusal, and so does the hired step read with no factory named.
 *
 * Each refusal asserts its status and the step it names, never its sentence.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Proposal, Workflow, WorkflowCreate } from 'objects';
import { app } from '../app.ts';

const FACTORY = 'hirer';
/** The hired step as the writer renders it, so a write of it unchanged leaves its file as it was. */
const STEP = '---\nplace: git\nskills: tidy\n---\nDo it.\n';

/** The factory `hirer`, made from a template: its tree the workflow `hired`, its step `only` filled by the agent `scribe` it hires. */
const TREE = (() => {
  const repo = path.join(root, 'hirer-repo');
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'tidy'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.claude', 'skills', 'tidy', 'SKILL.md'),
    '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n',
  );
  const factories = path.join(root, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  fs.writeFileSync(
    path.join(factories, `${FACTORY}.json`),
    JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  const tree = path.join(factories, FACTORY, 'tree');
  fs.mkdirSync(path.join(tree, 'workflows', 'hired'), { recursive: true });
  fs.mkdirSync(path.join(tree, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(tree, 'workflows', 'agents', 'scribe.md'),
    '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\n---\nWrite the notes.\n',
  );
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['hired'], hires: { 'hired/only': 'scribe' } }));
  fs.writeFileSync(path.join(tree, 'workflows', 'hired', 'README.md'), '# hired\n\nNotes.\n');
  fs.writeFileSync(path.join(tree, 'workflows', 'hired', 'only.md'), STEP);
  return path.join(tree, 'workflows', 'hired');
})();

/** What the board and the client send: JSON, same-origin. */
const HEADERS = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

const post = (url: string, body: unknown) => app.request(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });

/** Each file directly in the tree's folder, by its name, with its text, `over` in place of those it names: what the client sends. */
const filesOf = (over: Readonly<Record<string, string>> = {}) => {
  const files = Object.fromEntries(fs.readdirSync(TREE).map((name) => [name, fs.readFileSync(path.join(TREE, name), 'utf8')]));
  return Object.entries({ ...files, ...over })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, text]) => ({ path: name, text }));
};

/** The draft read for the factory, proposed to it at the version the workflow is read at now, and approved: the proposal approved. */
async function writtenBack(files: ReturnType<typeof filesOf>): Promise<Proposal> {
  const read = await post(`/api/workflows/read?factory=${FACTORY}`, { name: 'hired', files });
  const drafted = (await read.json()) as WorkflowCreate;
  assert.equal(read.status, 200, JSON.stringify(drafted));
  const now = (await (await app.request(`/api/namespaces/${FACTORY}/workflows/hired`)).json()) as Workflow;
  const ns = `/api/namespaces/${FACTORY}`;
  const made = await post(`${ns}/proposals`, {
    objects: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Workflow',
        metadata: { name: 'hired', namespace: FACTORY, resourceVersion: now.metadata.resourceVersion },
        spec: drafted.spec,
      },
    ],
  });
  const proposal = (await made.json()) as Proposal;
  assert.equal(made.status, 201, JSON.stringify(proposal));
  const approved = await post(`${ns}/proposals/${proposal.metadata.name}/approve`, {});
  assert.equal(approved.status, 200);
  return (await approved.json()) as Proposal;
}

test("a factory's own workflow, its step filled by a hire, read for the factory and written back: unchanged, then one line changed", async (t) => {
  await t.test('read for the factory, the hired step with `skills:` and no `agent:` line reads as the factory serves it', async () => {
    const res = await post(`/api/workflows/read?factory=${FACTORY}`, { name: 'hired', files: filesOf() });
    const answer = (await res.json()) as WorkflowCreate;
    assert.equal(res.status, 200, JSON.stringify(answer));
    const served = (await (await app.request(`/api/namespaces/${FACTORY}/workflows/hired`)).json()) as Workflow;
    assert.equal(served.status.error, null, 'the tree reads in its factory');
    assert.deepEqual(answer.spec, served.spec, 'the spec a GET of the same folder in the factory answers');
  });
  await t.test('written back unchanged, the proposal is applied and the step file is as it was', async () => {
    const applied = await writtenBack(filesOf());
    assert.equal(applied.status.phase, 'applied', applied.status.message);
    assert.equal(fs.readFileSync(path.join(TREE, 'only.md'), 'utf8'), STEP);
  });
  await t.test('written back with one line changed, the tree holds that line', async () => {
    const changed = STEP.replace('Do it.', 'Do it twice.');
    const applied = await writtenBack(filesOf({ 'only.md': changed }));
    assert.equal(applied.status.phase, 'applied', applied.status.message);
    assert.equal(fs.readFileSync(path.join(TREE, 'only.md'), 'utf8'), changed);
  });
});

test('REFUSED: a step the factory hires no one into, with `skills:`; and the hired step read with no factory named', async () => {
  for (const [what, url, files, names] of [
    ['a step with no hire', `/api/workflows/read?factory=${FACTORY}`, filesOf({ 'loose.md': STEP }), 'loose'],
    ['no factory named', '/api/workflows/read', filesOf(), 'only'],
  ] as const) {
    const res = await post(url, { name: 'hired', files });
    const { error } = (await res.json()) as { error: string };
    assert.ok([400, 422].includes(res.status), `${what}: ${res.status} ${error}`);
    assert.ok(error.includes(names), `${what}: ${JSON.stringify(error)} names the step ${names}`);
  }
});
