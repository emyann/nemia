/**
 * The door (`src/api.ts`): every kind in `KINDS` is served — its object Schema says `nemia/v1` and its kind, and the Api gets one of it —
 * and every kind that lists has its `<Kind>List` and a list endpoint. The Run's list is a later intent: today only the Card lists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as objects from 'objects';
import { API_VERSION, Api, KINDS } from 'objects';

/** Each endpoint of the Api, by its method and its path. */
const endpoints = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).map((endpoint) => ({ method: endpoint.method, path: endpoint.path })),
);

/** The object Schema `name` exports, as a struct of fields. */
const schemaOf = (name: string) => (objects as unknown as Record<string, { fields?: Record<string, { literal?: unknown }> }>)[name];

/** The path a kind's objects are got at: the Run by its id, the Card by its namespace and name. */
const GET_PATHS: Record<(typeof KINDS)[number], string> = {
  Run: '/api/runs/:runId',
  Card: '/api/namespaces/:namespace/cards/:name',
};

for (const kind of KINDS) {
  test(`${kind} has an object Schema saying apiVersion ${API_VERSION} and kind ${kind}, and a get endpoint`, () => {
    const fields = schemaOf(kind)?.fields;
    assert.equal(fields?.apiVersion?.literal, API_VERSION);
    assert.equal(fields?.kind?.literal, kind);
    assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === GET_PATHS[kind]));
  });
}

test('Card has its CardList, of kind CardList, and list endpoints across namespaces and in one', () => {
  assert.equal(schemaOf('CardList')?.fields?.kind?.literal, 'CardList');
  assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === '/api/cards'));
  assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === '/api/namespaces/:namespace/cards'));
});

test("the Run's list (RunList and its endpoint) is a later intent: the door has neither yet", () => {
  assert.equal(schemaOf('RunList'), undefined);
  assert.ok(!endpoints.some((e) => e.method === 'GET' && e.path === '/api/runs'));
});
