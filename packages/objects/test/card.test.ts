/**
 * The Card (`src/card.ts`): a card and a page of cards encoded to JSON and decoded back equal, its optional keys absent where they were;
 * its state a closed word; and the bodies of its verbs decoded as the api is sent them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, CARD_STATES, Card, CardFile, CardList, CardStart, LabelEdit } from 'objects';

const filed = {
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: {
    name: 'cache-the-views',
    namespace: 'a',
    labels: { team: 'core' },
    creationTimestamp: '2026-11-04T00:00:00.000Z',
    resourceVersion: 'd1',
  },
  spec: { workflow: 'build', gate: 'design', from: ['r-1'], queued: '2026-11-04T01:00:00.000Z', body: 'Cache the views.\n' },
  status: {
    state: 'refused',
    runs: [],
    lastStart: { at: '2026-11-04T02:00:00.000Z', repo: '/repo', why: 'no workflow build', refused: true },
    title: 'Cache the views.',
  },
} as const;

const broken = {
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: { name: 'broken', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'd2' },
  spec: {},
  status: { state: 'filed', runs: [], error: 'broken.md: a key it does not have' },
} as const;

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a card and a page of cards decode from JSON and encode back to the same JSON, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Card, filed), filed);
  assert.deepEqual(roundTrip(Card, broken), broken);
  const page = {
    apiVersion: API_VERSION,
    kind: 'CardList',
    metadata: { continue: 'YnJva2Vu', remainingItemCount: 1 },
    items: [filed, broken],
  };
  assert.deepEqual(roundTrip(CardList, page), page);
});

test("the card's states are its own three words, then the run phases in their order", () => {
  assert.deepEqual(CARD_STATES, [
    'filed',
    'queued',
    'refused',
    'pending',
    'running',
    'waiting',
    'succeeded',
    'failed',
    'stopped',
    'cancelled',
  ]);
});

test("the verbs' bodies decode as the api is sent them", () => {
  const file = { body: 'An idea', workflow: 'build', from: 'repo', repo: '/repo', factory: 'a', label: ['team=core'] };
  assert.deepEqual(roundTrip(CardFile, file), file);
  const start = { workflow: 'build', after: ['r-1'], context: ['r-2'], brief: 'do it', label: ['team=core', 'old-'] };
  assert.deepEqual(roundTrip(CardStart, start), start);
  assert.deepEqual(roundTrip(LabelEdit, { labels: ['team=core'], overwrite: true }), { labels: ['team=core'], overwrite: true });
});

test('REFUSED: a card whose state is no card state, whose kind is another, or a filing with no body', () => {
  const decode = Schema.decodeUnknownSync(Card);
  assert.throws(() => decode({ ...filed, status: { ...filed.status, state: 'landed' } }));
  assert.throws(() => decode({ ...filed, kind: 'Run' }));
  assert.throws(() => Schema.decodeUnknownSync(CardFile)({ workflow: 'build' }));
  assert.throws(() => Schema.decodeUnknownSync(CardFile)({ body: 'x', from: 'elsewhere' }));
});
