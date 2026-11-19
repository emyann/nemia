/**
 * Every workspace's Vitest setup file, the seat each test file runs in, as `node --test` ran it:
 *
 * - the variables Vitest and Vite set on the process for their own code (`VITEST`, `TEST`, `NODE_ENV=test`, and `import.meta.env`'s
 *   `MODE`, `BASE_URL`, `DEV`, `PROD`, `SSR`) are taken out of `process.env`, so a child a test spawns — a CLI, a dev server, a
 *   harness — inherits the environment it inherited under `node:test`, and reads no mode it was never given;
 * - after each test, the spies it made are restored and its fake timers put back to the real ones, as `node:test` restored what a
 *   test's `t.mock` made when the test ended. A spy or a clock a test leaves would reach the next test of its file, which shares its
 *   process. A clock a hook faked before the test began (a `describe`'s `beforeAll`, where a test whose subtests became a `describe`
 *   keeps its setup) is the describe's, as the parent test's was its subtests': it stays, as the test left it, until the last test of
 *   the describe at the file's head ends.
 *
 * Each workspace's `vitest.config.ts` names it in `setupFiles`, after the workspace's own seat where it has one.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import type { RunnerTestCase, RunnerTestSuite } from 'vitest';

for (const name of ['VITEST', 'VITEST_MODE', 'TEST', 'MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR']) delete process.env[name];
if (process.env.NODE_ENV === 'test') delete process.env.NODE_ENV;

/** Whether the clock was fake as the test running now began: faked by a hook, for its describe. */
let hooked = false;

/** The last test that runs of the describe at the file's head that holds `test`, or the test itself where it is at the head. */
const lastOfHead = (test: RunnerTestCase): RunnerTestCase => {
  let head: RunnerTestCase | RunnerTestSuite = test;
  while (head.suite && head.suite !== test.file) head = head.suite;
  const runs = (task: RunnerTestCase | RunnerTestSuite): RunnerTestCase[] =>
    task.type === 'suite' ? task.tasks.flatMap((t) => runs(t)) : task.mode === 'run' ? [task] : [];
  return runs(head).at(-1) ?? test;
};

beforeEach(() => {
  hooked = vi.isFakeTimers();
});

afterEach(({ task }) => {
  vi.restoreAllMocks();
  if (!hooked || lastOfHead(task) === task) vi.useRealTimers();
});
