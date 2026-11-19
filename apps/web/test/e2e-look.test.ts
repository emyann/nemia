/**
 * The look's browser tests (`test/e2e/*.test.ts`) run through the e2e's runner, behind `--look` (`LOOK_TESTS`, `e2e/look.ts`), never
 * from the `e2e` script: npm appends a script's arguments to its last command, so a script that ran a test runner before the e2e's ran
 * them all whatever `--pages` named. When they run, they run bounded as every package's suite is: at most the files at once its config
 * runs (`maxWorkers`), each test at `WAITED`'s timeout. Each of the seven launches Chromium and builds the look's stories
 * page, about 1.8 GB a file, and unbounded they ran as many at once as the machine has cores but one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { LOOK_RUNS, LOOK_TESTS } from './e2e/look.ts';
import { placeVerdict, SYSTEM } from './e2e/stories/pinned.ts';
import { WAITED } from './waits.ts';

const PACKAGE = path.join(import.meta.dirname, '..');
const scripts = (): { test: string; e2e: string } =>
  (JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: { test: string; e2e: string } }).scripts;

/** The number a project of a Vitest config, by its name, gives `key`, or null for none: read from the project's `name` to the next. */
const projected = (config: string, project: string, key: string): number | null => {
  const at = config.indexOf(`name: '${project}'`);
  if (at < 0) return null;
  const next = config.indexOf("name: '", at + 1);
  const m = new RegExp(`\\b${key}:\\s*([\\d_]+)`).exec(config.slice(at, next < 0 ? undefined : next));
  return m ? Number(m[1].replaceAll('_', '')) : null;
};

/**
 * What leaves the look's tests unbounded: a `look` project that gives no `testTimeout` of `WAITED`'s, or runs other than as many files
 * at once as the `node` project `npm test` runs, or none said (Vitest's default, the cores but one).
 *
 * @param config the text of the board's `vitest.config.ts`
 */
const boundBreaks = (config: string): string[] => {
  const breaks: string[] = [];
  if (projected(config, 'look', 'testTimeout') !== WAITED.timeout)
    breaks.push(`the look's tests give no testTimeout: ${WAITED.timeout}: add it to the look project (vitest.config.ts)`);
  const bound = projected(config, 'node', 'maxWorkers');
  if (bound === null || projected(config, 'look', 'maxWorkers') !== bound)
    breaks.push(`the look's tests run other than maxWorkers: ${bound} at once, as npm test does: set it on the look project`);
  return breaks;
};

/** What makes `--pages` not scope the e2e: a script that runs a test runner before the runner npm appends the arguments to. */
const scriptBreaks = (e2e: string): string[] =>
  /\b(node\s+--test|vitest)\b/.test(e2e)
    ? ['the e2e script runs a test runner, past which npm appends --pages: run the look through --look']
    : [];

test("the look's tests run at most as many files at once as npm test, each at `WAITED`'s timeout", () => {
  assert.deepEqual(LOOK_TESTS, ['vitest', 'run', '--project=look'], 'every look test, through its project');
  const config = fs.readFileSync(path.join(PACKAGE, 'vitest.config.ts'), 'utf8');
  assert.equal(boundBreaks(config).length, 0, boundBreaks(config).join('\n'));
});

test('REFUSED: the look run unbounded, bounded otherwise than npm test, or with no timeout', () => {
  const config = (look: string) => `{ name: 'node', maxWorkers: 2, testTimeout: ${WAITED.timeout} }, { name: 'look', ${look} }`;
  for (const [look, why] of [
    [`testTimeout: ${WAITED.timeout}`, 'no bound, Vitest then runs the cores but one'],
    [`maxWorkers: 4, testTimeout: ${WAITED.timeout}`, 'a bound above the suite'],
    ['maxWorkers: 2', 'no timeout'],
  ] as const)
    assert.equal(boundBreaks(config(look)).length, 1, why);
  assert.deepEqual(boundBreaks(config(`maxWorkers: 2, testTimeout: ${WAITED.timeout}`)), []);
  assert.equal(boundBreaks(`{ name: 'look', maxWorkers: 2, testTimeout: ${WAITED.timeout} }`).length, 1, 'a suite that says no bound');
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
  assert.equal(scriptBreaks('vitest run --project=look && node test/e2e/run.ts').length, 1);
});

test("--look runs the stories' Vitest after the look's node tests, the stories script being the storybook project's run in the pinned place", () => {
  assert.deepEqual(
    LOOK_RUNS.map((run) => run.what),
    ['tests', 'stories'],
    "the look's node tests, then every story in Chromium",
  );
  const stories = LOOK_RUNS.find((run) => run.what === 'stories');
  assert.deepEqual(stories && [stories.command, ...stories.args], ['npm', 'run', 'stories']);
  assert.match(
    (JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts.stories ?? '',
    /^node test\/e2e\/stories\/pinned\.ts$/,
  );
  assert.ok(
    fs.readFileSync(path.join(PACKAGE, 'test', 'e2e', 'stories', 'pinned.ts'), 'utf8').includes("'--project=storybook'"),
    'the pinned place runs the storybook project',
  );
});

/**
 * The runner a job of a GitHub workflow's text runs on, by the job's key, or null where it names none: read from the key to the next
 * job.
 */
const runnerOf = (workflow: string, job: string): string | null => {
  const at = workflow.indexOf(`\n  ${job}:\n`);
  if (at < 0) return null;
  const rest = workflow.slice(at + job.length + 4);
  const next = /\n  [\w-]+:\n/.exec(rest);
  return /\n    runs-on: (\S+)/.exec(next ? rest.slice(0, next.index) : rest)?.[1] ?? null;
};

test("CI's e2e-look job runs on the pinned place's runner, and a CI not in the pinned place refuses rather than compare nothing", () => {
  const ci = fs.readFileSync(path.join(PACKAGE, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(runnerOf(ci, 'e2e-look'), `${SYSTEM.id}-${SYSTEM.version}`);
  assert.equal(runnerOf(ci.replace(`runs-on: ${SYSTEM.id}-${SYSTEM.version}`, 'runs-on: ubuntu-latest'), 'e2e-look'), 'ubuntu-latest');
  assert.deepEqual(
    [
      placeVerdict(undefined, true),
      placeVerdict(undefined, false),
      placeVerdict('this is Ubuntu 26.04', true),
      placeVerdict('this is Ubuntu 26.04', false),
    ],
    ['compare', 'compare', 'refused', 'uncompared'],
  );
});
