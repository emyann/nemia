/**
 * A factory's Hires on the board (`/api/namespaces/<factory>/hires/<workflow>.<step>`, factory/parts/hires.ts, over `nemia factory
 * hire` and `fire`): a story of an agent hired into a step, replaced and fired, each answered as the Hire read again; and one table of
 * what a hire refuses — in a scratch store whose factory is filed with the package's own verbs. Every write is read back from the
 * factory's file, and every refusal leaves it as it was.
 */
import { root } from '../../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { addFactory, attachWorkflow, hireRefusalOf } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app, appOf, liveOf } from '../../app.ts';
import { StoreRoot } from '../../store.ts';

const own = scratch('nemia-api-hires-own-');
process.env.HKB_REPO = own;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: own });
const folder = scratch('nemia-api-hires-folder-');
addFactory({ name: 'mill', repos: [folder] });
attachWorkflow({ factory: 'mill', workflow: 'make' });
/** A step file `step` of the workflow `workflow` in `dir`'s `workflows/`, which works on a git repository. */
const stepIn = (dir: string, workflow: string, step: string): void => {
  const file = path.join(dir, 'workflows', workflow, `${step}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nplace: git\n---\nDo ${step}.\n`);
};
const WORKFLOW = 'make';
stepIn(folder, WORKFLOW, 'code');

const RECORD = path.join(root, 'factories', 'mill.json');
const HIRE = '/api/namespaces/mill/hires/make.code';

