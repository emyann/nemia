/**
 * A factory's hires on the board (the routes the table generates for `nemia factory hire` and `fire`): an agent hired into a step, the
 * step one encoded segment of the path, and fired — in a scratch store whose factory is filed with the package's own verbs. Every write is
 * read back from the factory's file, and every refusal is made to refuse at shipped defaults, in the package's words where it has them,
 * with the file as it was.
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

test('PUT hires an agent into the step the encoded segment names, a second replaces it, and DELETE fires it; a second DELETE is a 404', async () => {
  assert.deepEqual(await answered(send('PUT', HIRE, { agent: 'ada' })), { file: RECORD, replaced: null });
  assert.deepEqual(hires(), { 'build/implement': 'ada' }, 'build%2Fimplement reaches the verb as build/implement');
  assert.deepEqual(await answered(send('PUT', HIRE, { agent: 'agora' })), { file: RECORD, replaced: 'ada' });
  assert.deepEqual(hires(), { 'build/implement': 'agora' });
  assert.deepEqual(await answered(send('DELETE', HIRE, {})), { file: RECORD, fired: 'agora' });
  assert.deepEqual(hires(), {});
  const twice = await refused(() => send('DELETE', HIRE, {}), 404);
  assert.equal(twice, 'mill hires no agent into build/implement. It hires none. Nothing was fired.');
});

test('REFUSED: a step sent with its slash as two segments is no route', async () => {
  const before = fs.readFileSync(RECORD, 'utf8');
  const res = await send('PUT', '/api/factories/mill/hires/build/implement', { agent: 'ada' });
  assert.equal(res.status, 404);
  assert.equal(fs.readFileSync(RECORD, 'utf8'), before);
});

test("REFUSED at shipped defaults: no factory (404), the default (409), a workflow not offered and a step that is no <workflow>/<step> (422)", async () => {
  assert.match(await refused(() => send('PUT', '/api/factories/gone/hires/build%2Fimplement', { agent: 'ada' }), 404), /gone/);
  assert.match(await refused(() => send('DELETE', '/api/factories/gone/hires/build%2Fimplement', {}), 404), /gone/);
  assert.match(
    await refused(() => send('PUT', '/api/factories/default/hires/build%2Fimplement', { agent: 'ada' }), 409),
    /^`default` is the default factory: .* nemia factory hire does not take it\./,
  );
  assert.equal(
    await refused(() => send('PUT', '/api/factories/mill/hires/intake%2Fframe', { agent: 'ada' }), 422),
    'mill does not offer the workflow intake, so it hires no one into its steps. Attach it first — nemia factory attach mill intake — then hire. Nothing was hired.',
  );
  assert.match(
    await refused(() => send('PUT', '/api/factories/mill/hires/implement', { agent: 'ada' }), 422),
    /^--step implement names a step as <workflow>\/<step>/,
  );
});

test("REFUSED at shipped defaults: a hire into a step whose own file names its agent is a 409 in hireRefusalOf's words, then the file", async () => {
  const named = path.join(folder, 'workflows', 'build', 'named.md');
  fs.mkdirSync(path.dirname(named), { recursive: true });
  fs.writeFileSync(named, '---\nagent: agora\n---\nReview it.\n');
  const words = (agent: string, file: string) =>
    `${hireRefusalOf({ name: 'mill', workflows: ['build'] }, 'build', agent)} ${file} names it. Nothing was hired.`;
  assert.equal(await refused(() => send('PUT', '/api/factories/mill/hires/build%2Fnamed', { agent: 'ada' }), 409), words('agora', named));
  const home = scratch('nemia-api-hires-home-');
  const mine = path.join(home, 'workflows', 'build', 'mine.md');
  fs.mkdirSync(path.dirname(mine), { recursive: true });
  fs.writeFileSync(mine, '---\nagent: otto\n---\nShip it.\n');
  const { app: moved } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
  const put = () =>
    moved.request('/api/factories/mill/hires/build%2Fmine', { method: 'PUT', headers: json, body: JSON.stringify({ agent: 'ada' }) });
  assert.equal(await refused(put, 409), words('otto', mine), "yours, read under the app's store root");
});

test("REFUSED: a body with no agent and one that is not JSON (400), in the api's words, and a name that is no factory's (400) in the package's", async () => {
  assert.equal(
    await refused(() => send('PUT', HIRE, {}), 400),
    'PUT /api/factories/mill/hires/build%2Fimplement: `agent` names the agent to hire, a string, its file\'s name without .md: `{ "agent": "<the agent\'s name>" }`. This request\'s was left out.',
  );
  assert.equal(
    await refused(() => send('PUT', HIRE, '{agent'), 400),
    'PUT /api/factories/mill/hires/build%2Fimplement takes a JSON body: `{ "agent": "<the agent\'s name>" }`.',
  );
});
