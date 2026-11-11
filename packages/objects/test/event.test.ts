/**
 * The Event (`src/event.ts`): a run's, a step's, a daemon's and the store's event, and a page of them, as the Api's endpoints answer them,
 * every key kept; and the closed words it carries held — a reason, a kind, a type or a source out of its words refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Event } from 'objects';
import { answered } from './served.ts';

const meta = (name: string, namespace?: string) => ({
  name,
  ...(namespace === undefined ? {} : { namespace }),
  creationTimestamp: '2026-11-05T10:00:00.000Z',
  resourceVersion: String(Number(name) + 100),
});

const run = {
  apiVersion: API_VERSION,
  kind: 'Event',
  metadata: { ...meta('0', 'mill'), labels: { run: 'r1', factory: 'mill', workflow: 'build' } },
  involved: { kind: 'Run', name: 'r1' },
  reason: 'Waiting',
  on: 'limit',
  type: 'Normal',
  message: 'waiting on a slot',
  source: 'tick',
} as const;

const step = {
  apiVersion: API_VERSION,
  kind: 'Event',
  metadata: meta('100', 'default'),
  involved: { kind: 'Step', name: 'r1/review' },
  reason: 'ToolDenied',
  type: 'Warning',
  message: 'denied: Bash(git push)',
  source: 'runtime',
  waits: 'person',
  call: 'Bash(git push)',
  try: 2,
} as const;

const daemon = {
  apiVersion: API_VERSION,
  kind: 'Event',
  metadata: meta('200'),
  involved: { kind: 'Daemon', name: '4242' },
  reason: 'DaemonStarted',
  type: 'Normal',
  message: 'daemon started',
  source: 'daemon',
} as const;

const store = {
  apiVersion: API_VERSION,
  kind: 'Event',
  metadata: meta('300'),
  involved: { kind: 'Store', name: 'store' },
  reason: 'StorePaused',
  type: 'Normal',
  message: 'paused',
  source: 'person',
} as const;

const factory = {
  apiVersion: API_VERSION,
  kind: 'Event',
  metadata: meta('400', 'acme'),
  involved: { kind: 'Factory', name: 'acme' },
  reason: 'ConflictsPending',
  type: 'Normal',
  message: 'conflicts pending',
  source: 'tick',
} as const;

test("the Api's get answers a run's, a step's, a daemon's, the store's and a factory's event, its list a page of them; another kind refused", () => {
  for (const event of [run, step, daemon, store, factory]) assert.deepEqual(answered('events', 'getAll', event), event);
  const page = { apiVersion: API_VERSION, kind: 'EventList', metadata: { continue: 'x', remainingItemCount: 2 }, items: [run, daemon] };
  assert.deepEqual(answered('events', 'listAll', page), page);
  assert.equal(answered('events', 'getAll', { ...run, kind: 'Run' }), undefined);
  assert.equal(answered('events', 'listAll', { ...page, kind: 'RunList' }), undefined);
});

test('REFUSED: a reason, an involved kind, a type or a source out of its words', () => {
  const decode = Schema.decodeUnknownSync(Event);
  assert.throws(() => decode({ ...run, reason: 'Exploded' }));
  assert.throws(() => decode({ ...run, involved: { kind: 'Card', name: 'c' } }));
  assert.throws(() => decode({ ...run, type: 'Error' }));
  assert.throws(() => decode({ ...run, source: 'cron' }));
});
