/**
 * What every test file's process starts with, loaded by the package's `test` script with `--import`: the daemon's two ceilings,
 * `WF_MAX_RUNS` and `WF_MAX_CONCURRENT`, set to `SENTINEL`, a value their readers refuse by name. A run's check inherits the environment
 * of the `wf up` that runs it, so a test that reads a ceiling it did not set would pass or fail with the daemon's; here it fails on every
 * machine, saying which variable to set. A test file that reads a ceiling sets or deletes it itself (`ambient.test.ts`).
 */

/** The value both ceilings start with in a test: not a count, so `maxRuns` and `maxConcurrent` refuse it with exit 2. */
export const SENTINEL = 'set-it-in-the-test';

process.env.WF_MAX_RUNS = SENTINEL;
process.env.WF_MAX_CONCURRENT = SENTINEL;
