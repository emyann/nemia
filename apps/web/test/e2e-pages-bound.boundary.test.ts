/**
 * The bound job's own verdict: the whole e2e's page time, summed across the shards that ran it, is refused past `PAGES_BOUND_MS`.
 *
 * A boundary test, and the real thing is its whole subject — `pages-bound.ts` is a command with an exit code, and the `e2e-bound` job's
 * verdict is that code. The guard over the workflow (`ci-workflow.test.ts`, `boundDrift`) asks only that the job runs this command; what
 * the command then decides is nobody's but this test's. So it is run as CI runs it, `node test/e2e/pages-bound.ts <dir>` over a directory
 * of shard files, and the three exit codes are each asserted: 0 under the bound, 1 past it, 2 for a set that is no one whole run's. A
 * command that said the sum and exited 0 whatever it was would read alike to this one, and differ exactly where it matters — four shards
 * costing twice the bound, green.
 *
 * The times are made up and no page is visited: the bound's arithmetic is `timing.ts`'s, held pure in `e2e-timing.test.ts`, and this
 * holds what the command does with its answer. `PAGES_BOUND_MS` is imported, never copied: it has one writer.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PAGES_BOUND_MS, PHASES, type PageTiming, type ShardPages } from './e2e/timing.ts';
import { scratch } from './scratch.ts';

/** A page's timing whose phases are its whole time, split evenly: made up here, as `timing.ts` asks, never a wait. */
const timed = (name: string, ms: number): PageTiming => ({
  name,
  theme: 'dark',
  worker: 0,
  ms,
  phases: Object.fromEntries(PHASES.map((phase) => [phase, ms / PHASES.length])) as PageTiming['phases'],
});

/** A directory holding one shard file per entry of `shards`, named as a shard run names it (`pages-<i>-of-<n>.json`). */
function dirOf(shards: readonly ShardPages[]): string {
  const dir = scratch('nemia-pages-bound-');
  for (const shard of shards)
    fs.writeFileSync(path.join(dir, `pages-${shard.shard}-of-${shard.of}.json`), `${JSON.stringify(shard, undefined, 2)}\n`);
  return dir;
}

/** The command, run as the `e2e-bound` job runs it: `node test/e2e/pages-bound.ts <dir>`, from the web app. */
function verdictOf(...dirs: string[]): { status: number; said: string } {
  const ran = spawnSync(process.execPath, [path.join(import.meta.dirname, 'e2e', 'pages-bound.ts'), ...dirs], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: ran.status ?? -1, said: `${ran.stdout}${ran.stderr}` };
}

/**
 * Four shards of one run whose pages cost `ms` all together: two pages a shard, each a ninth of it, and the last shard's second page —
 * `slowest` — carrying the two ninths left over, so the page a refusal must name is the slowest in fact and not by its name alone.
 */
const fourShards = (ms: number): ShardPages[] => {
  const each = Math.floor(ms / 9);
  return [1, 2, 3, 4].map((shard) => ({
    shard,
    of: 4,
    pages: [timed(`page-${shard}`, each), timed(shard === 4 ? 'slowest' : `other-${shard}`, shard === 4 ? ms - each * 7 : each)],
  }));
};

test('the bound job passes a whole run whose shards cost their bound summed, and says the sum', () => {
  const at = verdictOf(dirOf(fourShards(PAGES_BOUND_MS)));
  assert.equal(at.status, 0, `the pages at the bound are within it, as a whole run at it is: ${at.said}`);
  assert.match(at.said, /4 shards over 8 page visits/, `it says what it read: ${at.said}`);
  assert.match(at.said, /the pages cost 1920\.0 s summed, of the 1920\.0 s a whole run's are held to/, at.said);
});

test('the bound job refuses a whole run whose shards cost more than their bound summed, naming its slowest pages', () => {
  const over = verdictOf(dirOf(fourShards(PAGES_BOUND_MS * 2)));
  assert.equal(over.status, 1, `twice the bound, summed across the shards, is a failure: ${over.said}`);
  assert.match(over.said, /the pages of the whole e2e cost 3840\.0 s summed, over their bound of 1920\.0 s/, over.said);
  assert.match(over.said, /slowest \(dark, worker 0\)/, `the refusal names the slowest page of every shard together: ${over.said}`);
  assert.match(over.said, /Make those pages faster/, `and says what to do next: ${over.said}`);
});

test('the bound job refuses a set of shard files that is no one whole run’s, before summing anything', () => {
  const missing = verdictOf(dirOf(fourShards(PAGES_BOUND_MS * 2).filter((shard) => shard.shard !== 3)));
  assert.equal(missing.status, 2, `a missing shard is told apart from a run past its bound: ${missing.said}`);
  assert.match(missing.said, /shard 3 of 4 wrote no page times here/, missing.said);
  assert.doesNotMatch(missing.said, /over their bound/, `nothing is summed from a set that is not a whole run: ${missing.said}`);

  const none = verdictOf(dirOf([]));
  assert.equal(none.status, 2, `a directory with no shard file in it checks nothing: ${none.said}`);
  assert.match(none.said, /no shard of the e2e wrote its page times here/, none.said);

  const nowhere = verdictOf(path.join(scratch('nemia-pages-bound-'), 'not-there'));
  assert.equal(nowhere.status, 2, `a directory that is not there checks nothing: ${nowhere.said}`);
  assert.match(nowhere.said, /is not there, and a shard's page times cannot be read from it/, nowhere.said);

  assert.equal(verdictOf().status, 2, 'and the command with no directory named says which to give it');
});
