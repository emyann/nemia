/**
 * The wait a test makes on its event (`until`, `bell`, `src/waits/`), and the guard that keeps a hand-written deadline out of the
 * package's tests (`DEADLINES`).
 *
 * `src/waits/waits.ts` is the one copy: a test of a layer above takes it from `agent-runtime/testing`, and the board and the
 * documentation site, which import no package, each keep a copy this file holds to it byte for byte, since a test of theirs builds no
 * path into a package's `src`. A wait asks at
 * once, on each ring and at its pace, and ends at its test's timeout saying what never came: that is read off a nested `node --test` of
 * `test/fixtures/waits/never.ts`, since a test's timeout is reported only outside it. `DEADLINES` counts, file by file, each `now()` of
 * `Date` or `performance` a number is added to, or a start taken from and held under a bound, in the package's tests: each left is a
 * mocked clock, a timestamp, a reaper's bound, a synchronous hold or an assertion, never a wait, and a count only shrinks
 * (`deadlineBreaks`). A change that takes one out lowers its count in the same commit.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bell, until, WAITED, type Waiter } from '../src/waits/index.ts';

const TEST = import.meta.dirname;
const PACKAGE = path.join(TEST, '..');
const ROOT = path.join(PACKAGE, '..', '..');

/**
 * A test's signal and diagnostics, as `until` reads them, with what it said kept and its abort in the test's hands: aborted once the test
 * `of` ends, so a wait it left pending holds no process open.
 */
const waiter = (of: TestContext) => {
  const said: string[] = [];
  const control = new AbortController();
  const t: Waiter = { signal: control.signal, diagnostic: (message: string) => void said.push(message) };
  of.after(() => control.abort());
  return { t, said, abort: () => control.abort() };
};

/** A turn of the event loop, so a timer due at once has fired. */
const turn = () => new Promise((r) => setImmediate(r));

test('a wait with no pace asks at once and on each ring, and on nothing else', async (of) => {
  const { t } = waiter(of);
  const rung = bell();
  let asked = 0;
  let ready = false;
  const waiting = until(
    t,
    () => {
      asked++;
      return ready;
    },
    'the third ring',
    { bell: rung },
  );
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(asked, 1, 'asked once at its start, and not again on a timer');
  rung.ring();
  await turn();
  assert.equal(asked, 2);
  ready = true;
  rung.ring();
  await waiting;
  assert.equal(asked, 3);
  rung.ring();
  await turn();
  assert.equal(asked, 3, 'a wait that came hears the bell no more');
});

test('a wait at a pace asks again until its answer holds, and answers it; an async condition is never asked twice at once', async (of) => {
  const { t } = waiter(of);
  const rung = bell();
  let asked = 0;
  let at = 0;
  let most = 0;
  const answer = await until(
    t,
    async () => {
      asked++;
      most = Math.max(most, ++at);
      rung.ring();
      await new Promise((r) => setTimeout(r, 2));
      at--;
      return asked >= 4 && `asked ${asked} times`;
    },
    'the fourth ask',
    { bell: rung, everyMs: 1 },
  );
  assert.equal(answer, 'asked 4 times', 'the first truthy answer');
  assert.equal(most, 1, 'one ask at a time, though the bell rang during each');
});

test('a wait fails with what its condition throws, so an assert inside it surfaces', async (of) => {
  const { t } = waiter(of);
  const err = await until(
    t,
    () => {
      throw new Error('the beat is not a pass');
    },
    'a pass',
    { everyMs: 1 },
  ).catch((e: unknown) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'the beat is not a pass');
});

test('REFUSED: a wait whose test is aborted, before it or while it waits, fails naming what never came, and asks no more', async (of) => {
  const before = waiter(of);
  before.abort();
  const early = await until(before.t, () => true, 'a beat').catch((e: unknown) => e);
  assert.ok(early instanceof Error);
  assert.equal(early.message, 'never came: a beat', 'never asked, as its test is over');
  assert.deepEqual(before.said, ['never came: a beat']);

  const during = waiter(of);
  let asked = 0;
  const waiting = until(during.t, () => void asked++, 'two beats', { everyMs: 1 }).catch((e: unknown) => e);
  await new Promise((r) => setTimeout(r, 10));
  during.abort();
  const late = await waiting;
  assert.ok(late instanceof Error);
  assert.equal(late.message, 'never came: two beats');
  assert.deepEqual(during.said, ['never came: two beats']);
  const asks = asked;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(asked, asks, 'its pace stopped as it failed');
});

