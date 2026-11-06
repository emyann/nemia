/**
 * Discovery's words (`src/discovery.ts`, `RESOURCE_PLURALS` in `src/api.ts`): every kind of `KINDS` has one plural, no plural is given
 * twice, each plural is the collection of a GET list endpoint of `Api`, and `DiscoveryGroup` answers GET /api with an APIResourceList.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, APIResourceList, Api, KINDS, RESOURCE_PLURALS } from 'objects';

/** Every endpoint of the Api, by method and path. */
const endpoints = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).map((e) => ({ method: e.method, path: e.path })),
);

test('every kind has one plural, and no plural is given twice', () => {
  assert.deepEqual(Object.keys(RESOURCE_PLURALS).sort(), [...KINDS].sort());
  const plurals = Object.values(RESOURCE_PLURALS);
  assert.equal(new Set(plurals).size, plurals.length);
});

test('each plural is the collection a GET endpoint of the Api lists', () => {
  for (const plural of Object.values(RESOURCE_PLURALS)) {
    const listed = endpoints.some(
      (e) => e.method === 'GET' && (e.path === `/api/${plural}` || e.path === `/api/namespaces/:namespace/${plural}`),
    );
    assert.ok(listed, `${plural}: no GET list endpoint`);
  }
});

test('DiscoveryGroup is in the Api at GET /api', () => {
  assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === '/api'));
});

test('an APIResourceList decodes, and a verb out of RESOURCE_VERBS is refused', () => {
  const list = {
    apiVersion: API_VERSION,
    kind: 'APIResourceList',
    groupVersion: API_VERSION,
    resources: [{ name: 'cards', singularName: 'card', namespaced: true, kind: 'Card', verbs: ['get', 'list', 'watch'] }],
  };
  assert.deepEqual(Schema.encodeSync(APIResourceList)(Schema.decodeUnknownSync(APIResourceList)(list)), list);
  const wrong = { ...list, resources: [{ ...list.resources[0], verbs: ['proxy'] }] };
  assert.throws(() => Schema.decodeUnknownSync(APIResourceList)(wrong));
});
