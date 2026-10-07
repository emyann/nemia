/**
 * The e2e's bound on a whole run (`overBound`, e2e/timing.ts) made to refuse with times made up here, never a wait: a whole run one
 * millisecond over it fails, naming its five slowest pages, slowest first; one at the bound or under it passes, and so does a run of some
 * pages or with pictures, however long. And the ranking a run ends with (`slowest`, `rankLines`). No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { E2E_BOUND_MS, overBound, PHASES, rankLines, slowest, type PageTiming } from './e2e/timing.ts';

/** A page's timing whose phases are its whole time, split evenly. */
const timed = (name: string, ms: number, worker = 0): PageTiming => ({
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

test('REFUSED: a whole run one millisecond over the bound fails, naming its five slowest pages, slowest first, with their seconds', () => {
  const why = overBound(E2E_BOUND_MS + 1, SEVEN, true);
  assert.ok(why !== null, 'a whole run over the bound is refused');
  assert.match(why, /^the whole e2e took 480\.0 s, over its bound of 480\.0 s/);
  const named = [...why.matchAll(/^ {4}(\w+) \(dark, worker (\d)\): (\d+\.\d) s \(load /gm)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(named, ['inbox 2 12.0', 'hold 0 10.0', 'factory 1 9.0', 'gate 0 7.0', 'runs 0 4.0']);
  assert.match(why, /more workers \(--workers <n>\)/);
  assert.match(why, /loaded machine.*`nemia retry <run> <step> --recheck`\.$/);
});

test('a whole run at the bound, or under it, passes', () => {
  assert.equal(overBound(E2E_BOUND_MS, SEVEN, true), null);
  assert.equal(overBound(200_000, SEVEN, true), null);
});

test('a run of some pages, or one that pictures them, is held to no bound, however long it takes', () => {
  assert.equal(overBound(E2E_BOUND_MS * 3, SEVEN, false), null);
});

test('a bound given is the one held', () => {
  assert.ok(overBound(1_001, SEVEN, true, 1_000) !== null);
  assert.equal(overBound(999, SEVEN, true, 1_000), null);
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
