/**
 * The series' pure half (`series.ts`), a table per question: what a pass is sampled into (`samplesOf`, `strangeLabels`), the minutes and
 * hours due (`minutesDue`, `hoursDue`), a minute rolled exactly and minutes merged into an hour by their buckets (`rollMinutes`,
 * `rollHours`, `mergeLines`, `bucketsOf`, `percentileOf`), the days a retention, a memo and a range keep (`daysPast`, `memoDays`,
 * `daysOfRange`), and a range read into points and a period's health (`seriesOf`, `healthOf`). The files they are kept in, `nemia series`
 * and its refusal are `series.store.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASS_BOUNDS, PHASES, type Phase, type RecentPass } from '../meter/meter.ts';
import {
  bucketsOf,
  daysOfRange,
  daysPast,
  healthOf,
  hoursDue,
  memoDays,
  mergeLines,
  minutesDue,
  percentileOf,
  rollHours,
  rollMinutes,
  samplesOf,
  seriesOf,
  strangeLabels,
  type RollupLine,
} from './series.ts';

/** A row of a table: its name, and what it holds. */
type Row = { name: string; check: () => void };

/** A pass kept at `at`, of `ms`, with what it saw. */
const pass = (at: string, ms = 10, over: Partial<RecentPass> = {}): RecentPass => ({
  at,
  ms,
  runs: 40,
  tasks: 2,
  queued: 1,
  admitted: 1,
  records: 3,
  rested: 0,
  reads: 2,
  phases: Object.fromEntries(PHASES.map((p) => [p, 1])) as Record<Phase, number>,
  ...over,
});

const lineOf = (lines: readonly RollupLine[], s: string, t?: string) => lines.find((x) => x.s === s && (t === undefined || x.t === t))!;

/** The `pass.ms` line of the minute `m` of 13:00, rolled from `values`, a pass a second. */
const minute = (m: number, values: number[]): RollupLine =>
  rollMinutes(
    values.map((ms, k) => pass(`2026-10-05T13:${String(m).padStart(2, '0')}:${String(k).padStart(2, '0')}.000Z`, ms)),
    [`2026-10-05T13:${String(m).padStart(2, '0')}:00.000Z`],
  ).find((x) => x.s === 'pass.ms')!;

/** Three passes in three minutes, read at 14:04:30, in the fourth. */
const RING = [pass('2026-10-05T14:02:10Z'), pass('2026-10-05T14:03:10Z'), pass('2026-10-05T14:04:01Z')];
const RING_NOW = Date.parse('2026-10-05T14:04:30Z');
/** A minute past 14:00, when the hours are asked. */
const HOUR_NOW = Date.parse('2026-10-05T14:01:05Z');

const DUE: Row[] = [
  {
    name: 'a pass at 14:02:59.999 and one at 14:03:00.000 are in two minutes',
    check: () =>
      assert.deepEqual(minutesDue([pass('2026-10-05T14:02:59.999Z', 5), pass('2026-10-05T14:03:00.000Z', 7)], undefined, RING_NOW, 150), [
        '2026-10-05T14:02:00.000Z',
        '2026-10-05T14:03:00.000Z',
      ]),
  },
  {
    name: 'the minute `now` is in is never due',
    check: () => assert.deepEqual(minutesDue(RING, undefined, RING_NOW, 150), ['2026-10-05T14:02:00.000Z', '2026-10-05T14:03:00.000Z']),
  },
  {
    name: 'REFUSED: a minute already rolled is not due again, so a restart rolls nothing twice',
    check: () => {
      assert.deepEqual(minutesDue(RING, '2026-10-05T14:03:00.000Z', RING_NOW, 150), [], 'the last complete minute rolled: none');
      assert.deepEqual(minutesDue(RING, '2026-10-05T14:02:00.000Z', RING_NOW, 150), ['2026-10-05T14:03:00.000Z']);
    },
  },
  {
    name: "REFUSED: a full ring's first minute, which may have lost passes",
    check: () => assert.deepEqual(minutesDue(RING, undefined, RING_NOW, 3), ['2026-10-05T14:03:00.000Z']),
  },
  { name: 'no hour is due with no minute kept', check: () => assert.equal(hoursDue(undefined, undefined, HOUR_NOW), null) },
  {
    name: 'no hour is due while the last minute kept is in the hour now',
    check: () => assert.equal(hoursDue('2026-10-05T14:00:00.000Z', '2026-10-05T13:00:00.000Z', HOUR_NOW), null),
  },
  {
    name: 'each whole hour after the last hour line is due once it is done',
    check: () =>
      assert.deepEqual(hoursDue('2026-10-05T13:59:00.000Z', '2026-10-05T12:00:00.000Z', HOUR_NOW), {
        after: '2026-10-05T12:00:00.000Z',
        before: '2026-10-05T14:00:00.000Z',
      }),
  },
  {
    name: 'REFUSED: an hour rolled already is not due again on a restart',
    check: () => assert.equal(hoursDue('2026-10-05T13:59:00.000Z', '2026-10-05T13:00:00.000Z', HOUR_NOW), null),
  },
];

