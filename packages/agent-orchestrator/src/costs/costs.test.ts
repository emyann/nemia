/**
 * What recent runs of a workflow cost (`costsOf`, `costs.ts`), folded from hand-made facts as `nemia stats` reads them: which runs count,
 * a step's tries summed within a run, the median and nearest-rank p90, a figure nothing measured being null, and the rounds; and the
 * brief's section that says them (`costsSection`, `costs-words.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunFact, RunKeys, TryFact } from '../stats/index.ts';
import { costsOf, costsSection, medianOf, p90Of, RECENT_RUNS, type WorkflowCosts } from './index.ts';

const NEMIA = { factory: 'nemia', workflow: 'build', repo: '/repos/home' };

/** The run being filed, of `build` in `nemia`. */
const FILING: RunKeys = { run: 'filing', ...NEMIA };

/** A try of `step` in `run`, ended on `day`, costing `costUsd`. */
const aTry = (run: string, step: string, costUsd: number | null, more: Partial<TryFact> = {}): TryFact => ({
  run,
  ...NEMIA,
  day: '2026-10-01',
  step,
  agent: null,
  try: 1,
  ranMs: null,
  checkMs: null,
  costUsd,
  check: null,
  gateWaitMs: null,
  denied: null,
  skills: null,
  due: null,
  rules: null,
  tallies: [],
  landingDeadlineMs: null,
  ...more,
});

/** A finished run of `steps`, costing `costUsd` whole, on `day`. */
const aRun = (run: string, costUsd: number | null, more: Partial<RunFact> = {}): RunFact => ({
  run,
  ...NEMIA,
  day: '2026-10-01',
  steps: ['design', 'implement'],
  agents: [null],
  rounds: [],
  landed: null,
  firstTry: null,
  costUsd,
  wallMs: null,
  ...more,
});

test('only finished runs of the same workflow in the same factory count, never the run being filed nor the tries of a run unfinished', () => {
  const costs = costsOf(
    {
      runs: [
        aRun('mine', 3),
        aRun('intake-run', 100, { workflow: 'intake' }),
        aRun('elsewhere', 100, { factory: 'other' }),
        aRun('filing', 100),
      ],
      tries: [
        aTry('mine', 'design', 1),
        aTry('mine', 'implement', 2),
        aTry('intake-run', 'design', 100, { workflow: 'intake' }),
        aTry('elsewhere', 'design', 100, { factory: 'other' }),
        aTry('filing', 'design', 100),
        aTry('unfinished', 'design', 100),
      ],
    },
    FILING,
  );
  assert.equal(costs.runs, 1);
  assert.deepEqual(
    costs.steps.map((s) => [s.step, s.median]),
    [
      ['design', 1],
      ['implement', 2],
    ],
  );
  assert.deepEqual(costs.run, { runs: 1, median: 3, p90: 3 });
});

test('the window is the first RECENT_RUNS finished runs as handed, newest first, and says the day the oldest of them finished', () => {
  const runs = Array.from({ length: RECENT_RUNS + 5 }, (_, i) => aRun(`r${i}`, i, { day: `2026-09-${String(30 - i).padStart(2, '0')}` }));
  const costs = costsOf({ runs, tries: runs.map((r) => aTry(r.run, 'design', r.costUsd)) }, FILING);
  assert.equal(costs.runs, RECENT_RUNS);
  assert.equal(costs.since, `2026-09-${String(30 - (RECENT_RUNS - 1)).padStart(2, '0')}`);
  assert.equal(costs.steps[0].runs, RECENT_RUNS);
  assert.equal(costs.run.p90, 17, 'the 25 handed, 0..24, are cut to the first 20, 0..19');
});

test("a step's tries within one run are summed, a loop's rounds among them, and counted", () => {
  const costs = costsOf(
    {
      runs: [aRun('a', 9), aRun('b', 4)],
      tries: [
        aTry('a', 'implement', 2),
        aTry('a', 'implement', 3, { try: 2 }),
        aTry('a', 'implement', 1, { try: 3 }),
        aTry('b', 'implement', 4),
      ],
    },
    FILING,
  );
  const implement = costs.steps.find((s) => s.step === 'implement')!;
  assert.equal(implement.median, 5, 'a run of 2 + 3 + 1 = 6 and one of 4: their median is 5');
  assert.equal(implement.p90, 6);
  assert.deepEqual(implement.tries, { median: 2, max: 3 });
});

