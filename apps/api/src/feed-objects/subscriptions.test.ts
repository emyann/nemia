/**
 * The subscriptions group served (src/objects): a subscription the api's own route put is listed and read as a Subscription, its status
 * where the deliverer is (at its start, with nothing delivered yet), and one nobody put is a 404; the subscribe and unsubscribe routes
 * answer as they did.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer, Schema } from 'effect';
import { engine } from 'agent-orchestrator';
import { Subscription, SubscriptionList } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { Engine } from '../store.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

/** An app whose engine has filed one long-lived task, `watcher`. */
const app = appOf(
  Layer.merge(
    liveOf(),
    Layer.succeed(Engine)({
      ...engine(),
      view: (id: string) =>
        Effect.succeed({
          id,
          phase: 'pending',
          state: { settled: null, filedAt: '2026-11-05T10:00:00.000Z', restartPolicy: 'Always' },
        }),
    } as never),
  ),
).app;

test('a subscription put by POST is listed and read as an object; DELETE still answers { name }', async () => {
  const put = await app.request('/api/subscriptions/news', {
    method: 'POST',
    headers: BOARD,
    body: JSON.stringify({ task: 'watcher', selectors: ['reason=Failed'], digestEvery: 15 }),
  });
  assert.equal(put.status, 201);
  const list = await app.request('/api/subscriptions');
  assert.equal(list.status, 200);
  const items = Schema.decodeUnknownSync(SubscriptionList)(await list.json()).items;
  assert.deepEqual(
    items.map((o) => o.metadata.name),
    ['news'],
  );
  const one = await app.request('/api/subscriptions/news');
  assert.equal(one.status, 200);
  const news = Schema.decodeUnknownSync(Subscription)(await one.json());
  assert.deepEqual(news.spec, { task: 'watcher', selectors: ['reason=Failed'], digestEvery: 15 });
  assert.deepEqual(news.status, { from: 0, cursor: 0, pending: 0 }, 'nothing delivered yet: the deliverer is at its start');
  assert.equal(news.metadata.namespace, undefined, 'a subscription is in no namespace');
  const gone = await app.request('/api/subscriptions/news', { method: 'DELETE', headers: BOARD });
  assert.deepEqual(await gone.json(), { name: 'news' });
  assert.equal((await app.request('/api/subscriptions/news')).status, 404);
});

test('a limit that is no whole number from 1 is 422', async () => {
  assert.equal((await app.request('/api/subscriptions?limit=0')).status, 422);
});
