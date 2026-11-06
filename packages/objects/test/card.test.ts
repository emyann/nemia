/**
 * The Card (`src/card.ts`): a card and a page of cards encoded to JSON and decoded back equal, its optional keys absent where they were;
 * its state a closed word; and the bodies of its verbs decoded as the api is sent them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { OpenApi } from 'effect/http-api';
import {
  API_VERSION,
  Api,
  CARD_KEYS,
  CARD_KEY_MEANINGS,
  CARD_STATES,
  Card,
  CardFile,
  CardList,
  CardStart,
  CardWrite,
  LabelEdit,
} from 'objects';

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
    inPlay: true,
    place: 1,
  },
} as const;

const broken = {
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: { name: 'broken', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'd2' },
  spec: {},
  status: { state: 'filed', runs: [], error: 'broken.md: a key it does not have', inPlay: true },
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

test("a card's whole write decodes as the api is sent it, and refuses a spec.from that is no list of ids", () => {
  const write = { metadata: { resourceVersion: 'd1', labels: { team: 'core' } }, spec: { workflow: 'build', from: ['r-1'], body: 'x\n' } };
  assert.deepEqual(Schema.decodeUnknownSync(CardWrite)(write), write);
  assert.deepEqual(Schema.decodeUnknownSync(CardWrite)({ metadata: {}, spec: {} }), { metadata: {}, spec: {} });
  assert.throws(() => Schema.decodeUnknownSync(CardWrite)({ metadata: {}, spec: { from: [1] } }));
  assert.throws(() => Schema.decodeUnknownSync(CardWrite)({ spec: {} }));
});

test("a read of one card carries its file as written in status.source; a list's items need none", () => {
  const one = { ...filed, status: { ...filed.status, source: '---\nworkflow: build\n---\nCache the views.\n' } };
  assert.deepEqual(roundTrip(Card, one), one);
  assert.deepEqual(roundTrip(Card, filed), filed);
});

test("each of a card's keys has one meaning, and the Card's spec fields carry theirs as the document's description", () => {
  assert.deepEqual(Object.keys(CARD_KEY_MEANINGS), [...CARD_KEYS]);
  for (const key of CARD_KEYS) assert.ok(CARD_KEY_MEANINGS[key].length > 0, key);
  const schemas = OpenApi.fromApi(Api).components.schemas as Record<string, any>;
  const resolve = (s: any): any => (s?.$ref ? resolve(schemas[s.$ref.split('/').pop()]) : s);
  const spec = resolve(resolve(schemas['Card']).properties.spec);
  for (const key of ['workflow', 'repo', 'gate', 'from', 'queued'] as const)
    assert.equal(spec.properties[key].description, CARD_KEY_MEANINGS[key], key);
});
