/**
 * Discovery served (`GET /api`, src/discovery/discovery.ts): an APIResourceList of nemia/v1 naming every kind once under its plural, with
 * its scope and its verbs as its routes serve them, each sub-resource beside it, and no resource of a plural no kind has; and every
 * resource said to list answering a GET of its collection.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, APIResourceList, KINDS, RESOURCE_PLURALS } from 'objects';
import { app } from '../app.ts';

const discovered = async () => {
  const res = await app.request('/api');
  assert.equal(res.status, 200);
  return Schema.decodeUnknownSync(APIResourceList)(await res.json());
};

const resource = (list: typeof APIResourceList.Type, name: string) => list.resources.find((r) => r.name === name);

test('GET /api lists every kind once under its plural, in nemia/v1', async () => {
  const list = await discovered();
  assert.equal(list.groupVersion, API_VERSION);
  for (const kind of KINDS) {
    const named = list.resources.filter((r) => r.name === RESOURCE_PLURALS[kind]);
    assert.equal(named.length, 1, `${kind} once`);
    assert.equal(named[0]?.kind, kind);
    assert.equal(named[0]?.singularName, kind.toLowerCase());
  }
});

test('each resource says its scope and the verbs its routes serve, sub-resources included, and no builtin', async () => {
  const list = await discovered();
  const verbs = (name: string) => [...(resource(list, name)?.verbs ?? [])].sort();
  assert.deepEqual(verbs('runs'), ['create', 'delete', 'get', 'list', 'watch']);
  assert.equal(resource(list, 'runs')?.namespaced, true);
  assert.deepEqual(verbs('runs/hold'), ['create', 'delete']);
  assert.deepEqual(verbs('cards'), ['create', 'delete', 'get', 'list', 'update', 'watch']);
  assert.deepEqual(verbs('cards/start'), ['create']);
  assert.equal(resource(list, 'factories')?.namespaced, false);
  assert.deepEqual(verbs('templates/workflows'), ['get']);
  assert.equal(
    list.resources.some((r) => r.name.startsWith('builtin')),
    false,
    'a plural no kind has is listed by none',
  );
});

test('every resource said to list answers a GET of its collection', async () => {
  const list = await discovered();
  for (const r of list.resources.filter((r) => r.verbs.includes('list'))) {
    const url = r.namespaced ? `/api/namespaces/default/${r.name}` : `/api/${r.name}`;
    assert.equal((await app.request(url)).status, 200, url);
  }
});