test('`minutesDue` and `hoursDue`: the minutes and hours done and not yet rolled, each once', async (t) => {
  for (const row of DUE) await t.test(row.name, row.check);
});

/** An hour of minutes of three passes each, 20, 40 and 60 ms, the last minute's third at 400. */
const HOUR_OF_MINUTES = Array.from({ length: 60 }, (_, m) => minute(m, [20, 40, m === 59 ? 400 : 60]));

const ROLLED: Row[] = [
  {
    name: 'two passes either side of a minute roll into two minutes, each its own',
    check: () => {
      const ring = [pass('2026-10-05T14:02:59.999Z', 5), pass('2026-10-05T14:03:00.000Z', 7)];
      assert.deepEqual(
        rollMinutes(ring, ['2026-10-05T14:02:00.000Z', '2026-10-05T14:03:00.000Z'])
          .filter((x) => x.s === 'pass.ms')
          .map((x) => [x.t, x.n, x.sum]),
        [
          ['2026-10-05T14:02:00.000Z', 1, 5],
          ['2026-10-05T14:03:00.000Z', 1, 7],
        ],
      );
    },
  },
  {
    name: 'a minute is exact: n, sum, min, max, last, its buckets, and p50 and p95 by nearest rank',
    check: () => {
      const values = Array.from({ length: 20 }, (_, k) => (k + 1) * 5);
      const ring = values.map((ms, k) => pass(`2026-10-05T14:02:${String(k).padStart(2, '0')}.000Z`, ms));
      const [line] = rollMinutes(ring, ['2026-10-05T14:02:00.000Z']).filter((x) => x.s === 'pass.ms');
      assert.deepEqual(
        { n: line.n, sum: line.sum, min: line.min, max: line.max, last: line.last, p50: line.p50, p95: line.p95 },
        { n: 20, sum: 1050, min: 5, max: 100, last: 100, p50: 50, p95: 95 },
      );
      assert.deepEqual(line.b, bucketsOf(values, PASS_BOUNDS));
    },
  },
  {
    name: 'a value at a bound is in that bucket, and one past the last in the open one',
    check: () => assert.deepEqual(bucketsOf([10, 10.01, 9999], PASS_BOUNDS), [1, 1, 0, 0, 0, 0, 0, 0, 0, 1]),
  },
  {
    name: 'minutes merge into an hour: counts and sums added, extremes folded, buckets summed, p50 and p95 inside their buckets',
    check: () => {
      const [hour] = rollHours(HOUR_OF_MINUTES, { after: undefined, before: '2026-10-05T14:00:00.000Z' }).filter((x) => x.s === 'pass.ms');
      assert.equal(hour.t, '2026-10-05T13:00:00.000Z');
      assert.deepEqual([hour.n, hour.sum, hour.min, hour.max, hour.last], [180, 59 * 120 + 460, 20, 400, 400]);
      assert.deepEqual(hour.b, bucketsOf([...Array(60).fill(20), ...Array(60).fill(40), ...Array(59).fill(60), 400], PASS_BOUNDS));
      assert.ok(hour.p95! > 50 && hour.p95! <= 100, `p95 ${hour.p95} inside (50, 100]`);
      assert.ok(hour.p50! > 25 && hour.p50! <= 50, `p50 ${hour.p50} inside (25, 50]`);
    },
  },
  {
    name: 'REFUSED: an hour already rolled is not rolled again',
    check: () =>
      assert.deepEqual(rollHours(HOUR_OF_MINUTES, { after: '2026-10-05T13:00:00.000Z', before: '2026-10-05T14:00:00.000Z' }), []),
  },
  {
    name: 'a percentile in the open last bucket runs from the least seen to the most, never Infinity',
    check: () => {
      const b = [0, 0, 0, 0, 0, 0, 0, 0, 0, 10];
      assert.equal(percentileOf(b, PASS_BOUNDS, 6000, 9000, 0.95), 8850);
      assert.equal(percentileOf(b, PASS_BOUNDS, 6000, 9000, 1), 9000);
    },
  },
];

