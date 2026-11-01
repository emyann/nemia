/**
 * A factory's hires on the board (the routes the table generates for `nemia factory hire` and `fire`): a story of an agent hired into a
 * step, the step one encoded segment of the path, replaced and fired; and one table of what a hire refuses — in a scratch store whose
 * factory is filed with the package's own verbs. Every write is read back from the factory's file, and every refusal leaves it as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { addFactory, attachWorkflow, hireRefusalOf } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { story } from '../../test/checkpoints.ts';
import { app, appOf, liveOf } from '../app.ts';
import { StoreRoot } from '../store.ts';

const own = scratch('nemia-api-hires-own-');
process.env.HKB_REPO = own;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: own });
const folder = scratch('nemia-api-hires-folder-');
addFactory({ name: 'mill', repos: [folder] });
attachWorkflow({ factory: 'mill', workflow: 'build' });

const RECORD = path.join(root, 'factories', 'mill.json');
const HIRE = '/api/factories/mill/hires/build%2Fimplement';

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
  await s.test('PUT hires the agent into the step the encoded segment names', async () => {
    assert.deepEqual(await answered(send('PUT', HIRE, { agent: 'ada' })), { file: RECORD, replaced: null });
    assert.deepEqual(hires(), { 'build/implement': 'ada' }, 'build%2Fimplement reaches the verb as build/implement');
  });
  await s.test('a second PUT replaces it, naming the one replaced', async () => {
    assert.deepEqual(await answered(send('PUT', HIRE, { agent: 'agora' })), { file: RECORD, replaced: 'ada' });
    assert.deepEqual(hires(), { 'build/implement': 'agora' });
  });
  await s.test('DELETE fires it', async () => {
    assert.deepEqual(await answered(send('DELETE', HIRE, {})), { file: RECORD, fired: 'agora' });
    assert.deepEqual(hires(), {});
  });
  await s.test('REFUSED: a second DELETE is a 404 naming the factory and the step', async () => {
    const twice = await refused(() => send('DELETE', HIRE, {}), 404);
    for (const fact of ['mill', 'build/implement', 'Nothing was fired.']) assert.ok(twice.includes(fact), `${fact}: ${twice}`);
  });
});

/** A step whose own file names its agent: `step` in `dir`'s `workflows/build`, naming `agent`. */
const naming = (dir: string, step: string, agent: string): string => {
  const file = path.join(dir, 'workflows', 'build', `${step}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nagent: ${agent}\n---\nDo it.\n`);
  return file;
};

test('the hire routes: what a hire or a fire refuses, the factory file as it was', async (t) => {
  await t.test('a step sent with its slash as two segments is no route (404)', async () => {
    const before = fs.readFileSync(RECORD, 'utf8');
    const res = await send('PUT', '/api/factories/mill/hires/build/implement', { agent: 'ada' });
    assert.equal(res.status, 404);
    assert.equal(fs.readFileSync(RECORD, 'utf8'), before);
  });
  await t.test('a factory the store does not have is a 404 naming it, to hire and to fire', async () => {
    assert.match(await refused(() => send('PUT', '/api/factories/gone/hires/build%2Fimplement', { agent: 'ada' }), 404), /gone/);
    assert.match(await refused(() => send('DELETE', '/api/factories/gone/hires/build%2Fimplement', {}), 404), /gone/);
  });
  await t.test('the default factory is a 409 naming the verb that does not take it', async () => {
    const said = await refused(() => send('PUT', '/api/factories/default/hires/build%2Fimplement', { agent: 'ada' }), 409);
    assert.ok(said.startsWith('`default` is the default factory'), said);
    assert.ok(said.includes('nemia factory hire does not take it'), said);
  });
  await t.test('a workflow the factory does not offer is a 422 naming the attach that offers it', async () => {
    const said = await refused(() => send('PUT', '/api/factories/mill/hires/intake%2Fframe', { agent: 'ada' }), 422);
    for (const fact of ['intake', 'nemia factory attach mill intake', 'Nothing was hired.'])
      assert.ok(said.includes(fact), `${fact}: ${said}`);
  });
  await t.test('a step that is no <workflow>/<step> is a 422 naming the flag', async () => {
    assert.match(
      await refused(() => send('PUT', '/api/factories/mill/hires/implement', { agent: 'ada' }), 422),
      /^--step implement names a step as <workflow>\/<step>/,
    );
  });
  await t.test("a step whose own file names its agent is a 409 in hireRefusalOf's words, then the file", async () => {
    const file = naming(folder, 'named', 'agora');
    const said = await refused(() => send('PUT', '/api/factories/mill/hires/build%2Fnamed', { agent: 'ada' }), 409);
    assert.equal(said, `${hireRefusalOf({ name: 'mill', workflows: ['build'] }, 'build', 'agora')} ${file} names it. Nothing was hired.`);
  });
  await t.test("and one of yours, read under the app's store root", async () => {
    const home = scratch('nemia-api-hires-home-');
    const file = naming(home, 'mine', 'otto');
    fs.mkdirSync(path.join(home, 'factories'), { recursive: true });
    fs.copyFileSync(RECORD, path.join(home, 'factories', 'mill.json'));
    const { app: moved } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
    const put = () =>
      moved.request('/api/factories/mill/hires/build%2Fmine', { method: 'PUT', headers: json, body: JSON.stringify({ agent: 'ada' }) });
    const said = await refused(put, 409);
    assert.equal(said, `${hireRefusalOf({ name: 'mill', workflows: ['build'] }, 'build', 'otto')} ${file} names it. Nothing was hired.`);
  });
  await t.test('a body with no agent is a 400 naming the route and the key', async () => {
    const said = await refused(() => send('PUT', HIRE, {}), 400);
    assert.ok(said.startsWith('PUT /api/factories/mill/hires/build%2Fimplement: `agent`'), said);
    assert.ok(said.endsWith("This request's was left out."), said);
  });
  await t.test('a body that is not JSON is a 400 naming the route', async () => {
    const said = await refused(() => send('PUT', HIRE, '{agent'), 400);
    assert.ok(said.startsWith('PUT /api/factories/mill/hires/build%2Fimplement takes a JSON body'), said);
  });
  await t.test("a name that is no factory's is a 400", async () => {
    await refused(() => send('PUT', '/api/factories/Not%20One/hires/build%2Fimplement', { agent: 'ada' }), 400);
  });
});
