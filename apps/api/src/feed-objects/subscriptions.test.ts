/**
 * The subscriptions group served (src/feed-objects): a subscription in the store is listed and read as a Subscription, its spec its file's
 * and its status where the deliverer is — at its start, nothing delivered — and one
 * nobody put is a 404; `DELETE /api/subscriptions/:name`, the api's own route, still answers `{ name }`.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Subscription, SubscriptionList } from 'objects';
import { app } from '../app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const folder = path.join(root, 'subscriptions');

/** A subscription's file, as `nemia subscribe` writes one. */
const subscribe = (name: string, task: string, from = 0): void => {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify({ task, selectors: ['reason=Failed'], digestEvery: 15, from }));
};

test('a subscription in the store is listed and read as an object; DELETE still answers { name }', async () => {
  subscribe('news', 'watcher');
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
