/**
 * `failures`, the lines of a failing job's log `pull-request.ts` hands the next try, on a log of the board's e2e shard: a runner that
 * says the page that failed as `<tool>: FAILED — <subject>: <why>`, from each worker and again from the runner, gives that page once, with
 * the line saying what it looked like, rather than npm's tail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failures } from '../sdlc/carried/ci-log.ts';

/** The page that failed, as the e2e runner names it, and the reason it gives. */
const PAGE = 'the run page (/runs/give-the-board-a-look-e2e0) in the dark theme';
const WHY = "tokens's spec says the stat is drawn — not visible after 10000 ms";
const SHOT = '/home/runner/work/r/r/apps/web/.e2e/run-dark.png';

/** A shard's log as GitHub serves it: stamped, the worker's lines tagged `[w1] `, then the runner's own, npm's, and the upload's. */
const SHARD = [
  '[w0] e2e: the runs page in the dark theme passed',
  `[w1] e2e: FAILED — ${PAGE}: ${WHY}`,
  '[w1] Call log:',
  '[w1]   - waiting for getByText(/stat/)',
  `[w1]   what it looked like: ${SHOT}`,
  '[w1] api: GET /runs/x 200',
  '[w1] api: Error: the server logged an error beside the page',
  '',
  `[w1] e2e: FAILED — ${PAGE}: ${WHY}`,
  `[w1]   what it looked like: ${SHOT}`,
  '',
  `e2e: worker 1 FAILED — ${PAGE}: ${WHY}`,
  `  what it looked like: ${SHOT}`,
  '',
  `e2e: FAILED — ${PAGE}: ${WHY}`,
  `  what it looked like: ${SHOT}`,
  'npm error Lifecycle script `e2e` failed with error:',
  'npm error code 1',
  'Run actions/upload-artifact@v4',
  'Process completed with exit code 1.',
].map((line) => `2026-11-10T09:00:00.0000000Z ${line}`);

test('a failed shard gives each page that failed once, with what it looked like, and not the tail', () => {
  const { lines, tests } = failures([...SHARD, 'Post job cleanup.'].join('\n'));
  assert.equal(tests, true, 'a page that failed is a failing line, so no tail is given');
  assert.equal(lines.filter((line) => line.includes(`FAILED — ${PAGE}: ${WHY}`)).length, 1, `the page once:\n${lines.join('\n')}`);
  assert.equal(lines.filter((line) => line.includes(`what it looked like: ${SHOT}`)).length, 1, lines.join('\n'));
  const at = lines.findIndex((line) => line.includes(`FAILED — ${PAGE}`));
  assert.ok(lines[at + 1]?.includes('what it looked like:'), `what it looked like follows the page:\n${lines.join('\n')}`);
  for (const noise of ['Lifecycle script', 'upload-artifact', 'Call log:', 'waiting for', 'api: '])
    assert.ok(!lines.some((line) => line.includes(noise)), `${noise} is no reason:\n${lines.join('\n')}`);
});

test('two pages that failed are each given, in the order they failed; a page in another theme is another page', () => {
  const other = PAGE.replace('dark', 'light');
  const log = [...SHARD, `e2e: worker 0 FAILED — ${other}: ${WHY}`, `  what it looked like: ${SHOT}`].join('\n');
  const pages = failures(log).lines.filter((line) => line.includes('FAILED — '));
  assert.equal(pages.length, 2, pages.join('\n'));
  assert.ok(pages[0].includes(PAGE) && pages[1].includes(other), pages.join('\n'));
});