test('`rollMinutes`, `rollHours`, `mergeLines`, `bucketsOf` and `percentileOf`: a minute rolled exactly, minutes merged by their buckets', async (t) => {
  for (const row of ROLLED) await t.test(row.name, row.check);
});

/** A reading of the store's disk: two worktrees, one of which did not read, two parts of the engine and the sessions' records. */
const DISK = {
  at: '2026-10-05T14:00:00Z',
  free: 700,
  size: 1000,
  entries: [
    { part: 'worktrees' as const, factory: 'nemia', bytes: 40, unread: 2 },
    { part: 'worktrees' as const, factory: 'pipao', unread: 1 },
    { part: 'engine' as const, kind: 'engine-other' as const, bytes: 90, unread: 0 },
    { part: 'engine' as const, kind: 'check-output' as const, factory: 'nemia', bytes: 25, unread: 0 },
    { part: 'sessions' as const, kind: 'harness-records' as const, factory: 'nemia', bytes: 60, unread: 0 },
  ],
};

const SAMPLED: Row[] = [
  {
    name: 'REFUSED: a figure an older tick did not keep is left out, never counted as 0',
    check: () =>
      assert.ok(
        !samplesOf(pass('2026-10-05T14:02:00Z')).some((x) =>
          ['admission.wait.ms', 'machine.load', 'check.load', 'quota.used'].includes(x.s),
        ),
      ),
  },
  {
    name: 'a pass is sampled into each series it carries: its wait, a check per load, a quota per window, a phase each',
    check: () => {
      const check = { factory: 'f', workflow: 'w', step: 's', agent: 'a' };
      const newer = samplesOf(
        pass('2026-10-05T14:02:00Z', 10, { waitMs: 300, load: 0.4, checks: [check], quota: { h: { five: 20, week: 3 } } }),
      );
      assert.deepEqual(
        newer.filter((x) => ['check.load', 'quota.used', 'admission.wait.ms'].includes(x.s)),
        [
          { s: 'admission.wait.ms', l: {}, v: 300 },
          { s: 'check.load', l: check, v: 0.4 },
          { s: 'quota.used', l: { harness: 'h', window: 'five' }, v: 20 },
          { s: 'quota.used', l: { harness: 'h', window: 'week' }, v: 3 },
        ],
      );
      assert.equal(newer.filter((x) => x.s === 'pass.phase.ms').length, PHASES.length);
    },
  },
  {
    name: 'REFUSED: a pass with no reading of the disk carries none of its series, never a zero',
    check: () =>
      assert.deepEqual(
        samplesOf(pass('2026-10-05T14:02:00Z')).filter((x) => x.s.startsWith('disk.')),
        [],
      ),
  },
  {
    name: 'REFUSED: a reading with no entry of a part samples no bytes for it, never a zero',
    check: () =>
      assert.deepEqual(
        samplesOf(pass('2026-10-05T14:02:00Z', 10, { disk: { ...DISK, entries: DISK.entries.slice(0, 3) } })).filter(
          (x) => x.s === 'disk.bytes' && x.l.part === 'sessions',
        ),
        [],
      ),
  },
  {
    name: 'a pass with a reading of the disk is sampled into its four series, and no bytes for the entry that did not read',
    check: () =>
      assert.deepEqual(
        samplesOf(pass('2026-10-05T14:02:00Z', 10, { disk: DISK })).filter((x) => x.s.startsWith('disk.')),
        [
          { s: 'disk.bytes', l: { part: 'worktrees', factory: 'nemia' }, v: 40 },
          { s: 'disk.bytes', l: { part: 'engine', kind: 'engine-other' }, v: 90 },
          { s: 'disk.bytes', l: { part: 'engine', kind: 'check-output', factory: 'nemia' }, v: 25 },
          { s: 'disk.bytes', l: { part: 'sessions', kind: 'harness-records', factory: 'nemia' }, v: 60 },
          { s: 'disk.unread', l: { part: 'worktrees' }, v: 3 },
          { s: 'disk.unread', l: { part: 'runs' }, v: 0 },
          { s: 'disk.unread', l: { part: 'engine' }, v: 0 },
          { s: 'disk.unread', l: { part: 'sessions' }, v: 0 },
          { s: 'disk.unread', l: { part: 'checks' }, v: 0 },
          { s: 'disk.unread', l: { part: 'series' }, v: 0 },
          { s: 'disk.unread', l: { part: 'other' }, v: 0 },
          { s: 'disk.free', l: {}, v: 700 },
          { s: 'disk.size', l: {}, v: 1000 },
        ],
      ),
  },
  {
    name: 'its other samples are those of the same pass with no reading: its time and phases are no part of the measure',
    check: () =>
      assert.deepEqual(
        samplesOf(pass('2026-10-05T14:02:00Z', 10, { disk: DISK })).filter((x) => !x.s.startsWith('disk.')),
        samplesOf(pass('2026-10-05T14:02:00Z')),
      ),
  },
  {
    name: 'REFUSED: a label key outside the closed set is named, a run id among them',
    check: () => assert.deepEqual(strangeLabels({ factory: 'f', run: 'r-1', step: 's' }), ['run']),
  },
  {
    name: 'the closed set: a step, its agent, a phase, a part, a kind are none of them strange',
    check: () => {
      assert.deepEqual(strangeLabels({ factory: 'f', workflow: 'w', step: 's', agent: 'a', phase: 'place' }), []);
      assert.deepEqual(strangeLabels({ part: 'engine', factory: 'f' }), []);
    },
  },
];

