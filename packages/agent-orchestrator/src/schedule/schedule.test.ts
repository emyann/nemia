/**
 * When a schedule is due, and what its starts and its listing say — pure, over instants.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireWord, scheduleDue, scheduleLine, scheduleLines, settledFire, type ScheduleListed } from './schedule.ts';

const HOUR = 3_600_000;
const fire = (n: number): number => Date.parse('2026-10-05T13:00:00Z') + n * HOUR;

test('REFUSED: a fire no later than the run it already started', () => {
  assert.equal(scheduleDue({ latest: fire(2), since: fire(0), last: fire(2) }), false);
  assert.equal(scheduleDue({ latest: fire(2), since: fire(0), last: fire(3) }), false);
});

test('REFUSED: a fire before the schedule was written', () => {
  assert.equal(scheduleDue({ latest: fire(2), since: fire(2) }), false);
  assert.equal(scheduleDue({ latest: fire(2), since: fire(2) + 1 }), false);
  assert.equal(scheduleDue({ latest: fire(2), since: fire(2) - 1 }), true);
});

test('REFUSED: the fire a kept try settled, a start or a lasting refusal', () => {
  assert.equal(scheduleDue({ latest: fire(2), since: fire(0), settled: fire(2) }), false);
  const started = { due: new Date(fire(2)).toISOString(), at: new Date(fire(2) + 5).toISOString(), run: 'r-1' };
  assert.equal(settledFire(started), fire(2));
  const refused = { due: new Date(fire(2)).toISOString(), at: new Date(fire(2) + 5).toISOString(), why: 'no', refused: true };
  assert.equal(settledFire(refused), fire(2));
});

test('a failure settles no fire: the next pass tries it again', () => {
  const failed = { due: new Date(fire(2)).toISOString(), at: new Date(fire(2) + 5).toISOString(), why: 'EIO', refused: false };
  assert.equal(settledFire(failed), undefined);
  assert.equal(settledFire(undefined), undefined);
  assert.equal(scheduleDue({ latest: fire(2), since: fire(0), settled: settledFire(failed) }), true);
});

test('a refusal does not outlive its fire: the next fire is due', () => {
  assert.equal(scheduleDue({ latest: fire(3), since: fire(0), last: fire(1), settled: fire(2) }), true);
});

test('a daemon down across three fires starts one run, then none', () => {
  assert.equal(scheduleDue({ latest: fire(4), since: fire(0), last: fire(1) }), true);
  assert.equal(scheduleDue({ latest: fire(4), since: fire(0), last: fire(4) }), false);
});

test('a start, a refusal and a failure each say what follows', () => {
  const at = { factory: 'nemia', workflow: 'janitor', due: '2026-10-05T13:00:00.000Z' };
  assert.equal(
    scheduleLine({ ...at, run: 'read-the-stats-ab12' }),
    'started nemia/janitor as read-the-stats-ab12, for its fire at 2026-10-05T13:00:00.000Z',
  );
  const held = scheduleLine({ ...at, refused: 'janitor is not attached' });
  assert.match(held, /janitor is not attached/);
  assert.match(held, /not tried again until its next fire/);
  assert.match(held, /nemia factory unschedule nemia janitor/);
  assert.match(scheduleLine({ ...at, failed: 'EIO', again: false }), /not a refusal: tried again on the next pass/);
});

test('nemia ls lists each schedule with its next fire and last run, and a kept refusal under it', () => {
  const row: ScheduleListed = {
    factory: 'nemia',
    workflow: 'janitor',
    cron: '0 9 * * 1',
    tz: 'America/Montreal',
    brief: 'Read the stats',
    repo: null,
    next: '2026-10-12T13:00:00.000Z',
    last: { run: 'read-the-stats-ab12', at: '2026-10-05T13:00:00.000Z' },
    refused: null,
  };
  const clock = (iso: string): string => `<${iso.slice(0, 10)}>`;
  assert.deepEqual(scheduleLines([row], clock), [
    'scheduled  nemia/janitor  0 9 * * 1 (America/Montreal)  next <2026-10-12>  last read-the-stats-ab12 (<2026-10-05>)',
  ]);
  const listed = scheduleLines([{ ...row, tz: null, last: null, refused: 'janitor is not attached' }], clock);
  assert.deepEqual(listed, ['scheduled  nemia/janitor  0 9 * * 1  next <2026-10-12>  last none', '  refused: janitor is not attached']);

  assert.deepEqual(scheduleLines([], clock), []);
});

test('nemia ls says each fire and run as the instant and how far off it is, and lists the schedules after the runs', async () => {
  const { lsLines } = await import('../list/list.ts');
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(fireWord('2026-10-12T13:00:00.000Z', now), '2026-10-12T13:00:00.000Z, in 4d01h');
  assert.equal(fireWord('2026-10-05T13:00:00.000Z', now), '2026-10-05T13:00:00.000Z, 2d23h ago');
  const listed = { runs: [], daemon: { kind: 'none' as const }, standing: { none: true as const } };
  const without = lsLines(listed, now);
  const row: ScheduleListed = {
    factory: 'nemia',
    workflow: 'janitor',
    cron: '0 9 * * 1',
    tz: null,
    brief: 'Read the stats',
    repo: null,
    next: '2026-10-12T13:00:00.000Z',
    last: null,
    refused: 'janitor is not attached',
  };
  assert.deepEqual(lsLines({ ...listed, schedules: [row] }, now), [
    ...without.slice(0, -1),
    'scheduled  nemia/janitor  0 9 * * 1  next 2026-10-12T13:00:00.000Z, in 4d01h  last none',
    '  refused: janitor is not attached',
    ...without.slice(-1),
  ]);
});