type Hire = import('objects').Hire;
type HireList = import('objects').HireList;

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown, headers: Record<string, string> = json) =>
  app.request(url, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** The hires the factory's file holds. */
const hires = (): Record<string, string> | undefined =>
  (JSON.parse(fs.readFileSync(RECORD, 'utf8')) as { hires?: Record<string, string> }).hires;

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** A request refused with `status`: its words, and the factory's file as it was. */
async function refused(res: () => Response | Promise<Response>, status: number): Promise<string> {
  const before = fs.readFileSync(RECORD, 'utf8');
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.equal(fs.readFileSync(RECORD, 'utf8'), before, 'a refused request leaves the factory as it was');
  return body.error;
}

test('a person hires an agent into a step, replaces it, and fires it', async (t) => {
  const s = story(t);
  await s.test('the factory lists a Hire of the step, filled by no one yet', async () => {
    const list = await answered<HireList>(app.request('/api/namespaces/mill/hires'));
    assert.equal(list.kind, 'HireList');
    assert.deepEqual(
      list.items.map((h) => [h.metadata.name, h.status.filled]),
      [['make.code', 'unfilled']],
    );
  });
  await s.test('PUT hires the agent into the step the name joins, answered as the Hire', async () => {
    const hire = await answered<Hire>(send('PUT', HIRE, { agent: 'implementer' }));
    assert.deepEqual(
      [hire.kind, hire.spec, hire.status.filled, hire.status.agent],
      ['Hire', { workflow: 'make', step: 'code', agent: 'implementer' }, 'factory', 'implementer'],
    );
    assert.deepEqual(hires(), { 'make/code': 'implementer' }, 'make.code reaches the verb as make/code');
    assert.deepEqual(await answered<Hire>(app.request(HIRE)), hire, 'got as the write answered it');
  });
  await s.test('a second PUT replaces it', async () => {
    assert.equal((await answered<Hire>(send('PUT', HIRE, { agent: 'agora' }))).spec.agent, 'agora');
    assert.deepEqual(hires(), { 'make/code': 'agora' });
  });
  await s.test('DELETE fires it, answered as the Hire with no agent', async () => {
    const fired = await answered<Hire>(send('DELETE', HIRE, {}));
    assert.deepEqual([fired.spec.agent, fired.status.filled], [undefined, 'unfilled']);
    assert.deepEqual(hires(), {});
  });
  await s.test('REFUSED: a second DELETE is a 404 naming the factory and the step', async () => {
    const twice = await refused(() => send('DELETE', HIRE, {}), 404);
    for (const fact of ['mill', 'make/code', 'Nothing was fired.']) assert.ok(twice.includes(fact), `${fact}: ${twice}`);
  });
});

/** A step whose own file names its agent: `step` in `dir`'s `workflows/make`, naming `agent`. */
const naming = (dir: string, step: string, agent: string): string => {
  const file = path.join(dir, 'workflows', 'make', `${step}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nagent: ${agent}\n---\nDo it.\n`);
  return file;
};

test('the Hire writes: what a hire or a fire refuses, the factory file as it was', async (t) => {
  await t.test('a step sent with a slash as two segments is no route (404), and so is the retired route', async () => {
    const before = fs.readFileSync(RECORD, 'utf8');
    assert.equal((await send('PUT', '/api/namespaces/mill/hires/make/code', { agent: 'implementer' })).status, 404);
    assert.equal((await send('PUT', '/api/factories/mill/hires/make%2Fimplement', { agent: 'implementer' })).status, 404);
    assert.equal(fs.readFileSync(RECORD, 'utf8'), before);
  });
  await t.test('a factory the store does not have is a 404 naming it, to hire and to fire', async () => {
    assert.match(await refused(() => send('PUT', '/api/namespaces/gone/hires/make.code', { agent: 'implementer' }), 404), /gone/);
    assert.match(await refused(() => send('DELETE', '/api/namespaces/gone/hires/make.code', {}), 404), /gone/);
  });
  await t.test("the default factory's step is a 409 naming the verb that does not take it", async () => {
    stepIn(own, WORKFLOW, 'code');
    const said = await refused(() => send('PUT', '/api/namespaces/default/hires/make.code', { agent: 'implementer' }), 409);
    assert.ok(said.startsWith('`default` is the default factory'), said);
    assert.ok(said.includes('nemia factory hire does not take it'), said);
  });
  await t.test('a step of a workflow the factory does not offer is no Hire of it, a 404 naming the attach that offers it', async () => {
    stepIn(folder, 'triage', 'frame');
    const said = await refused(() => send('PUT', '/api/namespaces/mill/hires/triage.frame', { agent: 'implementer' }), 404);
    assert.ok(said.includes('nemia factory attach mill'), said);
  });
  await t.test('a name that joins no step is a 404', async () => {
    await refused(() => send('PUT', '/api/namespaces/mill/hires/code', { agent: 'implementer' }), 404);
  });
  await t.test('two steps whose names join to one are a 409 naming both, to hire and to fire', async () => {
    attachWorkflow({ factory: 'mill', workflow: 'a.b' });
    attachWorkflow({ factory: 'mill', workflow: 'a' });
    stepIn(folder, 'a.b', 'c');
    stepIn(folder, 'a', 'b.c');
    try {
      for (const [method, body] of [
        ['PUT', { agent: 'implementer' }],
        ['DELETE', {}],
      ] as const) {
        const said = await refused(() => send(method, '/api/namespaces/mill/hires/a.b.c', body), 409);
        for (const fact of ['the step c of a.b', 'the step b.c of a', 'rename']) assert.ok(said.includes(fact), `${fact}: ${said}`);
      }
      const both = (await answered<HireList>(app.request('/api/namespaces/mill/hires'))).items.filter((h) => h.metadata.name === 'a.b.c');
      assert.equal(both.length, 2, 'both are listed');
      for (const h of both) assert.match(h.status.error ?? '', /rename/);
    } finally {
      fs.rmSync(path.join(folder, 'workflows', 'a.b'), { recursive: true });
      fs.rmSync(path.join(folder, 'workflows', 'a'), { recursive: true });
    }
  });
  await t.test("a step whose own file names its agent is a 409 in hireRefusalOf's words, then the file", async () => {
    const file = naming(folder, 'named', 'agora');
    const said = await refused(() => send('PUT', '/api/namespaces/mill/hires/make.named', { agent: 'implementer' }), 409);
    assert.equal(said, `${hireRefusalOf({ name: 'mill', workflows: ['make'] }, 'make', 'agora')} ${file} names it. Nothing was hired.`);
  });
  await t.test("and one of yours, read under the app's store root, its factory's repository holding no make of its own", async () => {
    const home = scratch('nemia-api-hires-home-');
    const file = naming(home, 'mine', 'otto');
    fs.mkdirSync(path.join(home, 'factories'), { recursive: true });
    const record = JSON.parse(fs.readFileSync(RECORD, 'utf8')) as { repos: string[] };
    fs.writeFileSync(path.join(home, 'factories', 'mill.json'), JSON.stringify({ ...record, repos: [scratch('nemia-api-hires-bare-')] }));
    const { app: moved } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
    const put = () =>
      moved.request('/api/namespaces/mill/hires/make.mine', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ agent: 'implementer' }),
      });
    const said = await refused(put, 409);
    assert.equal(said, `${hireRefusalOf({ name: 'mill', workflows: ['make'] }, 'make', 'otto')} ${file} names it. Nothing was hired.`);
  });
  await t.test('a body with no agent is a 400 naming the route', async () => {
    const said = await refused(() => send('PUT', HIRE, {}), 400);
    assert.ok(said.includes('PUT /api/namespaces/mill/hires/make.code'), said);
  });
  await t.test('a body that is not JSON is a 400 naming the route', async () => {
    const said = await refused(() => send('PUT', HIRE, '{agent'), 400);
    assert.ok(said.includes('PUT /api/namespaces/mill/hires/make.code'), said);
  });
  await t.test("a name that is no factory's is a 422", async () => {
    await refused(() => send('PUT', '/api/namespaces/Not%20One/hires/make.code', { agent: 'implementer' }), 422);
  });
});