test('REFUSED: a wait that says what it waits for by a function says it as it stands when the wait fails, stuck where it is', async (of) => {
  const stuck = waiter(of);
  let phase = 'queued';
  const waiting = until(
    stuck.t,
    () => phase === 'succeeded',
    () => `c1 succeeded; c1 ${phase}`,
    { everyMs: 1 },
  ).catch((e: unknown) => e);
  phase = 'running (working)';
  await new Promise((r) => setTimeout(r, 10));
  stuck.abort();
  const err = await waiting;
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'never came: c1 succeeded; c1 running (working)', 'asked as the wait fails, not as it began');
  assert.deepEqual(stuck.said, ['never came: c1 succeeded; c1 running (working)']);

  const unsaid = waiter(of);
  let still: unknown;
  void until(
    unsaid.t,
    () => false,
    () => {
      throw new Error('the journal does not read');
    },
  ).catch((e: unknown) => {
    still = e;
  });
  unsaid.abort();
  await turn();
  assert.ok(still instanceof Error, 'failed at the abort, though what it waits for could not be said');
  assert.equal(still.message, 'never came: (the wait could not say what: the journal does not read)', 'it fails all the same');
});

test('REFUSED: a wait that never comes fails its test at the timeout, and the runner says what never came', () => {
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const ran = spawnSync(
    'timeout',
    ['-k', '5', '120', process.execPath, '--test', '--test-reporter=tap', path.join('test', 'fixtures', 'waits', 'never.ts')],
    { cwd: PACKAGE, env, encoding: 'utf8' },
  );
  assert.equal(ran.status, 1, ran.stdout + ran.stderr);
  assert.match(ran.stdout, /error: 'test timed out after 50ms'/, ran.stdout);
  assert.match(ran.stdout, /^# never came: the bell that never rings$/m, ran.stdout);
});

test('REFUSED: a wait that cannot read its test fails at once, and its process ends on its own, holding no timer open', () => {
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const ran = spawnSync(
    'timeout',
    ['-k', '5', '120', process.execPath, '--test', '--test-reporter=tap', path.join('test', 'fixtures', 'waits', 'unread.ts')],
    { cwd: PACKAGE, env, encoding: 'utf8' },
  );
  assert.equal(ran.status, 0, `ended by itself, not by \`timeout\` (124): ${ran.stdout}${ran.stderr}`);
  assert.match(ran.stdout, /^# pass 1$/m, ran.stdout);
});

test("the copies of the helper outside the packages are this package's, byte for byte", () => {
  const one = fs.readFileSync(path.join(PACKAGE, 'src', 'waits', 'waits.ts'), 'utf8');
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'apps', 'web', 'test', 'waits.ts'), 'utf8'),
    one,
    'copy packages/agent-runtime/src/waits/waits.ts over apps/web/test/waits.ts: a change to the wait is made here, and the board, ' +
      'which imports no package, keeps a copy of it',
  );
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'apps', 'docs', 'test', 'waits.ts'), 'utf8'),
    one,
    'copy packages/agent-runtime/src/waits/waits.ts over apps/docs/test/waits.ts: a change to the wait is made here, and the ' +
      'documentation site, which imports no package, keeps a copy of it',
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
  'test/scratch.ts': { count: 1, not: "the reaper's bound on a test run's leftover processes, after its end" },
  'test/transcript.test.ts': { count: 2, not: "a mocked clock's shift, wall and monotonic" },
  'test/remote-agent.test.ts': { count: 1, not: "a send's `until` a minute ahead, written into a run file" },
  'test/detached.test.ts': {
    count: 2,
    not:
      'a synchronous hold inside a patched `writeFileSync`, where no promise waits and no timeout fires; and an assertion that a run ' +
      'ended within ten seconds, after its wait on the event, so not when a child holding its pipe let go thirty seconds on',
  },
  'test/live.test.ts': { count: 15, not: "AE_LIVE only: a real harness's turns, which spend money" },
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
  [...fs.globSync('src/**/*.test.ts', { cwd: PACKAGE }), ...fs.globSync('test/**/*.ts', { cwd: PACKAGE })].sort();

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
      ? [`${file} has ${n} hand-written deadlines, ${allowed[file]?.count ?? 0} allowed: wait with \`until\` (src/waits/index.ts) instead`]
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
  assert.ok(testFiles().includes('src/core/clock.test.ts'), 'the tests beside the code are read');
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
    counts.set('src/core/clock.test.ts', (counts.get('src/core/clock.test.ts') ?? 0) + deadlinesIn(deadline));
    assert.deepEqual(deadlineBreaks(counts, DEADLINES), [
      'src/core/clock.test.ts has 1 hand-written deadlines, 0 allowed: wait with `until` (src/waits/index.ts) instead',
    ]);
    counts.set('src/core/clock.test.ts', 0);
  }
  counts.set('test/transcript.test.ts', 1);
  assert.deepEqual(deadlineBreaks(counts, DEADLINES), ['test/transcript.test.ts is allowed 2 but has 1: lower its count in DEADLINES']);
});
