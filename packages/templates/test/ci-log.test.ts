/**
 * `failures`, the lines of a failing job's log `pull-request.ts` hands the next try, on a log of the board's e2e shard: a runner that
 * says the page that failed as `<tool>: FAILED — <subject>: <why>`, from each worker and again from the runner, gives that page once, with
 * the line saying what it looked like, rather than npm's tail; and on Vitest's logs, a test it says failed is given once, with its error,
 * its diff and the frame under it, a story whose picture differs and a file that failed whole too, at most 40 lines of a job. And
 * `declaresCi`, whether a tree declares any CI the round's check and the landing can wait on.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { declaresCi, failures } from '../sdlc/carried/ci-log.ts';

describe('a tree declares CI where a workflow file sits directly under .github/workflows/', () => {
  const rows: Array<[string[], boolean]> = [
    [['.github/workflows/ci.yml'], true],
    [['README.md', '.github/workflows/release.yaml'], true],
    [[], false],
    [['README.md', '.github/dependabot.yml'], false],
    [['.github/workflows/README.md'], false],
    [['.github/workflows/nested/ci.yml'], false],
    [['docs/.github/workflows/ci.yml'], false],
  ];
  for (const [paths, declares] of rows)
    test(`${JSON.stringify(paths)} → ${String(declares)}`, () => assert.equal(declaresCi(paths), declares));
});

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

/** The badge Vitest prints a project's name in, as Vitest's project-name formatter prints it: the name padded with a space. */
const badge = (name: string) => `${ESC}[30m${ESC}[42m ${name} ${ESC}[49m${ESC}[39m `;

/** Vitest's summary line of a failed test or file, coloured as on CI: the red ` FAIL ` mark, then the project's badge, then its name. */
const failed = (project: string, name: string) => `${ESC}[41m${ESC}[1m FAIL ${ESC}[22m${ESC}[49m ${badge(project)}${name}`;

/**
 * A test job's log as Vitest 5's default reporter prints it under a task runner's prefix, coloured, stamped: the file's run, where the
 * failed test is `×` with its own name alone under its suite's `❯` line, then its summary of failures, where it is named by its file and
 * every suite, after its project's badge.
 */
const VITEST = [
  `web:test:  ${ESC}[31m❯${ESC}[39m test/layout.test.ts (3 tests | 1 failed) 12ms`,
  `web:test:    ${ESC}[31m❯${ESC}[39m the layout`,
  `web:test:      ${ESC}[32m✓${ESC}[39m a folder in its place passes 1ms`,
  `web:test: ${ESC}[31m      × refuses a folder out of place${ESC}[39m${ESC}[2m 4ms${ESC}[22m`,
  "web:test:        → expected [ 'src/x' ] to deeply equal []",
  'web:test: ',
  'web:test: ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯',
  'web:test: ',
  `web:test: ${failed('node', 'test/layout.test.ts > the layout > refuses a folder out of place')}`,
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

test('a Vitest job gives the test that failed once, by its summary, with its error, its diff and its frame, plain, and not the tail', () => {
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

test('two tests of one name in two suites are each given, and a test only seen where it ran is given there', () => {
  const log = [
    '    ❯ the start',
    '      × takes a card 2ms',
    '    ❯ the retry',
    '      × takes a card 3ms',
    '      × keeps its step 1ms',
    "        → expected 'implement' to be 'review'",
    failed('node', 'test/verbs.test.ts > the start > takes a card'),
    'AssertionError: expected 1 to be 0',
    failed('node', 'test/verbs.test.ts > the retry > takes a card'),
    'AssertionError: expected 2 to be 0',
  ].join('\n');
  const { lines } = failures(log);
  assert.ok(!lines.some((line) => /× takes a card/.test(line)), `a test its summary names is told there:\n${lines.join('\n')}`);
  for (const told of ['the start > takes a card', 'expected 1 to be 0', 'the retry > takes a card', 'expected 2 to be 0'])
    assert.ok(
      lines.some((line) => line.includes(told)),
      `${told}:\n${lines.join('\n')}`,
    );
  assert.ok(
    lines.some((line) => line.includes('× keeps its step')),
    `a test no summary names is told where it ran:\n${lines.join('\n')}`,
  );
  assert.ok(
    lines.some((line) => line.includes("→ expected 'implement'")),
    `with its error:\n${lines.join('\n')}`,
  );
});

test("a story whose picture differs, under its project's badge or its bars, and a file that failed before its tests ran, are each given", () => {
  const log = [
    failed('storybook (chromium)', 'src/components/look/plate.stories.tsx > Plate > Default'),
    'Error: Screenshot does not match the stored reference. 120 pixels (ratio 0.01 of all image pixels) are different.',
    ' ❯ src/components/look/plate.stories.tsx:12:3',
    '⎯⎯⎯[1/3]⎯',
    ' FAIL  |storybook (chromium)| src/components/look/tag.stories.tsx > Tag > Default',
    'Error: Screenshot does not match the stored reference.',
    '⎯⎯⎯[2/3]⎯',
    ' FAIL  test/import.test.ts [ test/import.test.ts ]',
    "Error: Cannot find module './gone.ts'",
  ].join('\n');
  const { lines, tests } = failures(log);
  assert.equal(tests, true, lines.join('\n'));
  for (const told of [
    'plate.stories.tsx > Plate > Default',
    'Screenshot does not match the stored reference. 120 pixels',
    '❯ src/components/look/plate.stories.tsx:12:3',
    'tag.stories.tsx > Tag > Default',
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

test('one suite and test of one name in two files are each given, and a summary that names the line is the same test', () => {
  const log = [
    failed('node', 'test/a.test.ts > the layout > refuses a folder'),
    'AssertionError: a broke',
    ' FAIL  test/b.test.ts > the layout > refuses a folder',
    'AssertionError: b broke',
    failed('node', 'test/b.test.ts:12 > the layout > refuses a folder'),
    'AssertionError: b broke',
  ].join('\n');
  const { lines } = failures(log);
  assert.equal(lines.filter((line) => line.includes('the layout > refuses a folder')).length, 2, lines.join('\n'));
  for (const told of ['a broke', 'b broke'])
    assert.ok(
      lines.some((line) => line.includes(told)),
      `${told}:\n${lines.join('\n')}`,
    );
});
