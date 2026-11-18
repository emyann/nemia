/**
 * agent-orchestrator's tests on Vitest, as `npm test` runs them (`vitest run`): the files `include` names, each
 * file in a process of its own, two files at a time (`tools/guards/test/suite.test.ts` holds every package's bound equal), a test and
 * a hook timed out at 120 s. `./test/ambient.ts`, the seat every test of the package runs in, is loaded before each file, then the kit's `seat.ts`, which takes the runner's own variables out of the environment and restores the spies and the timers a test mocked once it ends.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/*.test.ts', 'src/**/*.test.ts'],
    pool: 'forks',
    isolate: true,
    maxWorkers: 2,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['./test/ambient.ts', '../../tools/test-kit/seat.ts'],
  },
});
