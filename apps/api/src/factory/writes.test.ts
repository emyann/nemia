/**
 * The Factory's own writes the command line had alone, served as endpoints of `objects`' `Api` and calling the package's entries by
 * type: its revisions policy (`nemia factory revisions`), a workflow attached and
 * detached (`nemia factory attach`, `detach`), a harness setting set and taken off (`nemia factory setting`) and the factory removed
 * (`nemia factory rm`). Each is a story in a scratch store whose factories are filed with the package's own verb: the write answered and
 * read back from disk, then its refusals, each by its status, leaving the factory's file as it was. Its places trusted again (`nemia
 * factory trust`) are trust.boundary.test.ts's, which a real repository needs.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, attachWorkflow } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../app.ts';

type Factory = import('objects').Factory;
type FactoryRemoved = import('objects').FactoryRemoved;

/** A factory's place: a plain folder, since no write here asks the place for anything. */
const repo = scratch('nemia-api-factory-writes-');
for (const name of ['mill', 'gone', 'kept']) addFactory({ name, repos: [repo] });
attachWorkflow({ factory: 'mill', workflow: 'alpha' });

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown = {}) => app.request(url, { method, headers: json, body: JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** The factory's file as it is on disk, or null where there is none: what a refusal must leave as it was. */
const fileOf = (name: string): string | null => {
  const file = path.join(root, 'factories', `${name}.json`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/** That `res` was refused with `status`, and the factory `name`'s file is as it was before. */
async function refused(name: string, res: () => Response | Promise<Response>, status: number): Promise<void> {
  const before = fileOf(name);
  const answer = await res();
  assert.equal(answer.status, status, await answer.text());
  assert.equal(fileOf(name), before, `${name}'s file is left as it was`);
}

test("a person sets a factory's revisions policy: the Factory answers it, and a policy or a factory unknown is refused", async (t) => {
  const s = story(t);
  const route = '/api/factories/mill/revisions';

  await s.test('a PUT of { revisions: follow } answers the Factory following, written in its file; pinned writes it back', async () => {
    assert.equal((await answered<Factory>(send('PUT', route, { revisions: 'follow' }))).spec.revisions, 'follow');
    assert.equal(JSON.parse(fileOf('mill') ?? '{}').revisions, 'follow');
    assert.equal((await answered<Factory>(send('PUT', route, { revisions: 'pinned' }))).spec.revisions, 'pinned');
  });

  await s.test('REFUSED: a policy that is neither is a 400, a factory not filed a 404, the default a 409', async () => {
    await refused('mill', () => send('PUT', route, { revisions: 'always' }), 400);
    await refused('nowhere', () => send('PUT', '/api/factories/nowhere/revisions', { revisions: 'follow' }), 404);
    await refused('default', () => send('PUT', '/api/factories/default/revisions', { revisions: 'follow' }), 409);
  });
});

test('a person attaches a workflow to a factory and detaches it: the Factory answers each, and a name or a detach unknown is refused', async (t) => {
  const s = story(t);
  const route = '/api/factories/mill/workflows/gamma';
  const workflowsOf = (body: Factory) => body.spec.workflows;

  await s.test('a PUT attaches it, written in the file; its DELETE takes it back', async () => {
    assert.deepEqual(workflowsOf(await answered<Factory>(send('PUT', route))), ['alpha', 'gamma']);
    assert.deepEqual(JSON.parse(fileOf('mill') ?? '{}').workflows, ['alpha', 'gamma']);
    assert.deepEqual(workflowsOf(await answered<Factory>(send('DELETE', route))), ['alpha']);
    assert.deepEqual(JSON.parse(fileOf('mill') ?? '{}').workflows, ['alpha']);
  });

  await s.test('REFUSED: a factory not filed is a 404, a detach of a workflow not attached a 404, a hidden workflow a 422', async () => {
    await refused('nowhere', () => send('PUT', '/api/factories/nowhere/workflows/gamma'), 404);
    await refused('mill', () => send('DELETE', route), 404);
    await refused('mill', () => send('PUT', '/api/factories/mill/workflows/.hidden'), 422);
  });
});

test('a person gives a factory a harness setting and takes it off: the Factory answers each, and a key or a value refused writes nothing', async (t) => {
  const s = story(t);
  const route = '/api/factories/mill/settings/claude.language';
  const settingsOf = (body: Factory) => body.spec.harnessSettings;

  await s.test('a PUT of { value } as JSON text sets it, written in the file; its DELETE takes it off', async () => {
    assert.deepEqual(settingsOf(await answered<Factory>(send('PUT', route, { value: '"french"' }))), { claude: { language: 'french' } });
    assert.deepEqual(JSON.parse(fileOf('mill') ?? '{}').harnessSettings, { claude: { language: 'french' } });
    assert.equal(settingsOf(await answered<Factory>(send('DELETE', route))), undefined);
    assert.equal(JSON.parse(fileOf('mill') ?? '{}').harnessSettings, undefined);
  });

  await s.test('REFUSED: a value that is not JSON or a key a factory may not set is a 422, a factory not filed a 404', async () => {
    await refused('mill', () => send('PUT', route, { value: 'french' }), 422);
    await refused('mill', () => send('PUT', '/api/factories/mill/settings/claude.permissions', { value: '{}' }), 422);
    await refused('mill', () => send('PUT', route, { value: false }), 400);
    await refused('nowhere', () => send('PUT', '/api/factories/nowhere/settings/claude.language', { value: '"french"' }), 404);
    await refused('mill', () => send('DELETE', route), 404);
  });
});

test('a person removes a factory: its file is gone and the answer says so, and a factory unknown or the default is refused', async (t) => {
  const s = story(t);

  await s.test('a DELETE removes its file, answering it, and a GET of it is a 404 after', async () => {
    const removed = await answered<FactoryRemoved>(send('DELETE', '/api/factories/gone'));
    assert.equal(removed.name, 'gone');
    assert.equal(removed.file, path.join(root, 'factories', 'gone.json'));
    assert.equal(fileOf('gone'), null);
    assert.equal((await app.request('/api/factories/gone')).status, 404);
  });

  await s.test(
    'REFUSED: a factory not filed is a 404, a name that is no slug a 422, the default a 409, and every other is kept',
    async () => {
      await refused('gone', () => send('DELETE', '/api/factories/gone'), 404);
      await refused('kept', () => send('DELETE', '/api/factories/Not_A_Slug'), 422);
      await refused('kept', () => send('DELETE', '/api/factories/default'), 409);
      assert.notEqual(fileOf('kept'), null);
    },
  );
});
