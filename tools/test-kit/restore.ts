/**
 * Every workspace's Vitest setup file: after each test, the spies it made are restored and its fake timers put back to the real
 * ones, as `node:test` restored what a test's `t.mock` made when the test ended. A spy or a clock a test leaves would reach the next
 * test of its file, which shares its process.
 *
 * Each workspace's `vitest.config.ts` names it in `setupFiles`, after the workspace's own seat where it has one.
 */
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
