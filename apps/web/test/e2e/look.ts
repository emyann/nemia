/**
 * The look's browser tests — `test/e2e/*.test.ts`, the assertions made to refuse (checks.test.ts), the visiting and its exit
 * (visit.test.ts), a full-page picture (photograph.test.ts), the contrast's measure (contrast.test.ts) and the look's parts on their
 * stories page (bars, parts and secondary) — then every story in Chromium through Vitest (`npm run stories`: its render, its play
 * function, axe), which the runner runs before it builds anything when its plan says `look` (`planOf`, pages.ts): `npm run e2e --
 * --look`, and a whole `npm run e2e`. Never `--pages` alone, nor a shard: CI runs them once per push, in its `e2e-look` job.
 *
 * Each file launches Chromium, and three build the look's stories page into a scratch folder: about 1.8 GB a file. So they run at most
 * two files at once, the bound of every package's `test` script, and each test at `WAITED`'s timeout (held by `test/e2e-look.test.ts`).
 * The stories' Vitest runs after them, never beside them, so the two never hold their memory at once.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { WEB } from './world.ts';

/** The node arguments the look's tests run with, from the web app: node expands the glob itself. */
export const LOOK_TESTS: readonly string[] = ['--test', '--test-concurrency=2', '--test-timeout=120000', 'test/e2e/*.test.ts'];

/** One command `--look` runs, from the web app: what it runs (`what`), and how to run it again by hand when it fails (`again`). */
type LookRun = { what: 'tests' | 'stories'; command: string; args: readonly string[]; said: string; again: string };

/** What `--look` runs, one after the other, in this order: the look's node tests, then every story through Vitest. */
export const LOOK_RUNS: readonly LookRun[] = [
  {
    what: 'tests',
    command: process.execPath,
    args: LOOK_TESTS,
    said: `the look's tests, two files at a time (node ${LOOK_TESTS.join(' ')})`,
    again: 'run one again from apps/web, node --test test/e2e/<file>.test.ts, and the whole look with npm run e2e -- --look',
  },
  {
    what: 'stories',
    command: 'npm',
    args: ['run', 'stories'],
    said: 'every story in Chromium, its render, its play function and axe (npm run stories)',
    again: 'run them again from apps/web, npm run stories, or one file, npx vitest run --project=storybook <file>.stories.tsx',
  },
];

/** Runs `run`, its output said as it says it; resolves once it passes, rejects naming how to run it again when it does not. */
function runOne(run: LookRun, children: ChildProcess[]): Promise<void> {
  console.log(`e2e: ${run.said}`);
  const child = spawn(run.command, [...run.args], { cwd: WEB, stdio: 'inherit' });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`the look's ${run.what} failed (${signal ?? `exit ${code}`}), each said above: ${run.again}`));
    });
  });
}

/**
 * Runs what `--look` runs (`LOOK_RUNS`), one after the other, and resolves once each passes; rejects at the first that fails, naming
 * how to run it again. Each child is pushed onto `children`, the runner's, so a signal stops it with the workers.
 * @param children The runner's children, which a signal stops.
 */
export async function lookTests(children: ChildProcess[]): Promise<void> {
  for (const run of LOOK_RUNS) await runOne(run, children);
}
