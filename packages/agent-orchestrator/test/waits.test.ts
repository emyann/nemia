/**
 * The wait a test makes on its event (`until`, `bell`, `test/waits.ts`), a copy of the runtime's held here byte for byte, and the guard
 * that keeps a hand-written deadline out of the package's tests (`DEADLINES`). The helper's own tests are the runtime's.
 *
 * `DEADLINES` counts, file by file, each `now()` of `Date` or `performance` a number is added to, or a start taken from and held under a
 * bound, in the package's tests: each left is a mocked clock, a timestamp or a spin, never a wait, and a count only shrinks
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
const RUNTIME = path.join(TEST, '..', '..', '..', 'packages', 'agent-runtime', 'test', 'waits.ts');

test("the helper is the runtime's, byte for byte", () => {
  assert.equal(
    fs.readFileSync(path.join(TEST, 'waits.ts'), 'utf8'),
    fs.readFileSync(RUNTIME, 'utf8'),
    'copy packages/agent-runtime/test/waits.ts over this one: a change to it is made there and copied to every package',
  );
});

/** The default timeout a `test` script gives every test (`--test-timeout=<ms>`, one word), or null for none. */
const defaultTimeout = (script: string): number | null => {
  const word = script.split(/\s+/).find((w) => /^--test-timeout=[1-9]\d*$/.test(w));
  return word ? Number(word.slice('--test-timeout='.length)) : null;
};

/**
 * What leaves a wait unbounded in a test given no `WAITED`, as one that waits through a helper may be: a `test` script whose default
 * timeout is not `WAITED`'s, since node's is none.
 *
 * @param script the package's `test` script
 * @returns one line per break, empty when every test is bounded at `WAITED`'s timeout
 */
const timeoutBreaks = (script: string): string[] =>
  defaultTimeout(script) === WAITED.timeout
    ? []
    : [`the test script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`];

test("the package's test script bounds every test at `WAITED`'s timeout, so a wait in a test given none still ends", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: { test: string } };
  assert.deepEqual(timeoutBreaks(scripts.test), []);
});

test("REFUSED: a test script with no default timeout, or another than `WAITED`'s, leaves a test's wait unbounded", () => {
  const refused = [
    `the test script gives no --test-timeout=${WAITED.timeout}, so a test given no \`WAITED\` that waits is never bounded: add it`,
  ];
  assert.deepEqual(timeoutBreaks("node --test --test-concurrency=2 'test/*.test.ts'"), refused, 'none');
  assert.deepEqual(timeoutBreaks("node --test --test-concurrency=2 --test-timeout=600000 'test/*.test.ts'"), refused, 'a longer one');
  assert.deepEqual(timeoutBreaks(`node --test --test-concurrency=2 --test-timeout=${WAITED.timeout} 'test/*.test.ts'`), [], 'its own');
});

/** What a count is held to: how many a file has, and why each is no wait. */
type Allowance = { count: number; not: string };

/**
 * The `now()` of `Date` or `performance` a number is added to, or a start taken from and held under a bound, file by file in the
 * package's tests, each no wait; a file not here has none. A count only shrinks.
 */
const DEADLINES: Readonly<Record<string, Allowance>> = {
  'test/git-skill.boundary.test.ts': { count: 1, not: 'a commit date a minute ahead' },
  'test/forget-engine.test.ts': { count: 1, not: "a fake closeout's timestamp" },
  'test/held.test.ts': { count: 1, not: 'a mocked clock set ten minutes ahead' },
  'test/tick-program.test.ts': { count: 1, not: 'a series read at a moment two minutes ahead' },
  'test/scratch.ts': { count: 1, not: "the reaper's bound on a test run's leftover processes, after its end" },
  'src/daemon/daemon.store.test.ts': { count: 1, not: 'a mocked clock set twenty minutes ahead' },
  'src/nemia/keep.verb.test.ts': { count: 2, not: 'a raise an hour ahead, and a mocked clock set past it' },
  'src/meter/tally.store.test.ts': { count: 1, not: 'a spin that spends its time on the thread the meter measures' },
};

/**
 * A `now()` of `Date` or `performance` with a number added, or a start taken from it and compared under a bound, across line breaks;
 * built in parts, so this file says none.
 */
const DEADLINE = new RegExp(['(?:Date|performance)', '\\.now\\(\\)\\s*', '(?:\\+|-\\s*[\\w.]+\\s*<)'].join(''), 'g');

/** How many hand-written deadlines `text` holds. */
const deadlinesIn = (text: string): number => text.match(DEADLINE)?.length ?? 0;

/** The package's test files and the helpers beside them, by their path from the package. */
const testFiles = (): string[] =>
  [
    ...fs.globSync('src/**/*.test.ts', { cwd: PACKAGE }),
    ...fs.globSync('test/**/*.ts', { cwd: PACKAGE }),
    ...fs.globSync('place/**/*.test.ts', { cwd: PACKAGE }),
  ].sort();

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
      ? [`${file} has ${n} hand-written deadlines, ${allowed[file]?.count ?? 0} allowed: wait with \`until\` (test/waits.ts) instead`]
      : [],
  ),
  ...Object.entries(allowed).flatMap(([file, { count }]) =>
    (counts.get(file) ?? 0) < count ? [`${file} is allowed ${count} but has ${counts.get(file) ?? 0}: lower its count in DEADLINES`] : [],
  ),
];

/** Each test file's deadlines, as they are on disk. */
const measured = () =>
  new Map(testFiles().flatMap((file) => [[file, deadlinesIn(fs.readFileSync(path.join(PACKAGE, file), 'utf8'))] as const]));

test("the package's tests hold no hand-written deadline but those `DEADLINES` allows, each no wait, and none allowed that is gone", () => {
  assert.ok(testFiles().includes('src/feed/feed.test.ts'), 'the tests beside the code are read');
  assert.ok(testFiles().includes('test/scratch.ts'), "and the tests' helpers");
  assert.deepEqual(deadlineBreaks(measured(), DEADLINES), []);
});

test('REFUSED: a deadline written into a test is over its allowance, and an allowance left above its count is loose', () => {
  const planted = ['  const bound = performance', '.now()\n    + 10_000;'].join('');
  assert.equal(deadlinesIn(planted), 1, 'matched across the line break a formatter puts in');
  const compared = ['  while (!ok() && Date', '.now()\n    - start < 5_000) await turn();'].join('');
  assert.equal(deadlinesIn(compared), 1, 'a start held under a bound is a deadline too');
  const counts = measured();
  for (const deadline of [planted, compared]) {
    counts.set('src/feed/feed.test.ts', (counts.get('src/feed/feed.test.ts') ?? 0) + deadlinesIn(deadline));
    assert.deepEqual(deadlineBreaks(counts, DEADLINES), [
      'src/feed/feed.test.ts has 1 hand-written deadlines, 0 allowed: wait with `until` (test/waits.ts) instead',
    ]);
    counts.set('src/feed/feed.test.ts', 0);
  }
  counts.set('src/nemia/keep.verb.test.ts', 1);
  assert.deepEqual(deadlineBreaks(counts, DEADLINES), ['src/nemia/keep.verb.test.ts is allowed 2 but has 1: lower its count in DEADLINES']);
});
