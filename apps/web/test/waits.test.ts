/**
 * The wait a test makes on its event (`until`, `bell`, `test/waits.ts`), a copy of the runtime's `src/waits/waits.ts` held here byte for
 * byte, since the board imports no package, and the guard that keeps a hand-written deadline out of the board's tests and e2e pages
 * (`DEADLINES`). The helper's own tests are the runtime's.
 *
 * `DEADLINES` counts, file by file, each `now()` of `Date` or `performance` a number is added to, or a start taken from and held under a
 * bound, under `test/`: each left is the reaper's bound or an e2e assertion's timeout, never a test's wait, and a count only shrinks
 * (`deadlineBreaks`). A change that takes one out lowers its count in the same commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WAITED } from './waits.ts';

const TEST = import.meta.dirname;
const PACKAGE = path.join(TEST, '..');
/** The one copy the others are held to. */
const RUNTIME = path.join(TEST, '..', '..', '..', 'packages', 'agent-runtime', 'src', 'waits', 'waits.ts');

test("the helper is the runtime's, byte for byte", () => {
  assert.equal(
    fs.readFileSync(path.join(TEST, 'waits.ts'), 'utf8'),
    fs.readFileSync(RUNTIME, 'utf8'),
    'copy packages/agent-runtime/src/waits/waits.ts over this one: a change to it is made there and copied here, the one copy left',
  );
});

/** The default timeout a script gives every test (`--test-timeout=<ms>`, one word), or null for none. */
const defaultTimeout = (script: string): number | null => {
  const word = script.split(/\s+/).find((w) => /^--test-timeout=[1-9]\d*$/.test(w));
  return word ? Number(word.slice('--test-timeout='.length)) : null;
};

/**
 * What leaves a wait unbounded in a test given no `WAITED`, as one that waits through a helper may be: a script whose default timeout is
 * not `WAITED`'s, since node's is none.
 *
 * @param name the script's name in package.json
 * @param script what it runs
 * @returns one line per break, empty when every test it runs is bounded at `WAITED`'s timeout
 */
const timeoutBreaks = (name: string, script: string): string[] =>
  defaultTimeout(script) === WAITED.timeout
    ? []
    : [`the ${name} script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`];

test("the package's test and e2e scripts bound every test at `WAITED`'s timeout, so a wait in a test given none still ends", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as {
    scripts: { test: string; e2e: string };
  };
  assert.deepEqual(timeoutBreaks('test', scripts.test), [], 'npm test');
  assert.deepEqual(timeoutBreaks('e2e', scripts.e2e), [], 'npm run e2e');
});

test("REFUSED: a script with no default timeout, or another than `WAITED`'s, leaves a test's wait unbounded", () => {
  const refused = [
    `the e2e script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`,
  ];
  assert.deepEqual(timeoutBreaks('e2e', 'node --test test/e2e/*.test.ts && node test/e2e/run.ts'), refused, 'none');
  assert.deepEqual(timeoutBreaks('e2e', 'node --test --test-timeout=600000 test/e2e/*.test.ts'), refused, 'a longer one');
  assert.deepEqual(timeoutBreaks('e2e', `node --test --test-timeout=${WAITED.timeout} test/e2e/*.test.ts`), [], 'its own');
});

/** What a count is held to: how many a file has, and why each is no wait. */
type Allowance = { count: number; not: string };

/**
 * The `now()` of `Date` or `performance` a number is added to, or a start taken from and held under a bound, file by file under `test/`,
 * each no test's wait; a file not here has none. A count only shrinks.
 */
const DEADLINES: Readonly<Record<string, Allowance>> = {
  'test/scratch.ts': { count: 1, not: "the reaper's bound on a test run's leftover processes, after its end" },
  'test/e2e/checks.ts': {
    count: 3,
    not: "the e2e's assertion timeouts, `expectDrawn`, `settled` and `expectNone`: run.ts's pages run under no test runner whose signal could end a wait",
  },
};

/**
 * A `now()` of `Date` or `performance` with a number added, or a start taken from it and compared under a bound, across line breaks;
 * built in parts, so this file says none.
 */
const DEADLINE = new RegExp(['(?:Date|performance)', '\\.now\\(\\)\\s*', '(?:\\+|-\\s*[\\w.]+\\s*<)'].join(''), 'g');

/** How many hand-written deadlines `text` holds. */
const deadlinesIn = (text: string): number => text.match(DEADLINE)?.length ?? 0;

/** The package's test files, its e2e's pages and the helpers beside them, by their path from the package. */
const testFiles = (): string[] => fs.globSync('test/**/*.ts', { cwd: PACKAGE }).sort();

/**
 * What breaks the allowances: a file with more than its count, and an allowance left above what its file has, or for a file gone.
 *
 * @param counts each file's deadlines, as measured
 * @param allowed the allowances
 * @returns one line per break, empty when every count is held
 */
const deadlineBreaks = (counts: ReadonlyMap<string, number>, allowed: Readonly<Record<string, Allowance>>): string[] => [
  ...[...counts].flatMap(([file, n]) =>
    n > (allowed[file]?.count ?? 0)
      ? [
          `${file} has ${n} hand-written deadlines, ${allowed[file]?.count ?? 0} allowed: wait with \`until\` (test/waits.ts) in a test, ` +
            'or assert through `expectNone` (test/e2e/checks.ts) in an e2e page, instead',
        ]
      : [],
  ),
  ...Object.entries(allowed).flatMap(([file, { count }]) =>
    (counts.get(file) ?? 0) < count ? [`${file} is allowed ${count} but has ${counts.get(file) ?? 0}: lower its count in DEADLINES`] : [],
  ),
];

/** Each test file's deadlines, as they are on disk. */
const measured = () =>
  new Map(testFiles().flatMap((file) => [[file, deadlinesIn(fs.readFileSync(path.join(PACKAGE, file), 'utf8'))] as const]));

test("the board's tests and e2e pages hold no hand-written deadline but those `DEADLINES` allows, each no wait, and none allowed that is gone", () => {
  assert.ok(testFiles().includes('test/e2e/pages/130-say.ts'), "the e2e's pages are read");
  assert.ok(testFiles().includes('test/scratch.ts'), "and the tests' helpers");
  assert.deepEqual(deadlineBreaks(measured(), DEADLINES), []);
});

test('REFUSED: a deadline written into a page is over its allowance, and an allowance left above its count is loose', () => {
  const planted = ['  const bound = performance', '.now()\n    + 10_000;'].join('');
  assert.equal(deadlinesIn(planted), 1, 'matched across the line break a formatter puts in');
  const compared = ['  while (!ok() && Date', '.now()\n    - start < 5_000) await turn();'].join('');
  assert.equal(deadlinesIn(compared), 1, 'a start held under a bound is a deadline too');
  const counts = measured();
  const page = 'test/e2e/pages/130-say.ts';
  for (const deadline of [planted, compared]) {
    counts.set(page, (counts.get(page) ?? 0) + deadlinesIn(deadline));
    assert.deepEqual(deadlineBreaks(counts, DEADLINES), [
      `${page} has 1 hand-written deadlines, 0 allowed: wait with \`until\` (test/waits.ts) in a test, ` +
        'or assert through `expectNone` (test/e2e/checks.ts) in an e2e page, instead',
    ]);
    counts.set(page, 0);
  }
  counts.set('test/e2e/checks.ts', 0);
  assert.deepEqual(deadlineBreaks(counts, DEADLINES), ['test/e2e/checks.ts is allowed 3 but has 0: lower its count in DEADLINES']);
});
