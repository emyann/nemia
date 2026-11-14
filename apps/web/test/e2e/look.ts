/**
 * The look's browser tests — `test/e2e/*.test.ts`, the assertions made to refuse (checks.test.ts), the visiting and its exit
 * (visit.test.ts), a full-page picture (photograph.test.ts), the contrast's measure (contrast.test.ts) and the look's parts on their
 * stories page (bars, parts and secondary) — which the runner runs before it builds anything when its plan says `look` (`planOf`,
 * pages.ts): `npm run e2e -- --look`, and a whole `npm run e2e`. Never `--pages` alone, nor a shard: CI runs them once per push, in
 * its `e2e-look` job.
 *
 * Each file launches Chromium, and three build the look's stories page into a scratch folder: about 1.8 GB a file. So they run at most
 * two files at once, the bound of every package's `test` script, and each test at `WAITED`'s timeout (held by `test/e2e-look.test.ts`).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { WEB } from './world.ts';

/** The node arguments the look's tests run with, from the web app: node expands the glob itself. */
export const LOOK_TESTS: readonly string[] = ['--test', '--test-concurrency=2', '--test-timeout=120000', 'test/e2e/*.test.ts'];

/**
 * Runs the look's tests, their output said as they say it, and resolves once they pass; rejects naming how to run one file again when
 * they do not. The child is pushed onto `children`, the runner's, so a signal stops it with the workers.
 */
export function lookTests(children: ChildProcess[]): Promise<void> {
  console.log(`e2e: the look's tests, two files at a time (node ${LOOK_TESTS.join(' ')})`);
  const child = spawn(process.execPath, [...LOOK_TESTS], { cwd: WEB, stdio: 'inherit' });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `the look's tests failed (${signal ?? `exit ${code}`}), each said above: run one again from apps/web, ` +
              'node --test test/e2e/<file>.test.ts, and the whole look with npm run e2e -- --look',
          ),
        );
    });
  });
}
