/**
 * What every test file's process starts with, loaded by the package's `test` script with `--import`: the daemon's two ceilings,
 * `WF_MAX_RUNS` and `WF_MAX_CONCURRENT`, set to `SENTINEL`, a value their readers refuse by name. A run's check inherits the environment
 * of the `nemia up` that runs it, so a test that reads a ceiling it did not set would pass or fail with the daemon's; here it fails on
 * every machine, saying which variable to set. A test file that reads a ceiling sets or deletes it itself (`ambient.test.ts`).
 *
 * And `WF_DEFAULT_FACTORY_STARTS=1`: most tests start runs in scratch repositories no factory holds, often of cards that name no factory,
 * and the switch lets those starts go to the default factory (`defaultStartsAllowed`). A test of the refusal they meet as shipped deletes
 * it first.
 */

/** The value both ceilings start with in a test: not a count, so `maxRuns` and `maxConcurrent` refuse it with exit 2. */
export const SENTINEL = 'set-it-in-the-test';

process.env.WF_MAX_RUNS = SENTINEL;
process.env.WF_MAX_CONCURRENT = SENTINEL;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
