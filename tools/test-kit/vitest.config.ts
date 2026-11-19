/**
 * test-kit's tests on Vitest, as `npm test` runs them (`vitest run`): the files `include` names, each
 * file in a process of its own, two files at a time (`tools/guards/test/suite.test.ts` holds every package's bound equal), a test and
 * a hook timed out at 120 s. The kit's `restore.ts`, which restores the spies and the timers a test mocked once it ends.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/*.test.ts'],
    pool: 'forks',
    isolate: true,
    maxWorkers: 2,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['../../tools/test-kit/seat.ts'],
  },
});
