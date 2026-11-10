/**
 * Every route the api serves is read off `objects`' `Api`, and every other is named here, both ways. Each endpoint of the `Api` is served
 * by the mount (`mount`, src/objects/serve.ts): asked with its names filled in, it answers something other than the api's 404 for a path no
 * route serves (`noRoute`) and other than a 500 with no words — a stream it opens (`text/event-stream`) is served, and let go unread — so
 * an endpoint the `Api` gains with no handler, or one a Hono route before the mount shadows, is refused here with nothing to list. The
 * routes Hono serves itself are exactly the three of the OpenAPI document (`META`, kept outside the `Api` as Kubernetes keeps
 * `/openapi/v3` out of its own).
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { Api } from 'objects';
import { app } from '../src/app.ts';

/** The OpenAPI document, its page and the page's script: served by Hono beside the mount, outside the `Api` they describe. */
const META = ['GET /openapi/v3/nemia/v1', 'GET /openapi', 'GET /openapi/scalar.js'] as const;

/** Each route Hono serves as `METHOD path`, once, but middleware and the mount (`ALL`), which serve no route of their own. */
const routesOf = (routes: readonly { method: string; path: string }[]): string[] => [
  ...new Set(routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`)),
];

/** Where the routes Hono serves and those `listed` (`META`) disagree, a sentence each naming the fix. */
function outsideBreaks(routes: readonly { method: string; path: string }[], listed: readonly string[] = META): string[] {
  const served = routesOf(routes);
  const named = new Set<string>(listed);
  return [
    ...served
      .filter((r) => !named.has(r))
      .map(
        (r) =>
          `${r} is served by Hono and is no route of the Api: declare it on objects' Api with its handler and take its line out of app.ts, or it is one of META.`,
      ),
    ...[...named]
      .filter((r) => !served.includes(r))
      .map((r) => `${r} is listed, and Hono serves no such route: serve it, or take it off META.`),
  ];
}

/** Every endpoint of the `Api`: its group, its name, its method and its path. */
const ENDPOINTS = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).map((e) => ({ group: group.identifier, name: e.name, method: e.method, path: e.path })),
);

/** `path` with every name filled in by one no object has, so a read finds nothing and a write refuses. */
const filled = (path: string): string => path.replace(/:[A-Za-z]+/g, 'nothing-here');

/** Whether `body` is the api's 404 for a path no route serves (`noRoute`), by the words it says that in. */
const saysNoRoute = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && 'error' in body && String(body.error).includes('is no route of this api');

test('every endpoint of the Api is served by the mount: neither the 404 for no route nor a 500 with no words', async () => {
  assert.ok(ENDPOINTS.length >= 100, `${ENDPOINTS.length} endpoints read off the Api`);
  const unserved: string[] = [];
  for (const { group, name, method, path } of ENDPOINTS) {
    const url = filled(path);
    const res = await app.request(
      url,
      method === 'GET' ? {} : { method, headers: { 'content-type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' },
    );
    const servedOnceItsHeadIs = (res.headers.get('content-type') ?? '').startsWith('text/event-stream');
    if (servedOnceItsHeadIs) await res.body?.cancel();
    const text = servedOnceItsHeadIs ? '' : await res.text();
    const body: unknown = servedOnceItsHeadIs ? true : text === '' ? undefined : JSON.parse(text);
    if ((res.status === 404 && saysNoRoute(body)) || (res.status >= 500 && body === undefined))
      unserved.push(`${group}.${name}: ${method} ${url} answered ${res.status}`);
  }
  assert.deepEqual(unserved, []);
});

test('the routes Hono serves outside the Api are the three of the OpenAPI document, and no other', () => {
  assert.deepEqual(outsideBreaks(app.routes), []);
});

test('REFUSED: a route Hono serves that no list names, and a listed route Hono does not serve', () => {
  const extra = new Hono().get('/api/x', (c) => c.text('x'));
  const more = new Hono().route('/', app).route('/', extra).route('/', extra);
  assert.deepEqual(
    outsideBreaks(more.routes).map((b) => b.split(' is ')[0]),
    ['GET /api/x'],
    'one break, the route no list names, however often it is mounted',
  );
  assert.deepEqual(
    outsideBreaks(app.routes, [...META, 'GET /api/gone']).map((b) => b.split(' is ')[0]),
    ['GET /api/gone'],
  );
});

test("a path no route serves is the api's own 404, the Machines page's retired routes among them, whichever side missed it", async () => {
  for (const url of ['/api/machines', '/api/machines/lifecycle', '/api/namespaces/default/nothing', '/nothing'])
    assert.ok(saysNoRoute(await (await app.request(url)).json()), url);
});
