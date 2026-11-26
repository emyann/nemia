/**
 * A GET writes nothing to the keyspace in any process, one that ticks no sweep among them (an api served with `--no-tick`, as this one is):
 * reads of every indexed kind, each list and each item, leave the store's head where it stood, so a read is no revision for a watcher to
 * replay. A definition no sweep has numbered is served at the next revision (`kindRevisions`, with no write), and a save at that revision
 * is written, with no 409; the writer then sweeps, so the head moves. A file of its own, since the store is the process's.
 */
import { root } from './harness.ts';
import { keyspaceHead } from 'agent-orchestrator';
import { addFactory } from 'agent-orchestrator/testing';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent } from 'objects';
import { TEAM } from './team.ts';
import { app, runtime } from '../src/app.ts';

const STORE = path.join(root, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });
addFactory({ name: 'shop', volumes: [`${root}:rw`] });

const head = () => runtime.runPromise(keyspaceHead());

test('GET of every list and item of the indexed kinds leaves the keyspace head where it was, and a save after them is written', async () => {
  const before = await head();
  const lists = ['/api/agents', '/api/skills', '/api/workflows', '/api/templates', '/api/factories', '/api/namespaces/shop/hires'];
  for (const url of lists) {
    const res = await app.request(url);
    assert.equal(res.status, 200, `${url} answered ${res.status}`);
    const page = (await res.json()) as { items: { metadata: { name: string } }[] };
    for (const item of page.items.slice(0, 3)) {
      const one = await app.request(`${url}/${encodeURIComponent(item.metadata.name)}`);
      assert.ok(one.status < 500, `${url}/${item.metadata.name} answered ${one.status}`);
    }
  }
  assert.equal(await head(), before, 'no read wrote the keyspace');
  const served = (await (await app.request('/api/agents/implementer?origin=user')).json()) as Agent;
  assert.match(served.metadata.resourceVersion, /^\d+$/);
  assert.equal(await head(), before, 'nor did the read of the agent');
  const put = await app.request('/api/agents/implementer', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metadata: { resourceVersion: served.metadata.resourceVersion }, spec: { ...served.spec, instructions: 'Build it.' } }),
  });
  assert.equal(put.status, 200, await put.clone().text());
  assert.ok((await head()) > before, 'the writer swept the index once it had written');
});
