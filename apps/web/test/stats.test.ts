import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { StatsSchema, type Stats, type StatsDay } from '../src/lib/api/stats.ts';
import { apiQueryOf, HEADLINES, marksByDay, NONE, periodFrom, repoWord, searchOf, seriesOf, trendOf, wordsOf } from '../src/lib/stats.ts';

/** A day with nothing measured but what it is given. */
const day = (d: string, given: Partial<StatsDay> = {}): StatsDay => ({
  day: d,
  runs: 0,
  landed: null,
  rounds: null,
  firstTry: null,
  costPerLanded: null,
  timePerLanded: null,
  tries: 0,
  refused: 0,
  gateWaitMs: null,
  ...given,
});

test("a period's first day is counted back from today in UTC, whatever the hour or the zone; All has none", (t) => {
  const zone = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
  t.after(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });
  assert.equal(periodFrom('28d', new Date('2026-09-30T23:30:00Z')), '2026-09-03');
  assert.equal(periodFrom('28d', new Date('2026-10-01T00:30:00Z')), '2026-09-04');
  assert.equal(periodFrom('28d', new Date('2026-10-01T01:30:00+02:00')), '2026-09-03', 'refused: the day of a local clock ahead of UTC');
  assert.equal(periodFrom('90d', new Date('2026-09-30T12:00:00Z')), '2026-07-03');
  assert.equal(periodFrom('all', new Date('2026-09-30T12:00:00Z')), null);
});

test('the api is asked for a factory and a repository to keep as ofFactory and ofRepo, never as the place it answers in', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const query = new URLSearchParams(apiQueryOf({ factory: 'nemia', repo: '/r/x', workflow: 'build' }, now));
  assert.equal(query.get('ofFactory'), 'nemia');
  assert.equal(query.get('ofRepo'), '/r/x');
  assert.equal(query.get('workflow'), 'build');
  assert.equal(query.get('from'), '2026-09-03', 'the default period is the 28 days of the two tiles');
  assert.equal(query.has('factory'), false, 'refused: factory= names the place the request is answered in');
  assert.equal(query.has('repo'), false, 'refused: repo= names the place the request is answered in');
  const all = new URLSearchParams(apiQueryOf({ period: 'all', agent: 'ada' }, now, 'step'));
  assert.equal(all.has('from'), false, 'All asks for every day');
  assert.equal(all.get('by'), 'step');
  assert.equal(all.get('agent'), 'ada');
});

test('a search keeps a period the page offers and each filter given a value, and drops the rest, so a hand-typed address never asks what the api refuses', () => {
  assert.deepEqual(searchOf({ period: 'all', workflow: 'build', agent: '', step: 3, ofFactory: 'x', from: '2026-9-3' }), {
    period: 'all',
    workflow: 'build',
  });
  assert.deepEqual(searchOf({ period: '90d', repo: '/r/x', factory: 'nemia' }), { period: '90d', repo: '/r/x', factory: 'nemia' });
  assert.deepEqual(searchOf({ period: '28d' }), {}, 'the default period is left out of the address');
  assert.deepEqual(searchOf({ period: 'week' }), {}, 'refused: a period the page does not offer');
});

test('a day nothing measured stays apart from a measured 0: its value is null, its words are —, and the scale is over the known values', () => {
  const rounds = HEADLINES.find((h) => h.key === 'rounds')!;
  const series = seriesOf([day('2026-09-28'), day('2026-09-29', { rounds: 0 }), day('2026-09-30', { rounds: 2 })], 'rounds');
  assert.deepEqual(
    series.points.map((p) => p.value),
    [null, 0, 2],
  );
  assert.equal(series.max, 2);
  assert.equal(rounds.words(null), NONE);
  assert.equal(rounds.words(0), '0');
  assert.equal(seriesOf([day('2026-09-30')], 'rounds').max, 0, 'no known value: no scale beyond 0');
});

