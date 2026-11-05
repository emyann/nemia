/**
 * The Subscription (`src/subscription.ts`): a subscription with a digest pending and one with nothing, and a page of them, decoded from
 * JSON and encoded back equal; a scope that is no level refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Subscription, SubscriptionList } from 'objects';

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

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a subscription and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Subscription, pending), pending);
  assert.deepEqual(roundTrip(Subscription, quiet), quiet);
  const page = { apiVersion: API_VERSION, kind: 'SubscriptionList', metadata: {}, items: [pending, quiet] };
  assert.deepEqual(roundTrip(SubscriptionList, page), page);
});

test('REFUSED: a scope whose atLeast is no level', () => {
  assert.throws(() => Schema.decodeUnknownSync(Subscription)({ ...pending, spec: { ...pending.spec, scope: { atLeast: 'turbo' } } }));
});
