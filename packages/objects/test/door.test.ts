/**
 * The door (`src/api.ts`): every kind in `KINDS` is served — its object Schema says `nemia/v1` and its kind, and the Api gets one of it —
 * and every kind but the Run has its `<Kind>List`, answered by a list endpoint of the Api. The Run's list is a later intent.
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

/** The literal the `kind` key of a struct's AST says, read off the AST since an annotated struct keeps no `fields`. */
type StructAst = { propertySignatures?: ReadonlyArray<{ name: PropertyKey; type: { literal?: unknown } }> };
const kindOf = (schema: { ast: unknown }): unknown =>
  (schema.ast as StructAst).propertySignatures?.find((p) => p.name === 'kind')?.type.literal;

/** Each endpoint of the Api, by its method, its path and the kinds its answers say. */
const answers = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
    kinds: [...endpoint.success].map(kindOf),
  })),
);

/**
 * The path a kind's objects are got at: the Run by its id, the Factory, which no namespace holds, by its name, and every other kind by
 * its namespace and name.
 */
const GET_PATHS: Record<(typeof KINDS)[number], string> = {
  Run: '/api/runs/:runId',
  Card: '/api/namespaces/:namespace/cards/:name',
  Factory: '/api/factories/:name',
  McpServer: '/api/namespaces/:namespace/mcpservers/:name',
  Schedule: '/api/namespaces/:namespace/schedules/:name',
  Hire: '/api/namespaces/:namespace/hires/:name',
  Volume: '/api/namespaces/:namespace/volumes/:name',
};

/** The kinds whose list is a later intent. */
const UNLISTED: ReadonlyArray<(typeof KINDS)[number]> = ['Run'];

for (const kind of KINDS) {
  test(`${kind} has an object Schema saying apiVersion ${API_VERSION} and kind ${kind}, and a get endpoint`, () => {
    const fields = schemaOf(kind)?.fields;
    assert.equal(fields?.apiVersion?.literal, API_VERSION);
    assert.equal(fields?.kind?.literal, kind);
    assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === GET_PATHS[kind]));
  });
}

for (const kind of KINDS.filter((k) => !UNLISTED.includes(k))) {
  test(`${kind} has its ${kind}List, of kind ${kind}List, which a GET of the Api answers, and its get answers a ${kind}`, () => {
    assert.equal(schemaOf(`${kind}List`)?.fields?.kind?.literal, `${kind}List`);
    assert.ok(answers.some((e) => e.method === 'GET' && e.kinds.includes(`${kind}List`)));
    assert.ok(answers.some((e) => e.method === 'GET' && e.path === GET_PATHS[kind] && e.kinds.includes(kind)));
  });
}

test('the builtin MCP servers are a McpServerList, at their own path', () => {
  assert.ok(answers.some((e) => e.method === 'GET' && e.path === '/api/builtin/mcpservers' && e.kinds.includes('McpServerList')));
});

test("a factory's sub-resources are served under its path: rules, instruction, its words, and its commands", () => {
  for (const [method, path] of [
    ['GET', '/api/factories'],
    ['GET', '/api/factories/:name/rules'],
    ['PUT', '/api/factories/:name/rules'],
    ['DELETE', '/api/factories/:name/rules'],
    ['GET', '/api/factories/:name/instruction'],
    ['PUT', '/api/factories/:name/instruction'],
    ['DELETE', '/api/factories/:name/instruction'],
    ['PUT', '/api/factories/:name/instruction/words'],
    ['DELETE', '/api/factories/:name/instruction/words'],
    ['GET', '/api/factories/:name/commands'],
    ['POST', '/api/namespaces/:namespace/mcpservers/:name/sign-in'],
    ['GET', '/api/namespaces/:namespace/mcpservers/:name/sign-in'],
    ['DELETE', '/api/namespaces/:namespace/mcpservers/:name/sign-in'],
  ] as const)
    assert.ok(
      endpoints.some((e) => e.method === method && e.path === path),
      `${method} ${path}`,
    );
});

test('the namespaced kinds a person writes take PUT and DELETE by name; a Volume is read-only over the api', () => {
  for (const kind of ['mcpservers', 'schedules', 'hires'])
    for (const method of ['PUT', 'DELETE'])
      assert.ok(
        endpoints.some((e) => e.method === method && e.path === `/api/namespaces/:namespace/${kind}/:name`),
        `${method} ${kind}`,
      );
  assert.ok(!endpoints.some((e) => e.method !== 'GET' && e.path.includes('/volumes')));
});

test('Card has its CardList, of kind CardList, and list endpoints across namespaces and in one', () => {
  assert.equal(schemaOf('CardList')?.fields?.kind?.literal, 'CardList');
  assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === '/api/cards'));
  assert.ok(endpoints.some((e) => e.method === 'GET' && e.path === '/api/namespaces/:namespace/cards'));
});

test("the Run's list (RunList and its endpoint) is a later intent: the door has neither yet", () => {
  assert.equal(schemaOf('RunList'), undefined);
  assert.ok(!endpoints.some((e) => e.method === 'GET' && e.path === '/api/runs'));
});