test('each number is worded as wf stats words it', () => {
  const words = wordsOf({
    runs: 3,
    landed: 2,
    rounds: 2.46,
    firstTry: 0.415,
    costPerLanded: 3.1,
    timePerLanded: 3_900_000,
    tries: 12,
    refused: 0,
    gateWaitMs: 42_000,
  });
  assert.deepEqual(words, {
    rounds: '2.5',
    firstTry: '42%',
    costPerLanded: '$3.10',
    timePerLanded: '1h05m',
    landed: '2',
    runs: '3',
    tries: '12',
    refused: '0',
    gateWaitMs: '42s',
  });
  const labels = HEADLINES.map((h) => h.label);
  assert.deepEqual(labels, ['rounds', 'first try', 'cost/landed', 'time/landed', 'landed', 'runs', 'tries', 'refused', 'gate wait']);
  const cost = HEADLINES.find((h) => h.key === 'costPerLanded')!;
  assert.equal(cost.words(0.004), '$0.004', 'a cost under a cent keeps three figures, as dollars does');
  const time = HEADLINES.find((h) => h.key === 'timePerLanded')!;
  assert.equal(time.words(59_000), '59s');
  assert.equal(time.words(125_000), '2m05s');
  assert.equal(time.words(90_000_000), '1d01h');
});

test('a tile says which way a number went against the 14 days before, and nothing where either is not measured', () => {
  assert.equal(trendOf(3, 1), '↑');
  assert.equal(trendOf(1, 3), '↓');
  assert.equal(trendOf(2, 2), '=');
  assert.equal(trendOf(0, null), null);
  assert.equal(trendOf(null, 0), null);
});

test('the marks are gathered by their day, in the order served', () => {
  const mark = (d: string, name: string) => ({
    day: d,
    kind: 'agent' as const,
    name,
    run: `r-${name}`,
    since: 'r-0',
    factory: 'nemia',
    workflow: 'build',
    repo: null,
    steps: [],
    agents: [],
  });
  const byDay = marksByDay([mark('2026-09-29', 'ada'), mark('2026-09-30', 'seldon'), mark('2026-09-29', 'iris')]);
  assert.deepEqual([...byDay.keys()], ['2026-09-29', '2026-09-30']);
  assert.deepEqual(
    byDay.get('2026-09-29')!.map((m) => m.name),
    ['ada', 'iris'],
  );
});

test("a repository is named by its folder's name", () => {
  assert.equal(repoWord('/home/me/code/nemia'), 'nemia');
  assert.equal(repoWord('/home/me/code/nemia/'), 'nemia');
});

/** An answer as the api serves it, with keys the page does not read. */
const served = {
  from: '2026-09-29',
  to: '2026-09-30',
  by: null,
  filters: {},
  all: {
    total: day('total'),
    days: [day('2026-09-29'), day('2026-09-30', { rounds: 0, firstTry: null })],
    steps: [{ step: 'implement' }],
    tiles: {
      last: { ...day('x', { runs: 2 }), from: '2026-09-17', to: '2026-09-30' },
      before: { ...day('x'), from: '2026-09-03', to: '2026-09-16' },
    },
    marks: [
      {
        day: '2026-09-30',
        kind: 'skill',
        name: 'look',
        run: 'r-2',
        since: 'r-1',
        factory: 'nemia',
        workflow: 'build',
        repo: null,
        steps: ['implement'],
        agents: [null],
      },
    ],
  },
  groups: [],
  unreadable: ['r-bad'],
};

test('the served stats decode with every null kept, and the keys the page does not read are dropped', () => {
  const stats: Stats = Schema.decodeUnknownSync(StatsSchema)(served);
  assert.equal(stats.all.days[1].firstTry, null);
  assert.equal(stats.all.days[1].rounds, 0);
  assert.equal(stats.all.tiles.last.landed, null);
  assert.equal(stats.all.marks[0].repo, null);
  assert.equal(stats.all.marks[0].agents[0], null);
  assert.equal('groups' in stats, false);
  assert.equal('steps' in stats.all, false);
  assert.equal('total' in stats.all, false);
  assert.throws(
    () => Schema.decodeUnknownSync(StatsSchema)({ ...served, all: { ...served.all, marks: [{ ...served.all.marks[0], kind: 'file' }] } }),
    'refused: a mark of a kind the page does not know',
  );
});