test('the median is the mean of the two middle values for an even count, and the p90 the nearest rank: the max over three', () => {
  const ten = [10, 3, 1, 7, 2, 9, 4, 8, 6, 5];
  assert.equal(medianOf(ten), 5.5);
  assert.equal(p90Of(ten), 9);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(p90Of([3, 1, 2]), 3);
  assert.equal(medianOf([]), null);
  assert.equal(p90Of([]), null);
});

test('nothing measured is null, never 0: a step never measured is left out, and a run with an unmeasured session leaves the run line', () => {
  const costs = costsOf(
    {
      runs: [aRun('a', 10), aRun('b', null)],
      tries: [aTry('a', 'design', 4), aTry('a', 'implement', null), aTry('b', 'design', 2), aTry('b', 'implement', null)],
    },
    FILING,
  );
  assert.deepEqual(
    costs.steps.map((s) => s.step),
    ['design'],
  );
  assert.deepEqual(costs.run, { runs: 1, median: 10, p90: 10 }, 'only the run every session of which was measured');
  const none = costsOf({ runs: [], tries: [] }, FILING);
  assert.deepEqual(none, {
    factory: 'nemia',
    workflow: 'build',
    runs: 0,
    since: null,
    steps: [],
    run: { runs: 0, median: null, p90: null },
    rounds: { median: null, max: null },
  });
});

test("the steps follow the newest run's order, and a step it does not have follows in the order met", () => {
  const costs = costsOf(
    {
      runs: [aRun('new', 3, { steps: ['plan', 'implement'] }), aRun('old', 3, { steps: ['design', 'implement'] })],
      tries: [aTry('old', 'design', 1), aTry('old', 'implement', 1), aTry('new', 'implement', 1), aTry('new', 'plan', 1)],
    },
    FILING,
  );
  assert.deepEqual(
    costs.steps.map((s) => s.step),
    ['plan', 'implement', 'design'],
  );
});

test("the rounds are each loop's to acceptance, over the window: their median and most", () => {
  const costs = costsOf({ runs: [aRun('a', 1, { rounds: [1] }), aRun('b', 1, { rounds: [3] }), aRun('c', 1)], tries: [] }, FILING);
  assert.deepEqual(costs.rounds, { median: 2, max: 3 });
});

/** A window of two runs, of two steps, the whole run measured in one. */
const TWO: WorkflowCosts = {
  factory: 'nemia',
  workflow: 'build',
  runs: 2,
  since: '2026-09-30',
  steps: [
    { step: 'design', runs: 2, median: 4.5, p90: 6, tries: { median: 1, max: 1 } },
    { step: 'implement', runs: 1, median: 20, p90: 20, tries: { median: 1.5, max: 2 } },
  ],
  run: { runs: 1, median: 26, p90: 26 },
  rounds: { median: 2, max: 3 },
};

test('the section is a heading, a line on what it covers, a line per step and one for the run: no more', () => {
  const said = costsSection(TWO);
  const lines = said.split('\n').filter(Boolean);
  assert.equal(lines.length, TWO.steps.length + 3, said);
  assert.equal(said.split('\n')[1], '## What runs of this workflow cost');
  assert.equal(
    lines[1],
    'Over the last 2 finished runs of `build` in this factory, since 2026-09-30, per run in USD (tries and rounds included):',
  );
  assert.equal(lines[2], '- design: median 4.50, p90 6.00; tries a run median 1, max 1');
  assert.equal(lines[3], '- implement: median 20.00, p90 20.00; tries a run median 1.5, max 2 (cost measured in 1 run)');
  assert.equal(lines[4], '- the whole run: median 26.00, p90 26.00 (over the 1 run with every session measured); rounds median 2, max 3');
});

test('with no run finished, the section says so in one line', () => {
  const said = costsSection(costsOf({ runs: [], tries: [] }, FILING));
  assert.deepEqual(said.split('\n').filter(Boolean), [
    '## What runs of this workflow cost',
    'No run of `build` has finished in this factory yet: there is no measured cost to go by.',
  ]);
});
