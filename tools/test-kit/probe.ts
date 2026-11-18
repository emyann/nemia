/**
 * A probe run through Vitest: test files written to a scratch folder and run there by the repository's own Vitest, as a workspace's
 * config runs its tests, so a test can prove what a seat (a setup file) does to a test file that imports nothing of it. The probe's
 * files call Vitest's globals (`test`), since a scratch folder resolves no package.
 *
 * Every workspace's tests take it from here, `test-kit/probe`.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './repo.ts';

/** Vitest's own command, the one every workspace's `test` script runs. */
const VITEST = path.join(REPO, 'node_modules', 'vitest', 'vitest.mjs');

/** The variables a Vitest worker carries, which a Vitest started inside it would read as its own. */
const RUNNERS = ['VITEST', 'VITEST_MODE', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'TEST', 'NODE_ENV', 'NODE_OPTIONS'];

/**
 * Runs every `*.test.mjs` file of `dir` through Vitest, each setup file of `setupFiles` loaded before each, under `env` less the
 * variables of the Vitest this runs in.
 *
 * @param dir the scratch folder holding the probe's test files, where its config is written
 * @param setupFiles the absolute paths of the setup files loaded before each file, in order: a workspace's seat
 * @param env the environment the probe runs under
 */
export function vitestIn(dir: string, setupFiles: string[], env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  fs.writeFileSync(
    path.join(dir, 'vitest.config.mjs'),
    `export default { test: { include: ['*.test.mjs'], globals: true, pool: 'forks', setupFiles: ${JSON.stringify(setupFiles)} } };\n`,
  );
  const given = { ...env };
  for (const name of RUNNERS) delete given[name];
  return spawnSync(process.execPath, [VITEST, 'run', '--root', dir], { cwd: dir, env: given, encoding: 'utf8' });
}
