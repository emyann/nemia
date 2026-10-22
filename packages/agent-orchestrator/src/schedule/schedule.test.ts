/**
 * When a schedule is due, and what its starts and its listing say — pure, over instants, as tables: one test per function, its rows
 * subtests. A schedule's fires over time, started by the tick, are told as stories in `test/schedule.test.ts`; its cron and zone
 * refused as it is written, in `src/factory/factory.store.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireWord, scheduleDue, scheduleLine, scheduleLines, settledFire, type ScheduleListed } from './schedule.ts';

const HOUR = 3_600_000;
const fire = (n: number): number => Date.parse('2026-10-05T13:00:00Z') + n * HOUR;
const iso = (at: number): string => new Date(at).toISOString();

test('scheduleDue: the latest fire is due once, after the schedule was written and after the run it last started', async (t) => {
  const rows: Array<[string, Parameters<typeof scheduleDue>[0], boolean]> = [
    ['REFUSED: a fire that is the run it already started', { latest: fire(2), since: fire(0), last: fire(2) }, false],
    ['REFUSED: a fire before the run it already started', { latest: fire(2), since: fire(0), last: fire(3) }, false],
    ['REFUSED: a fire at the instant the schedule was written', { latest: fire(2), since: fire(2) }, false],
    ['REFUSED: a fire before the schedule was written', { latest: fire(2), since: fire(2) + 1 }, false],
    ['a fire after the schedule was written', { latest: fire(2), since: fire(2) - 1 }, true],
    ['REFUSED: the fire a kept try settled, a start or a lasting refusal', { latest: fire(2), since: fire(0), settled: fire(2) }, false],
    ['a failure settles no fire: the next pass tries it again', { latest: fire(2), since: fire(0), settled: undefined }, true],
    [
      'a refusal does not outlive its fire: the next fire is due',
      { latest: fire(3), since: fire(0), last: fire(1), settled: fire(2) },
      true,
    ],
    ['a daemon down across three fires starts one run', { latest: fire(4), since: fire(0), last: fire(1) }, true],
    ['then none', { latest: fire(4), since: fire(0), last: fire(4) }, false],
  ];
  for (const [row, at, due] of rows) await t.test(row, () => assert.equal(scheduleDue(at), due));
});

test('settledFire: the fire a kept try settles, a start or a lasting refusal; a failure settles none', async (t) => {
  const rows: Array<[string, Parameters<typeof settledFire>[0], number | undefined]> = [
    ['a start', { due: iso(fire(2)), at: iso(fire(2) + 5), run: 'r-1' }, fire(2)],
    ['a lasting refusal', { due: iso(fire(2)), at: iso(fire(2) + 5), why: 'no', refused: true }, fire(2)],
    ['a failure', { due: iso(fire(2)), at: iso(fire(2) + 5), why: 'EIO', refused: false }, undefined],
    ['no try kept', undefined, undefined],
  ];
  for (const [row, kept, settled] of rows) await t.test(row, () => assert.equal(settledFire(kept), settled));
});

test('scheduleLine: a start, a refusal and a failure each say what follows', async (t) => {
  const at = { factory: 'nemia', workflow: 'janitor', due: '2026-10-05T13:00:00.000Z' };
  await t.test('a start, naming the run and its fire', () =>
    assert.equal(
      scheduleLine({ ...at, run: 'read-the-stats-ab12' }),
      'started nemia/janitor as read-the-stats-ab12, for its fire at 2026-10-05T13:00:00.000Z',
    ),
  );
  await t.test('a refusal, held until its next fire, naming the unschedule', () => {
    const held = scheduleLine({ ...at, refused: 'janitor is not attached' });
    assert.match(held, /janitor is not attached/);
    assert.match(held, /not tried again until its next fire/);
    assert.match(held, /nemia factory unschedule nemia janitor/);
  });
  await t.test('a failure, tried again on the next pass', () =>
    assert.match(scheduleLine({ ...at, failed: 'EIO', again: false }), /not a refusal: tried again on the next pass/),
  );
});

const ROW: ScheduleListed = {
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

test('scheduleLines and `nemia ls`: each schedule with its next fire and last run, a kept refusal under it, after the runs', async (t) => {
  const clock = (at: string): string => `<${at.slice(0, 10)}>`;
  await t.test('its zone, its next fire and its last run', () =>
    assert.deepEqual(scheduleLines([ROW], clock), [
      'scheduled  nemia/janitor  0 9 * * 1 (America/Montreal)  next <2026-10-12>  last read-the-stats-ab12 (<2026-10-05>)',
    ]),
  );
  await t.test('no zone, no last run, and a kept refusal under it', () => {
    const held = { ...ROW, tz: null, last: null, refused: 'janitor is not attached' };
    const listed = scheduleLines([held], clock);
    assert.deepEqual(listed, ['scheduled  nemia/janitor  0 9 * * 1  next <2026-10-12>  last none', '  refused: janitor is not attached']);
  });
  await t.test('no schedule, no line', () => assert.deepEqual(scheduleLines([], clock), []));
  const now = Date.parse('2026-10-08T12:00:00Z');
  await t.test('a fire to come, as the instant and how far off', () =>
    assert.equal(fireWord('2026-10-12T13:00:00.000Z', now), '2026-10-12T13:00:00.000Z, in 4d01h'),
  );
  await t.test('a fire past, as the instant and how long ago', () =>
    assert.equal(fireWord('2026-10-05T13:00:00.000Z', now), '2026-10-05T13:00:00.000Z, 2d23h ago'),
  );
  await t.test('`nemia ls` lists the schedules after the runs, before its last line', async () => {
    const { lsLines } = await import('../list/list.ts');
    const listed = { runs: [], daemon: { kind: 'none' as const }, standing: { none: true as const } };
    const without = lsLines(listed, now);
    const row = { ...ROW, tz: null, last: null, refused: 'janitor is not attached' };
    assert.deepEqual(lsLines({ ...listed, schedules: [row] }, now), [
      ...without.slice(0, -1),
      'scheduled  nemia/janitor  0 9 * * 1  next 2026-10-12T13:00:00.000Z, in 4d01h  last none',
      '  refused: janitor is not attached',
      ...without.slice(-1),
    ]);
  });
});
