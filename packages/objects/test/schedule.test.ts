/**
 * The Schedule (`src/schedule.ts`): a schedule, named by its workflow, and a page of them decoded from JSON and encoded back equal, one
 * missing every optional key read; and the write body decoded as the old route was sent it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Schedule, ScheduleList, ScheduleWrite } from 'objects';

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

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a schedule and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Schedule, nightly), nightly);
  assert.deepEqual(roundTrip(Schedule, bare), bare);
  const page = { apiVersion: API_VERSION, kind: 'ScheduleList', metadata: {}, items: [nightly, bare] };
  assert.deepEqual(roundTrip(ScheduleList, page), page);
});

test('the write decodes as the old route was sent it', () => {
  const full = { cron: '0 3 * * *', brief: 'tidy up', repo: '/repo', tz: 'UTC' };
  assert.deepEqual(roundTrip(ScheduleWrite, full), full);
  assert.deepEqual(roundTrip(ScheduleWrite, { cron: '0 3 * * *', brief: 'b' }), { cron: '0 3 * * *', brief: 'b' });
});

test('REFUSED: a schedule with no cron, a write with no brief, a last fire with no run, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Schedule);
  assert.throws(() => decode({ ...bare, spec: { brief: 'b' } }));
  assert.throws(() => decode({ ...nightly, status: { ...nightly.status, last: { at: '2026-11-04T07:00:00.000Z' } } }));
  assert.throws(() => decode({ ...bare, kind: 'Card' }));
  assert.throws(() => Schema.decodeUnknownSync(ScheduleWrite)({ cron: '0 3 * * *' }));
});
