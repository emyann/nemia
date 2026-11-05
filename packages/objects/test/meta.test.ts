/**
 * What every kind shares (`src/meta.ts`): an object's metadata and a page of a list of it, encoded to JSON and decoded back equal, and a
 * list whose `kind` or `apiVersion` is not its own refused at decode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, DEFAULT_NAMESPACE, ObjectMeta, listOf } from 'objects';

const Thing = Schema.Struct({ apiVersion: Schema.Literal(API_VERSION), kind: Schema.Literal('Thing'), metadata: ObjectMeta });
const ThingList = listOf('Thing', Thing);

const page = {
  apiVersion: API_VERSION,
  kind: 'ThingList',
  metadata: { continue: 'b', remainingItemCount: 3 },
  items: [
    {
      apiVersion: API_VERSION,
      kind: 'Thing',
      metadata: {
        name: 'a',
        namespace: DEFAULT_NAMESPACE,
        labels: { team: 'x' },
        creationTimestamp: '2026-11-04T00:00:00.000Z',
        resourceVersion: '7',
        generation: 2,
      },
    },
    {
      apiVersion: API_VERSION,
      kind: 'Thing',
      metadata: { name: 'b', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: '1' },
    },
  ],
} as const;

test('a page of a list decodes from JSON and encodes back to the same JSON, its optional keys absent where they were', () => {
  const decoded = Schema.decodeUnknownSync(ThingList)(JSON.parse(JSON.stringify(page)));
  assert.deepEqual(JSON.parse(JSON.stringify(Schema.encodeSync(ThingList)(decoded))), page);
  assert.equal('namespace' in decoded.items[1].metadata, false);
});

test('the constants are the ones every kind is served under', () => {
  assert.equal(API_VERSION, 'nemia/v1');
  assert.equal(DEFAULT_NAMESPACE, 'default');
});

test('REFUSED: a list whose kind is another kind’s, or whose apiVersion is not this one', () => {
  const decode = Schema.decodeUnknownSync(ThingList);
  assert.throws(() => decode({ ...page, kind: 'Thing' }));
  assert.throws(() => decode({ ...page, apiVersion: 'nemia/v2' }));
  assert.throws(() => decode({ ...page, metadata: { continue: 1 } }));
});
