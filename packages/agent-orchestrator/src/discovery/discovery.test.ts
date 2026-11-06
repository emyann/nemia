/**
 * A route of the `Api` as discovery reads its path (`routeOf`, discovery.ts): the plural after `/api/` or after a namespace, whether a
 * name follows it, and the words after it with the names left out; null for a method discovery does not read or a path outside `/api/`.
 * What discovery says of the routes once read is `resourcesOf`'s: what its contract proves (contracts/discovery.contract.ts), and the
 * laws it leaves out held here whole, over the real `Api` of `objects`, each shown refusing an answer that breaks it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Api, KINDS, RESOURCE_PLURALS } from 'objects';
import { type ApiRoute, type KindPlural, type Resource, type ResourceVerb, resourcesOf, routeOf } from './discovery.ts';

test('each path of the Api reads to its plural, its namespace, its name and its sub-resource', async (t) => {
  const rows: [string, string, ReturnType<typeof routeOf>][] = [
    ['GET', '/api/namespaces/:namespace/cards', { method: 'GET', plural: 'cards', namespaced: true, item: false, sub: null }],
    [
      'POST',
      '/api/namespaces/:namespace/cards/:name/start',
      { method: 'POST', plural: 'cards', namespaced: true, item: true, sub: 'start' },
    ],
    ['GET', '/api/cards', { method: 'GET', plural: 'cards', namespaced: false, item: false, sub: null }],
    ['GET', '/api/factories/:name', { method: 'GET', plural: 'factories', namespaced: false, item: true, sub: null }],
    [
      'GET',
      '/api/runs/:runId/steps/:step/tries/:try/closeout',
      { method: 'GET', plural: 'runs', namespaced: false, item: true, sub: 'steps/tries/closeout' },
    ],
    ['GET', '/api/templates/:name/workflows/:doc', { method: 'GET', plural: 'templates', namespaced: false, item: true, sub: 'workflows' }],
    ['GET', '/api/builtin/mcpservers', { method: 'GET', plural: 'builtin', namespaced: false, item: false, sub: 'mcpservers' }],
    ['DELETE', '/api/namespaces/:namespace/runs/:name', { method: 'DELETE', plural: 'runs', namespaced: true, item: true, sub: null }],
    ['GET', '/api', null],
    ['GET', '/api/', null],
    ['GET', '/healthz', null],
    ['GET', '/apis/cards', null],
    ['HEAD', '/api/cards', null],
    ['OPTIONS', '/api/cards', null],
    ['get', '/api/cards', null],
    ['GET', '/api/:name', null],
    ['GET', '/api/cards//start', null],
  ];
  for (const [method, path, route] of rows) await t.test(`${method} ${path}`, () => assert.deepEqual(routeOf(method, path), route));
});

/** Every verb discovery says, in Kubernetes' words. */
const VERBS: readonly ResourceVerb[] = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

/** Whether `route` does `verb` of the kind its plural names: the collection lists, watches and creates; one by its name the rest. */
const kindDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  route.sub === null &&
  (route.item
    ? { get: 'GET', update: 'PUT', patch: 'PATCH', delete: 'DELETE' }[verb as string] === route.method
    : route.method === 'GET'
      ? verb === 'list' || verb === 'watch'
      : route.method === 'POST' && verb === 'create');

/** Whether `route`, a sub-resource's, does `verb`: its method's verb alone. */
const subDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  route.sub !== null && { GET: 'get', POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' }[route.method] === verb;

/**
 * Each law the contract leaves out until tsverify card `src-a-filter-s-result-is-pro-p25m` restores it, broken by `output`: every kind
 * listed once under its plural, nothing listed that no kind's route serves, every sub-resource listed once, and each resource's verbs
 * exactly what its routes do.
 */
const broken = (routes: readonly ApiRoute[], kinds: readonly KindPlural[], output: readonly Resource[]): string[] => {
  const named = (name: string) => output.filter((r) => r.name === name);
  const subsOf = (k: KindPlural) => [
    ...new Set(routes.filter((t) => t.plural === k.plural && t.sub !== null).map((t) => `${k.plural}/${t.sub}`)),
  ];
  const routesOf = (r: Resource) =>
    routes.filter((t) =>
      kinds.some(
        (k) => k.kind === r.kind && t.plural === k.plural && (r.name === k.plural ? t.sub === null : `${k.plural}/${t.sub}` === r.name),
      ),
    );
  return [
    ...kinds
      .filter((k) => named(k.plural).length !== 1 || named(k.plural)[0]?.kind !== k.kind)
      .map((k) => `${k.kind} not once under ${k.plural}`),
    ...output
      .filter((r) => !kinds.some((k) => k.kind === r.kind && (r.name === k.plural || subsOf(k).includes(r.name))))
      .map((r) => `${r.name} is served by no kind`),
    ...kinds.flatMap((k) =>
      subsOf(k)
        .filter((name) => named(name).length !== 1 || named(name)[0]?.kind !== k.kind)
        .map((name) => `${name} not once`),
    ),
    ...output.flatMap((r) =>
      VERBS.filter((v) => r.verbs.includes(v) !== routesOf(r).some((t) => (r.name.includes('/') ? subDoes(t, v) : kindDoes(t, v)))).map(
        (v) => `${r.name}: ${v} ${r.verbs.includes(v) ? 'said, though no route does it' : 'done by a route, not said'}`,
      ),
    ),
  ];
};

/** The routes the `Api` of `objects` serves, read as discovery reads them, and its kinds by their plurals. */
const served = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).flatMap((e) => {
    const route = routeOf(e.method, e.path);
    return route === null ? [] : [route];
  }),
);
const kinds: KindPlural[] = KINDS.map((kind) => ({ kind, plural: RESOURCE_PLURALS[kind] }));

test('over the real Api: every kind once under its plural, every sub-resource once, nothing unserved, verbs exactly what routes do', () => {
  assert.deepEqual(broken(served, kinds, resourcesOf(served, kinds)), []);
});

test('REFUSED: an answer that breaks each of those laws is found', () => {
  const right = resourcesOf(served, kinds);
  const cards = right.find((r) => r.name === 'cards');
  assert.ok(cards);
  const misses = [
    broken(
      served,
      kinds,
      right.filter((r) => r.name !== 'cards'),
    ),
    broken(served, kinds, [...right, { name: 'builtin', kind: 'McpServer', namespaced: false, verbs: ['list'] }]),
    broken(
      served,
      kinds,
      right.filter((r) => r.name !== 'cards/start'),
    ),
    broken(
      served,
      kinds,
      right.map((r) => (r === cards ? { ...r, verbs: r.verbs.filter((v) => v !== 'watch') } : r)),
    ),
  ];
  assert.deepEqual(
    misses.map((m) => m.length > 0),
    [true, true, true, true],
    'a kind left out, a plural no kind has, a sub-resource left out, and a verb a route does left unsaid are each found',
  );
});