test('`samplesOf` and `strangeLabels`: what a pass is sampled into, under labels of the closed set', async (t) => {
  for (const row of SAMPLED) await t.test(row.name, row.check);
});

const KEPT: Row[] = [
  {
    name: 'a day past its retention: with 30 on 2026-10-05, 2026-09-05 is kept and 2026-09-04 is past it',
    check: () =>
      assert.deepEqual(daysPast(['2026-09-03', '2026-09-04', '2026-09-05', '2026-10-05'], Date.parse('2026-10-05T12:00:00Z'), 30), [
        '2026-09-03',
        '2026-09-04',
      ]),
  },
  {
    name: 'a retention unset keeps every day',
    check: () => assert.deepEqual(daysPast(['2000-01-01'], Date.parse('2026-10-05T12:00:00Z'), undefined), []),
  },
  {
    name: 'a memo keeps the minute days of the last 24h',
    check: () =>
      assert.deepEqual(memoDays('minute', ['2026-10-03', '2026-10-04', '2026-10-05'], Date.parse('2026-10-05T14:00:00Z')), [
        '2026-10-04',
        '2026-10-05',
      ]),
  },
  {
    name: 'a memo keeps every hour day, years old included',
    check: () =>
      assert.deepEqual(memoDays('hour', ['2020-01-01', '2026-08-01', '2026-10-05'], Date.parse('2026-10-05T14:00:00Z')), [
        '2020-01-01',
        '2026-08-01',
        '2026-10-05',
      ]),
  },
  {
    name: 'a range reads the days its reach starts in and after: 24h from yesterday, 7d a week back, all every one',
    check: () => {
      const days = ['2020-01-01', '2026-09-27', '2026-09-28', '2026-10-04', '2026-10-05'];
      const now = Date.parse('2026-10-05T14:00:00Z');
      assert.deepEqual(daysOfRange('24h', days, now), ['2026-10-04', '2026-10-05']);
      assert.deepEqual(daysOfRange('7d', days, now), ['2026-09-28', '2026-10-04', '2026-10-05']);
      assert.deepEqual(daysOfRange('all', days, now), days);
    },
  },
];

