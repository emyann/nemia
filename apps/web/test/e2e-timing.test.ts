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
  shardPages,
  shardsMissing,
  type PageTiming,
  type ShardPages,
} from './e2e/timing.ts';

/** The names of `pages`, sorted, for a comparison that does not care which shard dealt which. */
const orderOfNames = (pages: readonly PageTiming[]): string[] => pages.map((p) => p.name).sort();

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

/**
 * The shards' reading: four shard files are a whole run between them, and their pages are summed as one run's — the bound is additive,
 * and a shard of its own is not held to it (`planOf`, pages.ts). What is missing, doubled, out of range or of another run is refused by
 * a sentence naming the fix, since each of those silently holds the e2e to less than the whole.
 */
const shardsOf = (of: number, pages: readonly PageTiming[]): ShardPages[] =>
  Array.from({ length: of }, (_, i) => ({ shard: i + 1, of, pages: pages.filter((_p, at) => at % of === i) }));

test('the shards sum to the sum of their pages, however they were dealt', () => {
  for (const n of [1, 2, 4, 7]) {
    const shards = shardsOf(n, SEVEN);
    assert.equal(shardsMissing(shards), null, `of ${n}: every shard is there`);
    assert.deepEqual(orderOfNames(shardPages(shards)), orderOfNames(SEVEN), `of ${n}: the shards together are the run's pages, each once`);
    assert.equal(pagesLine(shardPages(shards)), pagesLine(SEVEN), `of ${n}: the sum is the same whichever shard a page was dealt to`);
  }
});

test('the shards together are held to the bound a whole run is, naming the slowest pages past it', () => {
  const under = shardsOf(4, [timed('a', PAGES_BOUND_MS / 2), timed('b', PAGES_BOUND_MS / 2)]);
  assert.equal(overBound(shardPages(under), true), null, 'the shards at the bound pass, as a whole run at it does');
  const over = shardsOf(4, [timed('a', PAGES_BOUND_MS / 2), timed('b', PAGES_BOUND_MS / 2), timed('slowest', 1)]);
  const late = overBound(shardPages(over), true);
  assert.match(String(late), /^the pages of the whole e2e cost .* over their bound of /);
  assert.match(String(late), /slowest \(dark, worker 0\)/, 'the refusal names the slowest page of every shard together');
  assert.equal(overBound(shardsOf(4, SEVEN)[0].pages, true), null, 'and one shard alone is far under it: a shard is never the whole');
});

test('REFUSED: a shard that did not write its page times, by name and by the command that writes it', () => {
  const three = shardsOf(4, SEVEN).filter((shard) => shard.shard !== 3);
  assert.equal(
    shardsMissing(three),
    'shard 3 of 4 wrote no page times here, so the pages it visited are in no sum and the e2e is held to less than the whole: ' +
      'run `npm run e2e -- --shard 3 --of 4` and put pages-3-of-4.json here',
  );
  assert.match(
    String(shardsMissing(shardsOf(4, SEVEN).filter((shard) => shard.shard > 2))),
    /^shards 1 and 2 of 4 wrote no page times here/,
    'two missing shards are both named',
  );
});

test('REFUSED: no shard file at all, a shard written twice, a shard out of range, and two runs’ files together', () => {
  assert.match(
    String(shardsMissing([])),
    /^no shard of the e2e wrote its page times here: run `npm run e2e -- --shard <i> --of <n>` for every shard of n/,
  );
  const [one, two] = shardsOf(4, SEVEN);
  assert.equal(
    shardsMissing([one, two, two, ...shardsOf(4, SEVEN).slice(2)]),
    'shard 2 of 4 wrote its page times twice, and its pages would be counted twice in the sum: ' +
      'give this one run’s shards alone, since a shard of a run is run once',
  );
  assert.equal(
    shardsMissing([{ shard: 5, of: 4, pages: [] }, ...shardsOf(4, SEVEN)]),
    'shard 5 is no shard of 4, so the run it belongs to is not the one these files are of: ' +
      'give this one run’s shards alone (pages-<i>-of-4.json, i from 1 to 4)',
  );
  assert.equal(
    shardsMissing([...shardsOf(4, SEVEN), { shard: 1, of: 5, pages: [] }]),
    'the shard files here disagree about how many shards there are (4 and 5), so they are of two different runs ' +
      'and their pages are no one run’s: delete the ones left over, and give this one run’s shards alone',
  );
});
