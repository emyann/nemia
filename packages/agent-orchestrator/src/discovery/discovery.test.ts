/**
 * A route of the `Api` as discovery reads its path (`routeOf`, discovery.ts): the plural after `/api/` or after a namespace, whether a
 * name follows it, and the words after it with the names left out; null for a method discovery does not read or a path outside `/api/`.
 * What discovery says of the routes once read is `resourcesOf`'s, proved by contracts/discovery.contract.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOf } from './discovery.ts';

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
