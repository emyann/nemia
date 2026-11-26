/**
 * What a run of the e2e says of its pages' time (e2e/timing.ts), with times made up here, never a wait: what a whole run says of its own
 * time past a step's tool (`pastTool`), and the ranking a run ends with (`slowest`, `rankLines`). No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { E2E_BOUND_MS, pastTool, PHASES, rankLines, slowest, type PageTiming } from './e2e/timing.ts';

/** A page's timing whose phases are its whole time, split evenly. */
const timed = (name: string, ms: number, worker = 0) => ({
  name,
  theme: 'dark',
  worker,
  ms,
  phases: Object.fromEntries(PHASES.map((phase) => [phase, ms / PHASES.length])) as PageTiming['phases'],
});

/** Seven pages, in the order a run visited them, none in the order of their times. */
const SEVEN = [
  timed('runs', 4_000),
  timed('factory', 9_000, 1),
  timed('say', 2_000),
  timed('inbox', 12_000, 2),
  timed('gate', 7_000),
  timed('stats', 3_000, 1),
  timed('hold', 10_000),
];

test("a whole run that took longer than a step's tool allows says so: the time, its workers, and the pages a session runs", () => {
  assert.equal(
    pastTool(716_200, 1, true),
    "the whole e2e took 716.2 s over 1 worker, past the 480.0 s that keeps it well under a step's ten-minute tool. " +
      "The time is the machine's, which gave it that worker, not the work's: a session runs the pages its change touches (--pages <name,…>).",
  );
  assert.match(
    pastTool(E2E_BOUND_MS + 1, 4, true) ?? '',
    /^the whole e2e took 480\.0 s over 4 workers, past the 480\.0 s .* gave it those workers/,
  );
});

test('a whole run within that time says nothing of it, nor does a run of some pages', () => {
  assert.equal(pastTool(E2E_BOUND_MS, 1, true), null);
  assert.equal(pastTool(716_200, 1, false), null);
});

test('the slowest pages are ranked slowest first, the list given left as it was', () => {
  const order = SEVEN.map((t) => t.name);
  assert.deepEqual(
    slowest(SEVEN, 3).map((t) => t.name),
    ['inbox', 'hold', 'factory'],
  );
  assert.deepEqual(
    SEVEN.map((t) => t.name),
    order,
  );
  assert.equal(slowest(SEVEN, 20).length, SEVEN.length, 'no more than there are');
  assert.deepEqual(rankLines([timed('runs', 6_000)], 1), [
    'runs (dark, worker 0): 6.0 s (load 1.0 s, idle 1.0 s, expect 1.0 s, quiet 1.0 s, settle 1.0 s, picture 1.0 s)',
  ]);
});
