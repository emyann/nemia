/**
 * What the client's moved definition verbs ask the api for, which a forwarded command line refused before (`refusing(…, ['repo'], …)`):
 * the repository a read of agents names, `?repo=`, declared on each endpoint the client calls with one, and the lines its printers need
 * that the handler read and the answer did not carry — the file of an agent's custom instructions on the listing (`status.custom`) and
 * the place a card was read from (`from`). In a scratch store whose repository is the api's own, beside a factory's repository.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OpenApi } from 'effect/http-api';
import { addFactory } from 'agent-orchestrator/testing';
import { Api, type Agent, type AgentCard, type AgentList, type Workflow } from 'objects';
import { scratch } from 'test-kit/scratch';
import { app } from '../app.ts';

const own = scratch('nemia-api-repo-own-');
const theirs = scratch('nemia-api-repo-theirs-');
process.env.HKB_REPO = own;
for (const repo of [own, theirs]) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
addFactory({ name: 'elsewhere', repos: [theirs] });
fs.mkdirSync(path.join(theirs, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(theirs, 'workflows', 'agents', 'outrider.md'), '---\ndescription: Rides out.\n---\nRide out.\n');
fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(root, 'workflows', 'agents', 'archivist.md'), '---\ndescription: Files it away.\n---\nFile it away.\n');

/** The query parameters the api's document declares on `method` of `route`. */
function declared(route: string, method: 'get' | 'put' | 'post' | 'delete'): string[] {
  const doc = OpenApi.fromApi(Api) as unknown as {
    paths: Record<string, Record<string, { parameters?: { name: string; in: string }[] }>>;
  };
  return (doc.paths[route]?.[method]?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
}

test('each endpoint a moved verb names a repository on declares `repo` in its query, so the typed client can send it', () => {
  for (const [route, method] of [
    ['/api/namespaces/{namespace}/agents', 'get'],
    ['/api/namespaces/{namespace}/agents/{name}/card', 'get'],
    ['/api/namespaces/{namespace}/agents/{name}', 'delete'],
    ['/api/namespaces/{namespace}/agents/{name}/instructions', 'get'],
    ['/api/namespaces/{namespace}/agents/{name}/instructions', 'put'],
    ['/api/namespaces/{namespace}/agents/{name}/instructions', 'delete'],
    ['/api/namespaces/{namespace}/workflows/{name}', 'delete'],
  ] as const)
    assert.ok(declared(route, method).includes('repo'), `${method.toUpperCase()} ${route} declares ?repo=`);
});

test('`?repo=` names the repository whose agents the listing and a card read, beside yours; the card says the place it came from', async () => {
  const at = `?repo=${encodeURIComponent(theirs)}`;
  const named = (list: AgentList) => list.items.map((a) => a.metadata.name).sort();
  const ownList = (await (await app.request('/api/namespaces/default/agents')).json()) as AgentList;
  assert.deepEqual(named(ownList), ['archivist'], "the api's own repository holds none");
  const listed = (await (await app.request(`/api/namespaces/default/agents${at}`)).json()) as AgentList;
  assert.deepEqual(named(listed), ['archivist', 'outrider']);

  const card = await app.request(`/api/namespaces/default/agents/outrider/card${at}`);
  const body = (await card.json()) as AgentCard;
  assert.equal(card.status, 200, JSON.stringify(body));
  assert.equal(body.card.name, 'outrider');
  assert.equal(body.from, 'repo');
  const yours = (await (await app.request('/api/namespaces/default/agents/archivist/card')).json()) as AgentCard;
  assert.equal(yours.from, 'yours');
});

test("the listing says the file of an agent's custom instructions, where a person wrote some, and null where none", async () => {
  const put = await app.request('/api/namespaces/default/agents/archivist/instructions', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ words: 'File it twice.' }),
  });
  assert.equal(put.status, 200, await put.text());
  const list = (await (await app.request('/api/namespaces/default/agents')).json()) as AgentList;
  const archivist = list.items.find((a) => a.metadata.name === 'archivist');
  assert.equal(archivist?.status.custom, path.join(root, 'custom-instructions', 'archivist.md'));
  const listed = (await (await app.request(`/api/namespaces/default/agents?repo=${encodeURIComponent(theirs)}`)).json()) as AgentList;
  assert.equal(listed.items.find((a) => a.metadata.name === 'outrider')?.status.custom, null);
});

test('a removal answers, beside the object as it was, the files it removed (`status.removed`), which `nemia … rm` prints', async () => {
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'courier.md'), '---\ndescription: Carries it.\n---\nCarry it.\n');
  const agent = (await (await app.request('/api/namespaces/default/agents/courier')).json()) as Agent;
  const gone = await app.request(
    `/api/namespaces/default/agents/courier?resourceVersion=${encodeURIComponent(agent.metadata.resourceVersion ?? '')}`,
    {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    },
  );
  const removed = (await gone.json()) as Agent;
  assert.equal(gone.status, 200, JSON.stringify(removed));
  assert.deepEqual(removed.status.removed, ['courier.md']);
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'agents', 'courier.md')), false);

  fs.mkdirSync(path.join(root, 'workflows', 'errand'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workflows', 'errand', 'go.md'), '---\nplace: git\n---\nGo.\n');
  const workflow = (await (await app.request('/api/namespaces/default/workflows/errand')).json()) as Workflow;
  const folder = await app.request(
    `/api/namespaces/default/workflows/errand?resourceVersion=${encodeURIComponent(workflow.metadata.resourceVersion ?? '')}`,
    {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    },
  );
  const dropped = (await folder.json()) as Workflow;
  assert.equal(folder.status, 200, JSON.stringify(dropped));
  assert.deepEqual(dropped.status.removed, ['go.md']);
  assert.equal(dropped.status.dir, path.join(root, 'workflows', 'errand'));
});
