/**
 * The Card (`src/card.ts`): a card and a page of cards as the Api's endpoints answer them, every key kept, its optional keys absent where
 * they were; its state a closed word; and the bodies of its verbs as the Api's endpoints take them. Beside them, the namespace a client
 * files an idea in (`filedNamespace`).
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { OpenApi } from 'effect/http-api';
import { API_VERSION, Api, CARD_KEYS, CARD_KEY_MEANINGS, CARD_STATES, Card, CardEdit, CardFile, CardWrite, filedNamespace } from 'objects';
import { answered, taken } from './served.ts';

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

test("the Api's get answers a card and its list a page of cards, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('cards', 'get', filed), filed);
  assert.deepEqual(answered('cards', 'get', broken), broken);
  const page = {
    apiVersion: API_VERSION,
    kind: 'CardList',
    metadata: { continue: 'YnJva2Vu', remainingItemCount: 1 },
    items: [filed, broken],
  };
  assert.deepEqual(answered('cards', 'list', page), page);
  assert.equal(answered('cards', 'get', { ...filed, kind: 'Run' }), undefined);
  assert.equal(answered('cards', 'list', { ...page, kind: 'RunList' }), undefined);
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

test("the verbs' bodies are taken by the Api's endpoints as the api is sent them, and a body of another verb is refused", () => {
  const file = { body: 'An idea', workflow: 'build', from: 'repo', repo: '/repo', factory: 'a', label: ['team=core'] };
  assert.deepEqual(taken('cards', 'create', file), file);
  const start = { workflow: 'build', after: ['r-1'], context: ['r-2'], brief: 'do it', label: ['team=core', 'old-'] };
  assert.deepEqual(taken('cards', 'start', start), start);
  assert.deepEqual(taken('cards', 'labels', { labels: ['team=core'], overwrite: true }), { labels: ['team=core'], overwrite: true });
  assert.equal(taken('cards', 'create', start), undefined);
  assert.equal(taken('cards', 'labels', file), undefined);
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

test("a card's edit decodes its text, with or without the version it was read at, and refuses one with no text", () => {
  const edit = { source: '---\nworkflow: build\n---\nCache the views.\n', resourceVersion: 'd1' };
  assert.deepEqual(Schema.decodeUnknownSync(CardEdit)(edit), edit);
  assert.deepEqual(Schema.decodeUnknownSync(CardEdit)({ source: 'x' }), { source: 'x' });
  assert.throws(() => Schema.decodeUnknownSync(CardEdit)({ resourceVersion: 'd1' }));
  assert.throws(() => Schema.decodeUnknownSync(CardEdit)({ source: 1 }));
});

test("a read of one card carries its file as written in status.source; a list's items need none", () => {
  const one = { ...filed, status: { ...filed.status, source: '---\nworkflow: build\n---\nCache the views.\n' } };
  assert.deepEqual(answered('cards', 'get', one), one);
  assert.deepEqual(answered('cards', 'get', filed), filed);
});

test("each of a card's keys has one meaning, and the Card's spec fields carry theirs as the document's description", () => {
  assert.deepEqual(Object.keys(CARD_KEY_MEANINGS), [...CARD_KEYS]);
  for (const key of CARD_KEYS) assert.ok(CARD_KEY_MEANINGS[key].length > 0, key);
  const schemas = OpenApi.fromApi(Api).components.schemas as Record<string, any>;
  // oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
  const resolve = (s: any): any => (s?.$ref ? resolve(schemas[s.$ref.split('/').pop()]) : s);
  const spec = resolve(resolve(schemas['Card']).properties.spec);
  for (const key of ['workflow', 'repo', 'gate', 'model', 'from', 'queued'] as const)
    assert.equal(spec.properties[key].description, CARD_KEY_MEANINGS[key], key);
});

test("filedNamespace: the factory given, else the idea's own factory: line, else default", () => {
  const rows: [string, string | undefined, string, string][] = [
    ['---\nworkflow: dev\nfactory: acme\n---\nFix it\n', undefined, 'acme', "the idea's factory: line"],
    ['---\r\nfactory: "acme"\r\n---\r\nFix it\r\n', undefined, 'acme', 'quoted, CRLF'],
    ['---\nfactory: acme\n---\nFix it\n', 'other', 'other', 'the factory given wins'],
    ['---\nfactory: acme\n---\nFix it\n', '', 'acme', 'an empty one given is none'],
    ['---\nworkflow: dev\n---\nFix it\n', undefined, 'default', 'a frontmatter naming none'],
    ['Fix it\n\n---\nfactory: acme\n---\n', undefined, 'default', 'a block that does not open the text'],
    ['---\nfactory: acme\nFix it, never closed\n', undefined, 'default', 'a frontmatter that never closes'],
  ];
  for (const [body, factory, namespace, why] of rows) assert.equal(filedNamespace(body, factory), namespace, why);
});
