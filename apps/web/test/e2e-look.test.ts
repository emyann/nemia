/**
 * The look's browser tests (`test/e2e/*.test.ts`) run through the e2e's runner, behind `--look` (`LOOK_TESTS`, `e2e/look.ts`), never
 * from the `e2e` script: npm appends a script's arguments to its last command, so a script that ran `node --test` before the runner ran
 * them all whatever `--pages` named. When they run, they run bounded as every package's suite is: at most the files at once the `test`
 * script runs (`--test-concurrency`), each test at `WAITED`'s timeout. Each of the seven launches Chromium and builds the look's stories
 * page, about 1.8 GB a file, and unbounded they ran as many at once as the machine has cores but one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { LOOK_TESTS } from './e2e/look.ts';
import { WAITED } from './waits.ts';

const PACKAGE = path.join(import.meta.dirname, '..');
const scripts = (): { test: string; e2e: string } =>
  (JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: { test: string; e2e: string } }).scripts;

/** The value of `--<flag>=<n>` among `words`, or null for none. */
const valueOf = (words: readonly string[], flag: string): string | null =>
  words.find((w) => w.startsWith(`--${flag}=`))?.slice(`--${flag}=`.length) ?? null;

/**
 * What leaves the look's tests unbounded: a command that gives no `--test-timeout` of `WAITED`'s, or runs more files at once than the
 * package's `test` script, or none said (node's default, the cores but one).
 *
 * @param argv the node arguments the look's tests run with
 * @param suite the package's `test` script
 * @returns one line per break, empty when the command is bounded as the suite is
 */
const boundBreaks = (argv: readonly string[], suite: string): string[] => {
  const breaks: string[] = [];
  if (valueOf(argv, 'test-timeout') !== String(WAITED.timeout))
    breaks.push(`the look's tests give no --test-timeout=${WAITED.timeout}: add it to LOOK_TESTS (e2e/look.ts)`);
  const bound = valueOf(suite.split(/\s+/), 'test-concurrency');
  if (bound === null || valueOf(argv, 'test-concurrency') !== bound)
    breaks.push(
      `the look's tests run other than --test-concurrency=${bound} at once, as npm test does: set it in LOOK_TESTS (e2e/look.ts)`,
    );
  return breaks;
};

/** What makes `--pages` not scope the e2e: a script that runs `node --test` before the runner npm appends the arguments to. */
const scriptBreaks = (e2e: string): string[] =>
  /\bnode\s+--test\b/.test(e2e) ? ['the e2e script runs node --test, past which npm appends --pages: run the look through --look'] : [];

test("the look's tests run at most as many files at once as npm test, each at `WAITED`'s timeout", () => {
  assert.ok(LOOK_TESTS.includes('test/e2e/*.test.ts'), 'every look test');
  assert.ok(LOOK_TESTS.includes('--test'));
  assert.equal(boundBreaks(LOOK_TESTS, scripts().test).length, 0, boundBreaks(LOOK_TESTS, scripts().test).join('\n'));
});

test('REFUSED: the look run unbounded, bounded otherwise than npm test, or with no timeout', () => {
  const suite = scripts().test;
  const timeout = `--test-timeout=${WAITED.timeout}`;
  for (const [argv, why] of [
    [['--test', timeout, 'test/e2e/*.test.ts'], 'no concurrency, node then runs the cores but one'],
    [['--test', '--test-concurrency=4', timeout, 'test/e2e/*.test.ts'], 'a bound above the suite'],
    [['--test', '--test-concurrency=2', 'test/e2e/*.test.ts'], 'no timeout'],
  ] as const)
    assert.equal(boundBreaks(argv, suite).length, 1, why);
  assert.equal(boundBreaks(LOOK_TESTS, 'node --test test/*.test.ts').length, 1, 'a suite that says no bound leaves none to match');
});

test("the e2e script is the runner alone, so npm appends --pages to it, and the runner runs the look's tests first when asked", () => {
  assert.deepEqual(scriptBreaks(scripts().e2e), []);
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'e2e', 'run.ts'), 'utf8');
  assert.match(
    runner,
    /const plan = planOf\(process\.argv\.slice\(2\), pages\);\s*if \(plan\.look\) await lookTests\(children\);[^]*?build\(\);/,
  );
});

test('REFUSED: the old script, which ran every look test past any --pages', () => {
  assert.equal(scriptBreaks('node --test --test-timeout=120000 test/e2e/*.test.ts && node test/e2e/run.ts').length, 1);
});
