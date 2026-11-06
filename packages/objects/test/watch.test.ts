/**
 * A watch's events (`src/watch.ts`): an ADDED of a Card and a BOOKMARK decoded through `watchEventOf(WatchedObject)` and encoded back
 * equal, the object's own keys kept; and a type out of `WATCH_EVENT_TYPES` refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, WatchedObject, watchEventOf } from 'objects';

const WatchEvent = watchEventOf(WatchedObject);

const card = {
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: { name: 'c1', namespace: 'default', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: '7' },
  spec: { title: 'a card', body: 'what it asks' },
  status: { runs: [] },
};

test('an ADDED Card decodes and encodes back equal, its spec and status kept', () => {
  const added = { type: 'ADDED', object: card };
  const decoded = Schema.decodeUnknownSync(WatchEvent)(added);
  assert.deepEqual(Schema.encodeSync(WatchEvent)(decoded), added);
});

test('a BOOKMARK carries its kind and a resourceVersion alone, and decodes and encodes back equal', () => {
  const bookmark = { type: 'BOOKMARK', object: { apiVersion: API_VERSION, kind: 'Card', metadata: { resourceVersion: '12' } } };
  const decoded = Schema.decodeUnknownSync(WatchEvent)(bookmark);
  assert.deepEqual(Schema.encodeSync(WatchEvent)(decoded), bookmark);
});

test("a type out of WATCH_EVENT_TYPES ('ERROR') is refused", () => {
  assert.throws(() => Schema.decodeUnknownSync(WatchEvent)({ type: 'ERROR', object: card }));
});
