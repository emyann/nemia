/**
 * The series' pure half (`series.ts`): what a pass is sampled into, the minutes and hours due, a minute rolled exactly, minutes merged
 * into an hour by their buckets, the days past a retention, and a range read into points and a period's health.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASS_BOUNDS, PHASES, type Phase, type RecentPass } from '../meter/meter.ts';
import {
  bucketsOf,
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

test('a pass at 14:02:59.999 and one at 14:03:00.000 roll into two minutes', () => {
  const ring = [pass('2026-10-05T14:02:59.999Z', 5), pass('2026-10-05T14:03:00.000Z', 7)];
  const due = minutesDue(ring, undefined, Date.parse('2026-10-05T14:04:30Z'), 150);
  assert.deepEqual(due, ['2026-10-05T14:02:00.000Z', '2026-10-05T14:03:00.000Z']);
  const lines = rollMinutes(ring, due);
  assert.deepEqual(
    lines.filter((x) => x.s === 'pass.ms').map((x) => [x.t, x.n, x.sum]),
    [
      ['2026-10-05T14:02:00.000Z', 1, 5],
      ['2026-10-05T14:03:00.000Z', 1, 7],
    ],
  );
});

test('the minute `now` is in is never due, nor one already rolled, so a restart rolls nothing twice', () => {
  const ring = [pass('2026-10-05T14:02:10Z'), pass('2026-10-05T14:03:10Z'), pass('2026-10-05T14:04:01Z')];
  const now = Date.parse('2026-10-05T14:04:30Z');
  assert.deepEqual(minutesDue(ring, undefined, now, 150), ['2026-10-05T14:02:00.000Z', '2026-10-05T14:03:00.000Z']);
  assert.deepEqual(minutesDue(ring, '2026-10-05T14:03:00.000Z', now, 150), [], 'the last complete minute rolled: none');
  assert.deepEqual(minutesDue(ring, '2026-10-05T14:02:00.000Z', now, 150), ['2026-10-05T14:03:00.000Z']);
  assert.deepEqual(minutesDue(ring, undefined, now, 3), ['2026-10-05T14:03:00.000Z'], "a full ring's first minute may have lost passes");
});

test('a minute is exact: n, sum, min, max, last, its buckets, and p50 and p95 by nearest rank; a pass at a bound is in that bucket', () => {
  const values = Array.from({ length: 20 }, (_, k) => (k + 1) * 5);
  const ring = values.map((ms, k) => pass(`2026-10-05T14:02:${String(k).padStart(2, '0')}.000Z`, ms));
  const [line] = rollMinutes(ring, ['2026-10-05T14:02:00.000Z']).filter((x) => x.s === 'pass.ms');
  assert.deepEqual(
    { n: line.n, sum: line.sum, min: line.min, max: line.max, last: line.last, p50: line.p50, p95: line.p95 },
    { n: 20, sum: 1050, min: 5, max: 100, last: 100, p50: 50, p95: 95 },
  );
  assert.deepEqual(line.b, bucketsOf(values, PASS_BOUNDS));
  assert.deepEqual(bucketsOf([10, 10.01, 9999], PASS_BOUNDS), [1, 1, 0, 0, 0, 0, 0, 0, 0, 1], 'at its bound, in it; past the last, open');
});

test('a pass is sampled into each series it carries, a figure an older tick did not keep left out, never counted as 0', () => {
  const older = samplesOf(pass('2026-10-05T14:02:00Z'));
  assert.ok(!older.some((x) => ['admission.wait.ms', 'machine.load', 'check.load', 'quota.used'].includes(x.s)));
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
});

test('a pass with a reading of the disk is sampled into its four series, and its other samples are those of the same pass with none', () => {
  const disk = {
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
  const bytesOf = (entries: (typeof disk)['entries']) =>
    samplesOf(pass('2026-10-05T14:02:00Z', 10, { disk: { ...disk, entries } })).filter((x) => x.s === 'disk.bytes');
  assert.deepEqual(
    bytesOf(disk.entries.slice(0, 3)).filter((x) => x.l.part === 'sessions'),
    [],
    'REFUSED: a reading with no entry of a part samples no bytes for it, never a zero',
  );
  const bare = samplesOf(pass('2026-10-05T14:02:00Z'));
  const read = samplesOf(pass('2026-10-05T14:02:00Z', 10, { disk }));
  assert.deepEqual(
    bare.filter((x) => x.s.startsWith('disk.')),
    [],
    'a pass with no reading carries none of them, never a zero',
  );
  assert.deepEqual(
    read.filter((x) => !x.s.startsWith('disk.')),
    bare,
    'the pass is sampled as it was: its time and its phases are no part of the measure',
  );
  assert.deepEqual(
    read.filter((x) => x.s.startsWith('disk.')),
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
    'REFUSED: bytes for the entry that did not read',
  );
  assert.deepEqual(strangeLabels({ part: 'engine', factory: 'f' }), []);
});

test('a label key outside the closed set is named, a run id among them', () => {
  assert.deepEqual(strangeLabels({ factory: 'f', run: 'r-1', step: 's' }), ['run']);
  assert.deepEqual(strangeLabels({ factory: 'f', workflow: 'w', step: 's', agent: 'a', phase: 'place' }), []);
});

test('the hours due: none while the last minute kept is in the hour now; each whole hour after the last hour line once it is done', () => {
  const now = Date.parse('2026-10-05T14:01:05Z');
  assert.equal(hoursDue(undefined, undefined, now), null, 'no minute kept, nothing to roll');
  assert.equal(hoursDue('2026-10-05T14:00:00.000Z', '2026-10-05T13:00:00.000Z', now), null);
  assert.deepEqual(hoursDue('2026-10-05T13:59:00.000Z', '2026-10-05T12:00:00.000Z', now), {
    after: '2026-10-05T12:00:00.000Z',
    before: '2026-10-05T14:00:00.000Z',
  });
  assert.equal(hoursDue('2026-10-05T13:59:00.000Z', '2026-10-05T13:00:00.000Z', now), null, 'rolled already: a restart rolls it not again');
});

test('minutes merge into an hour: counts and sums added, extremes folded, buckets summed, p95 inside its bucket', () => {
  const minute = (m: number, values: number[]): RollupLine =>
    rollMinutes(
      values.map((ms, k) => pass(`2026-10-05T13:${String(m).padStart(2, '0')}:${String(k).padStart(2, '0')}.000Z`, ms)),
      [`2026-10-05T13:${String(m).padStart(2, '0')}:00.000Z`],
    ).find((x) => x.s === 'pass.ms')!;
  const minutes = Array.from({ length: 60 }, (_, m) => minute(m, [20, 40, m === 59 ? 400 : 60]));
  const [hour] = rollHours(minutes, { after: undefined, before: '2026-10-05T14:00:00.000Z' }).filter((x) => x.s === 'pass.ms');
  assert.equal(hour.t, '2026-10-05T13:00:00.000Z');
  assert.deepEqual([hour.n, hour.sum, hour.min, hour.max, hour.last], [180, 59 * 120 + 460, 20, 400, 400]);
  assert.deepEqual(hour.b, bucketsOf([...Array(60).fill(20), ...Array(60).fill(40), ...Array(59).fill(60), 400], PASS_BOUNDS));
  assert.ok(hour.p95! > 50 && hour.p95! <= 100, `p95 ${hour.p95} inside (50, 100]`);
  assert.ok(hour.p50! > 25 && hour.p50! <= 50, `p50 ${hour.p50} inside (25, 50]`);
  assert.deepEqual(
    rollHours(minutes, { after: '2026-10-05T13:00:00.000Z', before: '2026-10-05T14:00:00.000Z' }),
    [],
    'an hour already rolled is not again',
  );
});

test('a percentile in the open last bucket is at most the most seen, never Infinity', () => {
  const b = [0, 0, 0, 0, 0, 0, 0, 0, 0, 10];
  assert.equal(percentileOf(b, PASS_BOUNDS, 6000, 9000, 0.95), 8850, 'from the least seen to the most');
  assert.ok(Number.isFinite(percentileOf(b, PASS_BOUNDS, 6000, 9000, 1)));
  assert.equal(percentileOf(b, PASS_BOUNDS, 6000, 9000, 1), 9000);
});

test('a day past its retention: with 30 on 2026-10-05, 2026-09-05 is kept and 2026-09-04 is past it; unset keeps every one', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.deepEqual(daysPast(['2026-09-03', '2026-09-04', '2026-09-05', '2026-10-05'], now, 30), ['2026-09-03', '2026-09-04']);
  assert.deepEqual(daysPast(['2000-01-01'], now, undefined), []);
});

test("a memo keeps the days its tier's widest range reaches: the minute days of the last 24h, and every hour day, years old included", () => {
  const now = Date.parse('2026-10-05T14:00:00Z');
  assert.deepEqual(memoDays('minute', ['2026-10-03', '2026-10-04', '2026-10-05'], now), ['2026-10-04', '2026-10-05']);
  assert.deepEqual(memoDays('hour', ['2020-01-01', '2026-08-01', '2026-10-05'], now), ['2020-01-01', '2026-08-01', '2026-10-05']);
});

test('a range reads its points: minutes for 24h, hours for 7d, days merged from hours for all, oldest first', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const line = (t: string, v: number): RollupLine => ({ t, s: 'store.runs', l: {}, n: 1, sum: v, min: v, max: v, last: v });
  const lines = [line('2026-10-03T10:00:00.000Z', 3), line('2026-10-04T10:00:00.000Z', 5), line('2026-10-04T11:00:00.000Z', 9)];
  const all = seriesOf('all', lines, now);
  assert.equal(all.span, 'day');
  assert.deepEqual(
    all.series[0].points.map((p) => [p.t, p.n, p.max, p.last]),
    [
      ['2026-10-03T00:00:00.000Z', 1, 3, 3],
      ['2026-10-04T00:00:00.000Z', 2, 9, 9],
    ],
  );
  assert.equal(seriesOf('7d', lines, now).series[0].points.length, 3);
  assert.equal(seriesOf('24h', lines, now).series.length, 0, 'none in the last day');
  assert.equal(seriesOf('24h', lines, now).span, 'minute');
});

test("a period's health from its lines, and each figure null where nothing was kept", () => {
  const empty = healthOf([]);
  assert.deepEqual(empty, {
    pass: { p50: null, p95: null },
    runs: null,
    reads: null,
    load: { p95: null, max: null },
    queued: null,
    waitMs: null,
    checkLoad: null,
    quota: [],
  });
  const ring = [
    pass('2026-10-05T10:00:01Z', 10, { waitMs: 100, load: 0.2, quota: { h: { w: 10 } } }),
    pass('2026-10-05T10:01:01Z', 30, { waitMs: 900, load: 0.8, queued: 4, quota: { h: { w: 30 } } }),
    pass('2026-10-05T10:02:01Z', 20, { waitMs: 0, load: 0.4, quota: { h: { w: 25 } } }),
  ];
  const minutes = rollMinutes(ring, ['2026-10-05T10:00:00.000Z', '2026-10-05T10:01:00.000Z', '2026-10-05T10:02:00.000Z']);
  const health = healthOf(mergeLines(minutes, 3_600_000));
  assert.deepEqual([health.queued, health.waitMs, health.load.max, health.runs], [4, 900, 0.8, 40]);
  assert.deepEqual(health.quota, [{ harness: 'h', window: 'w', latest: 25, peak: 30 }]);
  assert.ok(health.pass.p50! >= 10 && health.pass.p95! <= 30);
  assert.equal(lineOf(minutes, 'pass.ms', '2026-10-05T10:01:00.000Z').max, 30);
});