test('`daysPast`, `memoDays` and `daysOfRange`: the days a retention, a memo and a range keep', async (t) => {
  for (const row of KEPT) await t.test(row.name, row.check);
});

/** A `store.runs` line at `t` of one sample `v`. */
const runsLine = (t: string, v: number): RollupLine => ({ t, s: 'store.runs', l: {}, n: 1, sum: v, min: v, max: v, last: v });

/** Three hour lines over two days, read at noon of the day after. */
const LINES = [runsLine('2026-10-03T10:00:00.000Z', 3), runsLine('2026-10-04T10:00:00.000Z', 5), runsLine('2026-10-04T11:00:00.000Z', 9)];
const LINES_NOW = Date.parse('2026-10-05T12:00:00Z');

/** Three minutes of passes, each with its wait, load and quota, the second with four queued. */
const HEALTH_RING = [
  pass('2026-10-05T10:00:01Z', 10, { waitMs: 100, load: 0.2, quota: { h: { w: 10 } } }),
  pass('2026-10-05T10:01:01Z', 30, { waitMs: 900, load: 0.8, queued: 4, quota: { h: { w: 30 } } }),
  pass('2026-10-05T10:02:01Z', 20, { waitMs: 0, load: 0.4, quota: { h: { w: 25 } } }),
];

const READ: Row[] = [
  {
    name: 'all: days merged from hours, oldest first',
    check: () => {
      const all = seriesOf('all', LINES, LINES_NOW);
      assert.equal(all.span, 'day');
      assert.deepEqual(
        all.series[0].points.map((p) => [p.t, p.n, p.max, p.last]),
        [
          ['2026-10-03T00:00:00.000Z', 1, 3, 3],
          ['2026-10-04T00:00:00.000Z', 2, 9, 9],
        ],
      );
    },
  },
  { name: '7d: the hours, a point each', check: () => assert.equal(seriesOf('7d', LINES, LINES_NOW).series[0].points.length, 3) },
  {
    name: 'REFUSED: 24h reads minutes, and with none in the last day it holds no series',
    check: () => {
      assert.equal(seriesOf('24h', LINES, LINES_NOW).series.length, 0);
      assert.equal(seriesOf('24h', LINES, LINES_NOW).span, 'minute');
    },
  },
  {
    name: 'REFUSED: a period with nothing kept: each figure of its health null, never 0',
    check: () =>
      assert.deepEqual(healthOf([]), {
        pass: { p50: null, p95: null },
        runs: null,
        reads: null,
        load: { p95: null, max: null },
        queued: null,
        waitMs: null,
        checkLoad: null,
        quota: [],
      }),
  },
  {
    name: "a period's health from its lines: the most queued, the longest wait, the load's most, the runs, a quota's latest and peak",
    check: () => {
      const minutes = rollMinutes(HEALTH_RING, ['2026-10-05T10:00:00.000Z', '2026-10-05T10:01:00.000Z', '2026-10-05T10:02:00.000Z']);
      const health = healthOf(mergeLines(minutes, 3_600_000));
      assert.deepEqual([health.queued, health.waitMs, health.load.max, health.runs], [4, 900, 0.8, 40]);
      assert.deepEqual(health.quota, [{ harness: 'h', window: 'w', latest: 25, peak: 30 }]);
      assert.deepEqual(
        healthOf(minutes).quota,
        [{ harness: 'h', window: 'w', latest: 25, peak: 30 }],
        'a minute a line: its peak is no later than its latest',
      );
      assert.ok(health.pass.p50! >= 10 && health.pass.p95! <= 30);
      assert.equal(lineOf(minutes, 'pass.ms', '2026-10-05T10:01:00.000Z').max, 30);
    },
  },
];

test("`seriesOf` and `healthOf`: a range read into its points, a period's health, each figure null where nothing was kept", async (t) => {
  for (const row of READ) await t.test(row.name, row.check);
});
