/**
 * The look's browser tests — `test/e2e/*.test.ts`, the assertions made to refuse (checks.test.ts), the visiting and its exit
 * (visit.test.ts), a full-page picture (photograph.test.ts), the contrast's measure (contrast.test.ts) and the look's stories read in
 * pixels and by the browser's own input, each opened alone in Storybook's static build (bars, cuts, motion and secondary), and the
 * stories' Vitest leaving the route tree unwritten (route-tree) — which the runner runs before it builds anything when its plan says
 * `look` (`planOf`, pages.ts): `npm run e2e -- --look`, and a whole `npm run e2e`, which then runs every story in Chromium through
 * Vitest too (`npm run stories`: its render, its play function, axe), when its plan says `stories`. Never `--pages` alone, nor a
 * shard: CI runs the look's tests once per push, in its `e2e-look` job, and the stories beside it, in its `e2e-stories` job.
 *
 * Storybook is built static once, into a folder of the machine's temp directory, before the tests, which read it through
 * `LOOK_STORYBOOK` (`stories/built.ts`) and build none of their own; the folder goes once they have run. Each file launches Chromium:
 * so they run at most two files at once, the bound of every package's `test` script, and each test at `WAITED`'s timeout (held by
 * `test/e2e-look.test.ts`). The build runs before them and the whole stories' Vitest after them, never beside them. One test file
 * runs a Vitest of its own, on one story file (route-tree.test.ts), and so beside whichever other file runs with it: a Vitest and a
 * Chromium of a test at once, the peak of the run's tree.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStorybook, LOOK_STORYBOOK } from './stories/built.ts';
import { REPO, WEB } from './world.ts';

/** The command the look's tests run with, from the web app: the `look` project of its Vitest config, bounded as `npm test` is. */
export const LOOK_TESTS: readonly string[] = ['vitest', 'run', '--project=look'];

/** One command a run of the look runs, from the web app: what it runs (`what`), and how to run it again by hand when it fails (`again`). */
type LookRun = { what: 'tests' | 'stories'; command: string; args: readonly string[]; said: string; again: string };

/** What a run of the look runs, one after the other, in this order: the look's tests, then, in a whole run, every story through Vitest. */
export const LOOK_RUNS: readonly LookRun[] = [
  {
    what: 'tests',
    command: 'npx',
    args: LOOK_TESTS,
    said: `the look's tests, two files at a time (npx ${LOOK_TESTS.join(' ')})`,
    again:
      'run one again from apps/web, npx vitest run --project=look test/e2e/<file>.test.ts, and the whole look with npm run e2e -- --look',
  },
  {
    what: 'stories',
    command: 'npm',
    args: ['run', 'stories'],
    said: 'every story in Chromium, its render, its play function, axe and its approved picture, in the pinned place (npm run stories)',
    again:
      'run them again from apps/web, npm run stories -- <file>.stories.tsx; a story whose picture differs leaves its reference, actual ' +
      'and diff in .vitest/attachments/approved, and npm run stories -- --update <file>.stories.tsx approves a change you meant',
  },
];

/**
 * Runs `run`, its output said as it says it, with `LOOK_STORYBOOK` naming `storybook`; resolves once it passes, rejects naming how to
 * run it again when it does not.
 */
function runOne(run: LookRun, children: ChildProcess[], storybook: string) {
  console.log(`e2e: ${run.said}`);
  const child = spawn(run.command, [...run.args], {
    cwd: WEB,
    stdio: 'inherit',
    env: { ...process.env, [LOOK_STORYBOOK]: storybook },
  });
  children.push(child);
  return new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`the look's ${run.what} failed (${signal ?? `exit ${code}`}), each said above: ${run.again}`));
    });
  });
}

/**
 * Builds Storybook static into a folder of the temp directory, then runs the look's tests and, where `stories` says, every story
 * (`LOOK_RUNS`), one after the other, and resolves once each passes; rejects where the build fails, and at the first that fails, naming
 * how to run it again. Each child is pushed onto `children`, the runner's, so a signal stops it with the workers. The folder is removed
 * either way, and on the runner's exit.
 * @param children The runner's children, which a signal stops.
 * @param stories Whether every story runs after the look's tests: in a whole run, never under `--look` (`Plan.stories`, pages.ts).
 */
export async function lookTests(children: ChildProcess[], stories: boolean) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-look-storybook-'));
  const away = () => fs.rmSync(folder, { recursive: true, force: true });
  process.once('exit', away);
  try {
    const storybook = path.join(folder, 'static');
    console.log("e2e: Storybook's static build, which the look's tests read (storybook build)");
    const why = await buildStorybook(REPO, WEB, storybook);
    if (why) throw new Error(`${why}: build it by hand from apps/web, npx storybook build, and read what it says`);
    for (const run of LOOK_RUNS.filter((one) => stories || one.what === 'tests')) await runOne(run, children, storybook);
  } finally {
    away();
    process.off('exit', away);
  }
}
