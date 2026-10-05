/**
 * The Stats page's section on the system, as data (`src/lib/series.ts`): the traces each chart draws off the series served, where a value
 * falls in a drawing, the day a range's landings are read from, and each factory's landings and their cost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import type { SeriesPoint, SeriesRead } from '../src/lib/api.ts';
import { StatsSchema } from '../src/lib/api/stats.ts';
import { landingsOf, placeOf, rangeFrom, systemCharts } from '../src/lib/series.ts';

const point = (t: string, max: number, over: Partial<SeriesPoint> = {}): SeriesPoint => ({
  t,
  n: 1,
  mean: max,
  min: max,
  max,
  last: max,
  ...over,
});

const READ: SeriesRead = {
  range: '24h',
  span: 'minute',
  from: '2026-10-04T12:00:00.000Z',
  to: '2026-10-05T12:00:00.000Z',
  series: [
    { s: 'store.runs', l: {}, points: [point('2026-10-05T10:00:00.000Z', 40), point('2026-10-05T10:01:00.000Z', 44)] },
    {
      s: 'pass.ms',
      l: {},
      points: [point('2026-10-05T10:01:00.000Z', 90, { p50: 20, p95: 80 }), point('2026-10-05T10:00:00.000Z', 30, { p50: 10, p95: 25 })],
    },
    { s: 'quota.used', l: { harness: 'h', window: 'week' }, points: [point('2026-10-05T10:00:00.000Z', 42)] },
    { s: 'pass.phase.ms', l: { phase: 'git' }, points: [point('2026-10-05T10:00:00.000Z', 7)] },
  ],
};

test("a pass's chart draws its p95 and p50 on one scale, oldest first, and the store's most runs on its own", () => {
  const [pass] = systemCharts(READ);
  const by = Object.fromEntries(pass.traces.map((x) => [x.key, x]));
  assert.deepEqual(Object.keys(by), ['runs', 'p95', 'p50']);
  assert.deepEqual(
    by.p95.values.map((x) => x.v),
    [25, 80],
  );
  assert.deepEqual(
    by.p50.values.map((x) => x.v),
    [10, 20],
  );
  assert.equal(by.p95.top, 80, 'the p95 and the p50 share the scale of the slower');
  assert.equal(by.p50.top, 80);
  assert.equal(by.runs.top, 44);
  assert.equal(by.runs.area, true);
});

test('a chart with nothing kept has no trace, and quota is a trace a window, scaled to 100', () => {
  const [, admission, quota] = systemCharts(READ);
  assert.equal(admission.traces.length, 0, 'no wait and no queue kept: the chart says nothing was');
  assert.deepEqual(
    quota.traces.map((x) => [x.label, x.top, x.values.length]),
    [['h week', 100, 1]],
  );
});

test("a value's place: the range's first moment at the left, its last at the right, 0 at the foot and the top at the head", () => {
  const frame = { from: READ.from, to: READ.to, top: 100, width: 300, height: 80 };
  assert.deepEqual(placeOf({ t: READ.from, v: 0 }, frame), [0, 80]);
  assert.deepEqual(placeOf({ t: READ.to, v: 100 }, frame), [300, 0]);
  assert.deepEqual(placeOf({ t: '2026-10-05T00:00:00.000Z', v: 50 }, frame), [150, 40]);
  assert.deepEqual(placeOf({ t: '2026-10-01T00:00:00.000Z', v: -3 }, frame), [0, 80], 'before the range and below 0: at its edges');
});

test("a range's landings are read from the day it reaches back to, and from every day for all", () => {
  const now = new Date('2026-10-05T03:00:00Z');
  assert.equal(rangeFrom('24h', now), '2026-10-04');
  assert.equal(rangeFrom('7d', now), '2026-09-28');
  assert.equal(rangeFrom('30d', now), '2026-09-05');
  assert.equal(rangeFrom('all', now), null);
});

test("a factory's landings: each day's landed and cost, their totals, a factory that landed nothing left out, the most landed first", () => {
  const rows = landingsOf([
    { key: 'quiet', days: [{ day: '2026-10-04', landed: 0, costPerLanded: null }] },
    {
      key: 'nemia',
      days: [
        { day: '2026-10-04', landed: 2, costPerLanded: 3 },
        { day: '2026-10-05', landed: null, costPerLanded: null },
      ],
    },
    { key: 'other', days: [{ day: '2026-10-05', landed: 1, costPerLanded: null }] },
    { key: null, days: [{ day: '2026-10-05', landed: 9, costPerLanded: 1 }] },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.factory, r.landed, r.costUsd, r.days.map((d) => [d.landed, d.costUsd])]),
    [
      [
        'nemia',
        2,
        6,
        [
          [2, 6],
          [0, null],
        ],
      ],
      ['other', 1, null, [[1, null]]],
    ],
  );
});

test("the stats' health decodes as the api answers it, and an answer without it, from an older api, still decodes", () => {
  const base = {
    from: null,
    to: '2026-10-05',
    all: { days: [], steps: [], tiles: { last: tile(), before: tile() }, marks: [] },
    unreadable: [],
  };
  const health = {
    pass: { p50: 12, p95: 80 },
    runs: 40,
    reads: 6,
    load: { p95: 0.5, max: 1.2 },
    queued: 2,
    waitMs: 9000,
    checkLoad: null,
    quota: [{ harness: 'h', window: 'week', latest: 42, peak: 50 }],
  };
  assert.deepEqual(Schema.decodeUnknownSync(StatsSchema)({ ...base, health }).health, health);
  assert.equal(Schema.decodeUnknownSync(StatsSchema)(base).health, undefined);
});

function tile() {
  return {
    runs: 0,
    landed: null,
    rounds: null,
    firstTry: null,
    costPerLanded: null,
    timePerLanded: null,
    tries: 0,
    refused: 0,
    gateWaitMs: null,
    deniedPerTry: null,
    skillsPerTry: null,
    from: '2026-09-22',
    to: '2026-10-05',
  };
}
