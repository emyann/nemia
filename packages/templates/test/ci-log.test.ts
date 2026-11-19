/**
 * `failures`, the lines of a failing job's log `pull-request.ts` hands the next try, on a log of the board's e2e shard: a runner that
 * says the page that failed as `<tool>: FAILED — <subject>: <why>`, from each worker and again from the runner, gives that page once, with
 * the line saying what it looked like, rather than npm's tail; and on Vitest's logs, a test it says failed is given once, with its error,
 * its diff and the frame under it, a story whose picture differs and a file that failed whole too, at most 40 lines of a job.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { failures } from '../sdlc/carried/ci-log.ts';

/** The page that failed, as the e2e runner names it, and the reason it gives. */
const PAGE = 'the run page (/runs/give-the-board-a-look-e2e0) in the dark theme';
const WHY = "tokens's spec says the stat is drawn — not visible after 10000 ms";
const SHOT = '.e2e/run-dark.png';

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

/** The escape a terminal's colour code opens with, built from its code so no raw one sits in this file. */
const ESC = String.fromCharCode(0x1b);

/** A test job's log as Vitest prints it under a task runner's prefix, coloured, stamped: the file's run, then its summary of failures. */
const VITEST = [
  `web:test:  ${ESC}[31m❯${ESC}[39m test/layout.test.ts (3 tests | 1 failed) 12ms`,
  `web:test:    ${ESC}[32m✓${ESC}[39m a folder in its place passes 1ms`,
  `web:test:    ${ESC}[31m×${ESC}[39m the layout > refuses a folder out of place 4ms`,
  "web:test:      → expected [ 'src/x' ] to deeply equal []",
  'web:test: ',
  'web:test: ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯',
  'web:test: ',
  `web:test: ${ESC}[41m FAIL ${ESC}[49m test/layout.test.ts > the layout > refuses a folder out of place`,
  "web:test: AssertionError: expected [ 'src/x' ] to deeply equal []",
  'web:test: ',
  'web:test: - Expected',
  'web:test: + Received',
  'web:test: ',
  'web:test: - []',
  'web:test: + [ "src/x" ]',
  'web:test: ',
  `web:test:  ${ESC}[36m❯${ESC}[39m test/layout.test.ts:42:7`,
  'web:test:      42|   assert.deepEqual(out, []);',
  'web:test:        |       ^',
  'web:test: ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯',
  'web:test:  Test Files  1 failed | 4 passed (5)',
  'web:test:       Tests  1 failed | 30 passed (31)',
  'Process completed with exit code 1.',
].map((line) => `2026-11-19T09:00:00.0000000Z ${line}`);

test('a Vitest job gives the test that failed once, with its error, its diff and its frame, plain, and not the tail', () => {
  const { lines, tests } = failures(VITEST.join('\n'));
  assert.equal(tests, true, 'a test Vitest marks failed is a failing line, so no tail is given');
  assert.ok(!lines.some((line) => line.includes(ESC)), `no colour code reaches the step:\n${JSON.stringify(lines)}`);
  const named = lines.filter((line) => line.includes('refuses a folder out of place'));
  assert.equal(named.length, 1, `the test once:\n${lines.join('\n')}`);
  assert.ok(named[0].includes('FAIL'), `told where its error is, in the summary:\n${lines.join('\n')}`);
  for (const told of ['AssertionError: expected', '- Expected', '+ Received', '+ [ "src/x" ]', '❯ test/layout.test.ts:42:7'])
    assert.ok(
      lines.some((line) => line.includes(told)),
      `${told} tells why:\n${lines.join('\n')}`,
    );
  for (const noise of ['✓', 'Test Files', 'Process completed', '(3 tests | 1 failed)', '42|'])
    assert.ok(!lines.some((line) => line.includes(noise)), `${noise} is no reason:\n${lines.join('\n')}`);
});

test("a story whose picture differs, under its project's name, and a file that failed before its tests ran, are each given", () => {
  const log = [
    ' FAIL  |storybook (chromium)| src/components/look/plate.stories.tsx > Plate > Default',
    'Error: Screenshot does not match the stored reference. 120 pixels (ratio 0.01 of all image pixels) are different.',
    ' ❯ src/components/look/plate.stories.tsx:12:3',
    '⎯⎯⎯[1/2]⎯',
    ' FAIL  test/import.test.ts [ test/import.test.ts ]',
    "Error: Cannot find module './gone.ts'",
  ].join('\n');
  const { lines, tests } = failures(log);
  assert.equal(tests, true, lines.join('\n'));
  for (const told of [
    'plate.stories.tsx > Plate > Default',
    'Screenshot does not match',
    '❯ src/components/look/plate.stories.tsx:12:3',
    'FAIL  test/import.test.ts',
    'Cannot find module',
  ])
    assert.ok(
      lines.some((line) => line.includes(told)),
      `${told}:\n${lines.join('\n')}`,
    );
});

test('a job of many failures gives at most 40 of its lines, the first in order', () => {
  const log = Array.from({ length: 30 }, (_, i) => [` FAIL  test/a.test.ts > case ${i}`, `AssertionError: case ${i} broke`]).flat();
  const { lines } = failures(log.join('\n'));
  assert.equal(lines.length, 40, lines.join('\n'));
  assert.ok(lines[0].includes('case 0') && lines[1].includes('case 0 broke'), lines.join('\n'));
});
