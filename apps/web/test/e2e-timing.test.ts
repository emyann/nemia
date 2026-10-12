/**
 * The e2e's bound on a whole run (`overBound`, e2e/timing.ts) made to refuse with times made up here, never a wait: a whole run whose
 * pages cost one millisecond over it, summed, fails, naming its five slowest pages, slowest first, whichever workers drew them; one at
 * the bound or under it passes, a run one worker drew alone too, and so does a run of some pages or with pictures, however long. What a
 * whole run says of its own time past a step's tool (`pastTool`) and of its pages' sum (`pagesLine`). And the ranking a run ends with
 * (`slowest`, `rankLines`). No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOUND_WORKERS,
  E2E_BOUND_MS,
  overBound,
  PAGES_BOUND_MS,
  pagesLine,
  pastTool,
  PHASES,
  rankLines,
  slowest,
  type PageTiming,
} from './e2e/timing.ts';

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

/** The pages a whole run draws today, 106 of them, unequal, summing to 676.0 s: every one drawn by `worker`. */
const today = (worker: (i: number) => number, times = 1): PageTiming[] =>
  Array.from({ length: 106 }, (_, i) => timed(`page${String(i).padStart(3, '0')}`, (4_000 + (i % 7) * 800) * times, worker(i)));

/** Today's pages, all drawn by one worker. */
const TODAY = today(() => 0);

/** Today's pages each three times slower, drawn by four workers. */
const SLOW = today((i) => i % 4, 3);

const sumOf = (timings: readonly PageTiming[]): number => timings.reduce((sum, t) => sum + t.ms, 0);

test("the shipped bound is what four workers draw inside the time that keeps a whole run under a step's tool", () => {
  assert.equal(BOUND_WORKERS, 4);
  assert.equal(E2E_BOUND_MS, 480_000);
  assert.equal(PAGES_BOUND_MS, E2E_BOUND_MS * BOUND_WORKERS);
});

test("a whole run of pages as fast as today that one worker drew alone is not refused, though it took longer than a step's tool", () => {
  assert.equal(sumOf(TODAY), 676_000);
  assert.ok(sumOf(TODAY) > E2E_BOUND_MS, 'one worker drew them in more time than the run was once held to');
  assert.equal(overBound(TODAY, true), null);
});

test('REFUSED: the same pages each three times slower fail at four workers, naming the five slowest, slowest first, with their seconds', () => {
  const why = overBound(SLOW, true);
  assert.ok(why !== null, 'a whole run whose pages cost more than the bound, summed, is refused');
  assert.match(why, /^the pages of the whole e2e cost 2028\.0 s summed, over their bound of 1920\.0 s: /);
  assert.match(
    why,
    /at 4 workers that is 507\.0 s at least, against the 480\.0 s that keeps a whole run well under a step's ten-minute tool/,
  );
  const named = [...why.matchAll(/^ {4}(\w+) \(dark, worker (\d)\): (\d+\.\d) s \(load /gm)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(named, ['page006 2 26.4', 'page013 1 26.4', 'page020 0 26.4', 'page027 3 26.4', 'page034 2 26.4']);
  assert.doesNotMatch(why, /--workers/);
  assert.match(why, /loaded machine.*`nemia retry <run> <step> --recheck`\.$/);
});

test('REFUSED: the workers that drew the pages change nothing, one or six', () => {
  for (const worker of [() => 0, (i: number) => i % 6])
    assert.match(overBound(today(worker, 3), true) ?? '', /^the pages of the whole e2e cost 2028\.0 s summed/);
});

test('a whole run whose pages sum to the bound passes, and one millisecond more on one page is refused', () => {
  const at = [timed('runs', PAGES_BOUND_MS - 47_000), ...SEVEN];
  assert.equal(sumOf(at), PAGES_BOUND_MS);
  assert.equal(overBound(at, true), null);
  assert.ok(overBound([timed('runs', PAGES_BOUND_MS - 46_999), ...SEVEN], true) !== null);
});

test('a run of some pages, or one that pictures them, is held to no bound, however long it takes', () => {
  assert.equal(overBound(SLOW, false), null);
});

test('a bound given is the one held', () => {
  assert.ok(overBound(SEVEN, true, 46_999) !== null);
  assert.equal(overBound(SEVEN, true, 47_000), null);
});

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

test("a whole run's pages are said summed, against their bound", () => {
  assert.equal(pagesLine(SEVEN), "the pages cost 47.0 s summed, of the 1920.0 s a whole run's are held to");
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
