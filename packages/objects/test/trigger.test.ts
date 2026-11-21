/**
 * The Trigger (`src/trigger.ts`): a card trigger and a time trigger, and a page of them, as the Api's endpoints answer them, every key
 * kept; the write body the Api takes; and the closed words of its kinds and its quota refused when they are another.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Card, Trigger, TRIGGER_QUOTAS } from 'objects';
import { answered, taken } from './served.ts';

const onCards = {
  apiVersion: API_VERSION,
  kind: 'Trigger',
  metadata: { name: 'ready', namespace: 'mill', creationTimestamp: '', resourceVersion: 't1' },
  spec: { when: { kind: 'cards', selector: 'ready=yes' }, target: { kind: 'Workflow', name: 'door' } },
  status: {
    since: '',
    from: 'template',
    quota: 'free',
    queued: ['fix-the-door', 'add-a-flag'],
    clashes: [{ card: 'both', with: ['ready', 'urgent'] }],
  },
} as const;

const atTime = {
  apiVersion: API_VERSION,
  kind: 'Trigger',
  metadata: { name: 'janitor', namespace: 'mill', creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: 't2' },
  spec: { when: { kind: 'time', cron: '0 3 * * *', brief: 'tidy up', tz: 'UTC' }, target: { kind: 'Workflow', name: 'janitor' } },
  status: {
    since: '2026-11-01T00:00:00.000Z',
    from: 'factory',
    quota: 'spends',
    quotaBy: 'janitor',
    next: '2026-11-05T03:00:00.000Z',
    last: { run: 'janitor-x1', at: '2026-11-04T03:00:00.000Z' },
  },
} as const;

test("the Api's get answers a trigger of either kind and its list a page of them, every key kept; another kind refused", () => {
  assert.deepEqual(answered('triggers', 'get', onCards), onCards);
  assert.deepEqual(answered('triggers', 'get', atTime), atTime);
  const page = { apiVersion: API_VERSION, kind: 'TriggerList', metadata: {}, items: [onCards, atTime] };
  assert.deepEqual(answered('triggers', 'list', page), page);
  assert.equal(answered('triggers', 'get', { ...atTime, kind: 'Schedule' }), undefined);
});

test("the Api's put takes a card trigger's selector and target, and a cron's write; it refuses one with no target", () => {
  const cards = { when: { kind: 'cards', selector: 'ready=yes' }, target: { kind: 'Workflow', name: 'door' } };
  assert.deepEqual(taken('triggers', 'put', cards), cards);
  const time = { when: { kind: 'time', cron: '0 3 * * *', brief: 'b' }, target: { kind: 'Workflow', name: 'janitor' } };
  assert.deepEqual(taken('triggers', 'put', time), time);
  assert.equal(taken('triggers', 'put', { when: cards.when }), undefined);
});

test('REFUSED: a when, a target kind or a quota that is none of their words', () => {
  const decode = Schema.decodeUnknownSync(Trigger);
  assert.deepEqual([...TRIGGER_QUOTAS], ['spends', 'free', 'unknown']);
  assert.throws(() => decode({ ...onCards, spec: { ...onCards.spec, when: { kind: 'label', selector: 'a=b' } } }));
  assert.throws(() => decode({ ...onCards, spec: { ...onCards.spec, target: { kind: 'Node', name: 'x' } } }));
  assert.throws(() => decode({ ...onCards, status: { ...onCards.status, quota: 'maybe' } }));
});

test("a card's status carries the triggers that queue it and those it clashes on, each optional", () => {
  const decode = Schema.decodeUnknownSync(Card);
  const card = {
    apiVersion: API_VERSION,
    kind: 'Card',
    metadata: { name: 'fix', namespace: 'mill', creationTimestamp: '', resourceVersion: 'c1' },
    spec: { body: 'fix it' },
    status: { state: 'queued', runs: [], inPlay: true, queuedBy: ['ready'] },
  };
  assert.deepEqual(decode(card).status.queuedBy, ['ready']);
  const waiting = { ...card, status: { state: 'filed', runs: [], inPlay: true, clash: ['a', 'b'] } };
  assert.deepEqual(decode(waiting).status.clash, ['a', 'b']);
});
