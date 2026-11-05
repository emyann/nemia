/**
 * A factory and its parts served as objects (factories.ts, mcp-servers.ts, schedules.ts, hires.ts, volumes.ts): each path answers its
 * kind, each list its `<Kind>List`; each write is 403 for another site and 415 for a body that is not JSON, the factory's files as they
 * were; and the routes these retire answer 404 in the api's words — in a scratch store whose factory is filed with the package's own verbs.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, attachWorkflow } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';

const repo = scratch('nemia-api-parts-');
fs.mkdirSync(path.join(repo, 'workflows', 'make'), { recursive: true });
fs.writeFileSync(path.join(repo, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
addFactory({ name: 'works', repos: [repo] });
attachWorkflow({ factory: 'works', workflow: 'make' });

/** Every file of the factory in the store, as bytes: what a refused write leaves as it was. */
const files = (): string =>
  JSON.stringify(
    [path.join(root, 'factories', 'works.json'), path.join(root, 'factories', 'works')].map((at) =>
      fs.existsSync(at) && fs.statSync(at).isFile() ? fs.readFileSync(at, 'utf8') : fs.existsSync(at) ? fs.readdirSync(at) : null,
    ),
  );

test('each path answers its kind, and each list its <Kind>List', async () => {
  const kinds: Array<[string, string]> = [
    ['/api/factories', 'FactoryList'],
    ['/api/factories/works', 'Factory'],
    ['/api/namespaces/works/mcpservers', 'McpServerList'],
    ['/api/builtin/mcpservers', 'McpServerList'],
    ['/api/namespaces/works/schedules', 'ScheduleList'],
    ['/api/namespaces/works/hires', 'HireList'],
    ['/api/namespaces/works/hires/make.implement', 'Hire'],
    ['/api/namespaces/works/volumes', 'VolumeList'],
  ];
  for (const [url, kind] of kinds) {
    const res = await app.request(url);
    const body = (await res.json()) as { kind?: string; apiVersion?: string };
    assert.equal(res.status, 200, `${url}: ${JSON.stringify(body)}`);
    assert.deepEqual([body.apiVersion, body.kind], ['nemia/v1', kind], url);
  }
  const commands = (await (await app.request('/api/factories/works/commands')).json()) as Record<string, unknown>;
  assert.equal(commands.attach, 'nemia factory attach works <workflow>');
});

test('the builtin servers carry no namespace', async () => {
  const body = (await (await app.request('/api/builtin/mcpservers')).json()) as { items: Array<{ metadata: { namespace?: string } }> };
  assert.ok(body.items.length > 0);
  for (const s of body.items) assert.equal(s.metadata.namespace, undefined);
});

test('a list in a namespace no factory has is a 404, and one the default factory has is empty', async () => {
  assert.equal((await app.request('/api/namespaces/nowhere/hires')).status, 404);
  const empty = (await (await app.request('/api/namespaces/default/schedules')).json()) as { items: unknown[] };
  assert.deepEqual(empty.items, []);
});

test('each write is 403 for another site and 415 for a body that is not JSON, the factory as it was', async () => {
  const writes: Array<[string, string]> = [
    ['PUT', '/api/namespaces/works/mcpservers/docs'],
    ['DELETE', '/api/namespaces/works/mcpservers/docs'],
    ['POST', '/api/namespaces/works/mcpservers/docs/sign-in'],
    ['DELETE', '/api/namespaces/works/mcpservers/docs/sign-in'],
    ['PUT', '/api/namespaces/works/schedules/make'],
    ['DELETE', '/api/namespaces/works/schedules/make'],
    ['PUT', '/api/namespaces/works/hires/make.implement'],
    ['DELETE', '/api/namespaces/works/hires/make.implement'],
    ['PUT', '/api/factories/works/rules'],
    ['DELETE', '/api/factories/works/rules'],
    ['PUT', '/api/factories/works/instruction'],
    ['DELETE', '/api/factories/works/instruction'],
    ['PUT', '/api/factories/works/instruction/words'],
    ['DELETE', '/api/factories/works/instruction/words'],
  ];
  const before = files();
  for (const [method, url] of writes) {
    const site = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    });
    assert.equal(site.status, 403, `${method} ${url} from another site`);
    const form = await app.request(url, { method, headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(form.status, 415, `${method} ${url} sent as text`);
    assert.ok(((await form.json()) as { error?: string }).error, `${method} ${url} says why`);
  }
  assert.equal(files(), before, 'nothing was written');
});

test('the routes these retire answer 404 in the api’s words', async () => {
  const retired: Array<[string, string]> = [
    ['GET', '/api/factories/works/servers'],
    ['PUT', '/api/factories/works/servers/docs'],
    ['POST', '/api/factories/works/servers/docs/sign-in'],
    ['PUT', '/api/factories/works/schedules/make'],
    ['DELETE', '/api/factories/works/schedules/make'],
    ['PUT', '/api/factories/works/hires/make%2Fimplement'],
    ['DELETE', '/api/factories/works/hires/make%2Fimplement'],
  ];
  for (const [method, url] of retired) {
    const res = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    });
    assert.equal(res.status, 404, `${method} ${url}`);
    const said = ((await res.json()) as { error?: string }).error ?? '';
    assert.match(said, /openapi/, `${method} ${url} says where the paths are listed: ${said}`);
  }
});
