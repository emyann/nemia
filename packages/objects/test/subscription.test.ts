/**
 * The Subscription (`src/subscription.ts`): a subscription with a digest pending and one with nothing, and a page of them, as the Api's
 * endpoints answer them, every key kept; a scope that is no level, and another kind, refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Subscription } from 'objects';
import { answered } from './served.ts';

const pending = {
  apiVersion: API_VERSION,
  kind: 'Subscription',
  metadata: { name: 'watcher', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: 'v1' },
  spec: { task: 'nemia-watcher', selectors: ['reason=Failed', 'waits=person'], digestEvery: 30, scope: { atLeast: 'semi-auto' } },
  status: { from: 0, cursor: 1200, pending: 3, since: '2026-11-05T10:05:00.000Z' },
} as const;

const quiet = {
  apiVersion: API_VERSION,
  kind: 'Subscription',
  metadata: { name: 'quiet', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: 'v2' },
  spec: { task: 'nemia-quiet', selectors: ['type=Warning'], digestEvery: 60 },
  status: { from: 400, cursor: 400, pending: 0, error: 'the delivery file does not parse' },
} as const;

test("the Api's get answers a subscription and its list a page of them, every key kept, absent keys left absent", () => {
  assert.deepEqual(answered('subscriptions', 'get', pending), pending);
  assert.deepEqual(answered('subscriptions', 'get', quiet), quiet);
  const page = { apiVersion: API_VERSION, kind: 'SubscriptionList', metadata: {}, items: [pending, quiet] };
  assert.deepEqual(answered('subscriptions', 'listAll', page), page);
  assert.equal(answered('subscriptions', 'get', { ...pending, kind: 'Event' }), undefined);
  assert.equal(answered('subscriptions', 'listAll', { ...page, kind: 'EventList' }), undefined);
});

test('REFUSED: a scope whose atLeast is no level', () => {
  assert.throws(() => Schema.decodeUnknownSync(Subscription)({ ...pending, spec: { ...pending.spec, scope: { atLeast: 'turbo' } } }));
});
