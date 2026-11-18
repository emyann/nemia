/**
 * Every workspace's Vitest setup file, the seat each test file runs in, as `node --test` ran it:
 *
 * - the variables Vitest and Vite set on the process for their own code (`VITEST`, `TEST`, `NODE_ENV=test`, and `import.meta.env`'s
 *   `MODE`, `BASE_URL`, `DEV`, `PROD`, `SSR`) are taken out of `process.env`, so a child a test spawns — a CLI, a dev server, a
 *   harness — inherits the environment it inherited under `node:test`, and reads no mode it was never given;
 * - after each test, the spies it made are restored and its fake timers put back to the real ones, as `node:test` restored what a
 *   test's `t.mock` made when the test ended. A spy or a clock a test leaves would reach the next test of its file, which shares its
 *   process.
 *
 * Each workspace's `vitest.config.ts` names it in `setupFiles`, after the workspace's own seat where it has one.
 */
import { afterEach, vi } from 'vitest';

for (const name of ['VITEST', 'VITEST_MODE', 'TEST', 'MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR']) delete process.env[name];
if (process.env.NODE_ENV === 'test') delete process.env.NODE_ENV;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
