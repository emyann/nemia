/**
 * The Schedule (`src/schedule.ts`): a schedule, named by its workflow, and a page of them as the Api's endpoints answer them, every key
 * kept, one missing every optional key read; and the write body the Api takes as the old route was sent it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Schedule, ScheduleWrite } from 'objects';
import { answered, taken } from './served.ts';

const nightly = {
  apiVersion: API_VERSION,
  kind: 'Schedule',
  metadata: { name: 'janitor', namespace: 'mill', creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: 'c1' },
  spec: { cron: '0 3 * * *', brief: 'tidy up', repo: '/repo', tz: 'America/Montreal' },
  status: {
    since: '2026-11-01T00:00:00.000Z',
    next: '2026-11-05T07:00:00.000Z',
    last: { run: 'janitor-x1', at: '2026-11-04T07:00:00.000Z' },
    refused: 'the factory offers no workflow janitor',
  },
} as const;

const bare = {
  apiVersion: API_VERSION,
  kind: 'Schedule',
  metadata: { name: 'build', namespace: 'mill', creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: 'c2' },
  spec: { cron: '0 3 * * *', brief: 'build it' },
  status: { since: '2026-11-01T00:00:00.000Z' },
} as const;

test("the Api's get answers a schedule and its list a page of them, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('schedules', 'get', nightly), nightly);
  assert.deepEqual(answered('schedules', 'get', bare), bare);
  const page = { apiVersion: API_VERSION, kind: 'ScheduleList', metadata: {}, items: [nightly, bare] };
  assert.deepEqual(answered('schedules', 'list', page), page);
  assert.equal(answered('schedules', 'get', { ...bare, kind: 'Card' }), undefined);
  assert.equal(answered('schedules', 'list', { ...page, kind: 'CardList' }), undefined);
});

test("the Api's put takes the write as the old route was sent it, and refuses one with no brief", () => {
  const full = { cron: '0 3 * * *', brief: 'tidy up', repo: '/repo', tz: 'UTC' };
  assert.deepEqual(taken('schedules', 'put', full), full);
  assert.deepEqual(taken('schedules', 'put', { cron: '0 3 * * *', brief: 'b' }), { cron: '0 3 * * *', brief: 'b' });
  assert.equal(taken('schedules', 'put', { cron: '0 3 * * *' }), undefined);
});

test('REFUSED: a schedule with no cron, a write with no brief, a last fire with no run, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Schedule);
  assert.throws(() => decode({ ...bare, spec: { brief: 'b' } }));
  assert.throws(() => decode({ ...nightly, status: { ...nightly.status, last: { at: '2026-11-04T07:00:00.000Z' } } }));
  assert.throws(() => decode({ ...bare, kind: 'Card' }));
  assert.throws(() => Schema.decodeUnknownSync(ScheduleWrite)({ cron: '0 3 * * *' }));
});
