/**
 * The lists of workflows as the pages keep them, by place (src/lib/placed.ts): what a page loads before it lists the workflows of the
 * address's place, and what a write of a folder of yours reads again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import type { Factory } from 'objects';
import { loadWorkflowsIn, rereadWorkflows } from '../src/lib/placed.ts';
import { factoryCommands, factoryList, factoryObject, scheduleList } from './factory-fixtures.ts';

/** A factory as the objects list it, on `repos`. */
const factory = (name: string, repos: string[]) =>
  factoryObject({ metadata: { name }, spec: { repos, workflows: [], hires: {}, volumes: [] } });

/**
 * Answers every fetch of the test `t`: the factories with `factories`, each factory's lines and schedules, any other route with no
 * workflow; returns the routes asked but a factory's lines and schedules, which the factories' read asks beside its list.
 */
function answering(t: { after: (fn: () => void) => void }, factories: Factory[]): string[] {
  const asked: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const body = url.startsWith('/api/factories/')
      ? factoryCommands()
      : url.startsWith('/api/namespaces/')
        ? scheduleList()
        : url.split('?')[0] === '/api/factories'
          ? factoryList(...factories)
          : [];
    if (!url.startsWith('/api/factories/') && !url.startsWith('/api/namespaces/')) asked.push(url);
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return asked;
}

test("REFUSED: a write of a folder of yours reads again the list read with no factory and every factory's — never a step's page keyed under it", async () => {
  const client = new QueryClient();
  const step = ['workflows', 'yours', 'mine', 'plan', null, null];
  const kept = [['workflows'], ['factory-workflows', 'pipao', '/code/pipao'], ['factory-workflows', 'quay', '/a'], step];
  for (const key of kept) client.setQueryData(key, []);
  await rereadWorkflows(client);
  const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
  assert.equal(stale(kept[0]), true, 'the list the builder drafts from');
  assert.equal(stale(kept[1]), true, "a factory's list, which its page draws from");
  assert.equal(stale(kept[2]), true, "and every other factory's");
  assert.equal(stale(step), false, "a step's page is read again on its own visit");
});

test('REFUSED: a page loads the list of its place — with no factory the one read with none; in a factory, its own; and none for a factory that reads nowhere', async (t) => {
  const asked = answering(t, [factory('pipao', ['/code/pipao']), factory('quay', ['/a', '/b'])]);
  const loaded = async (address: { factory?: string; repo?: string }) => {
    asked.length = 0;
    await loadWorkflowsIn(new QueryClient(), address);
    return [...asked].sort();
  };
  assert.deepEqual(await loaded({}), ['/api/factories', '/api/workflows']);
  assert.deepEqual(await loaded({ factory: 'default' }), ['/api/factories', '/api/workflows']);
  assert.deepEqual(await loaded({ factory: 'pipao' }), ['/api/factories', '/api/workflows?factory=pipao&repo=%2Fcode%2Fpipao']);
  assert.deepEqual(await loaded({ factory: 'quay', repo: '/b' }), ['/api/factories', '/api/workflows?factory=quay&repo=%2Fb']);
  assert.deepEqual(await loaded({ factory: 'quay' }), ['/api/factories'], 'several repositories and none named: no list is guessed');
  assert.deepEqual(await loaded({ factory: 'gone' }), ['/api/factories'], 'no factory of that name: no list');
});
