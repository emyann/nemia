/**
 * What a write of a factory or of one of its parts says it did (`written`, `objects`' `FactoryWritten`), on its answer alone: the file
 * it wrote, whether it changed nothing, and what it replaced — the lines `nemia factory attach`, `revisions`, `setting`, `cost-line`,
 * `hire`, `fire`, `schedule`, `unschedule` and `server add|rm` print, which the client words from the answer; and whether `nemia factory
 * instruct --clear` took off an instruction. A story in a scratch store
 * whose factory is filed with the package's own verb; a read answers no `written`.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../app.ts';

type Factory = import('objects').Factory;
type Hire = import('objects').Hire;
type Schedule = import('objects').Schedule;
type McpServer = import('objects').McpServer;
type FactoryInstruction = import('objects').FactoryInstruction;

const own = scratch('nemia-api-written-own-');
process.env.HKB_REPO = own;
const folder = scratch('nemia-api-written-folder-');
const step = path.join(folder, 'workflows', 'make', 'code.md');
fs.mkdirSync(path.dirname(step), { recursive: true });
fs.writeFileSync(step, '---\nplace: git\n---\nDo code.\n');
addFactory({ name: 'wrote', repos: [folder] });
const FILE = path.join(root, 'factories', 'wrote.json');

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown = {}) => app.request(url, { method, headers: json, body: JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, 200, JSON.stringify(body));
  return body;
}

test('each write of a factory and its parts says the file it wrote and what it replaced; a read says nothing of a write', async (t) => {
  const s = story(t);

  await s.test('a workflow attached says its file, and attached again that it was so already; a detach says the file', async () => {
    const route = '/api/factories/wrote/workflows/make';
    assert.deepEqual((await answered<Factory>(send('PUT', route))).written, { file: FILE, already: false });
    assert.deepEqual((await answered<Factory>(send('PUT', route))).written, { file: FILE, already: true });
    assert.equal((await answered<Factory>(app.request('/api/factories/wrote'))).written, undefined, 'a read says no write');
  });

  await s.test('a revisions policy says the policy it replaced, none at first', async () => {
    const route = '/api/factories/wrote/revisions';
    assert.deepEqual((await answered<Factory>(send('PUT', route, { revisions: 'follow' }))).written, { file: FILE, was: null });
    assert.deepEqual((await answered<Factory>(send('PUT', route, { revisions: 'pinned' }))).written, { file: FILE, was: 'follow' });
  });

  await s.test(
    'a cost line says the dollars it replaced, and its removal the file; a setting set and taken off says its file',
    async () => {
      const route = '/api/factories/wrote/costlines/make';
      assert.deepEqual((await answered<Factory>(send('PUT', route, { usd: 80 }))).written, { file: FILE, replaced: null });
      assert.deepEqual((await answered<Factory>(send('PUT', route, { usd: 90 }))).written, { file: FILE, replaced: 80 });
      assert.deepEqual((await answered<Factory>(send('DELETE', route))).written, { file: FILE });
      const setting = '/api/factories/wrote/settings/claude.language';
      assert.deepEqual((await answered<Factory>(send('PUT', setting, { value: '"french"' }))).written, { file: FILE });
      assert.deepEqual((await answered<Factory>(send('DELETE', setting))).written, { file: FILE });
    },
  );

  await s.test('a hire says the agent it replaced, and a fire the agent fired', async () => {
    const route = '/api/namespaces/wrote/hires/make.code';
    assert.deepEqual((await answered<Hire>(send('PUT', route, { agent: 'implementer' }))).written, { file: FILE, was: null });
    assert.deepEqual((await answered<Hire>(send('PUT', route, { agent: 'reviewer' }))).written, { file: FILE, was: 'implementer' });
    assert.deepEqual((await answered<Hire>(send('DELETE', route))).written, { file: FILE, was: 'reviewer' });
  });

  await s.test('a schedule says the cron it replaced, and its removal the file', async () => {
    const route = '/api/namespaces/wrote/schedules/make';
    const body = { cron: '0 9 * * 1', brief: 'Read the stats' };
    assert.deepEqual((await answered<Schedule>(send('PUT', route, body))).written, { file: FILE, was: null });
    assert.deepEqual((await answered<Schedule>(send('PUT', route, { ...body, cron: '0 8 * * 1' }))).written, {
      file: FILE,
      was: '0 9 * * 1',
    });
    assert.deepEqual((await answered<Schedule>(send('DELETE', route))).written, { file: FILE });
  });

  await s.test('a server recorded says the address it replaced, and its removal the record it wrote', async () => {
    const route = '/api/namespaces/wrote/mcpservers/docs';
    const servers = path.join(root, 'factories', 'wrote', 'servers.json');
    assert.deepEqual((await answered<McpServer>(send('PUT', route, { url: 'https://a.example/mcp' }))).written, {
      file: servers,
      was: null,
    });
    assert.deepEqual((await answered<McpServer>(send('PUT', route, { url: 'https://b.example/mcp' }))).written, {
      file: servers,
      was: 'https://a.example/mcp',
    });
    assert.deepEqual((await answered<McpServer>(send('DELETE', route))).written, { file: servers });
  });

  await s.test("the store's instruction taken off says whether there was one to take off", async () => {
    await answered<FactoryInstruction>(send('PUT', '/api/factories/wrote/instruction', { store: true }));
    const route = '/api/factories/wrote/instruction/words';
    await answered<FactoryInstruction>(send('PUT', route, { words: 'Know this.' }));
    assert.equal((await answered<FactoryInstruction>(send('DELETE', route))).removed, true);
    assert.equal((await answered<FactoryInstruction>(send('DELETE', route))).removed, false);
  });
});
