/**
 * The build job's own verdict: a generated file whose committed bytes are not what its generator writes is refused, by name, with the
 * command that writes it.
 *
 * A boundary test, and the real thing is its whole subject — the staleness step is a shell script, and a stand-in for the shell would
 * decide nothing. So it is run as GitHub runs it, `bash -e` over a file, in a scratch git repository holding the generated paths
 * committed. Matching the step's text would prove nothing about its verdict: a `git diff --exit-code` and a `git diff --name-only` that
 * forgets to fail read alike to a pattern, and differ exactly where it matters — a stale file reported green on a landing nobody checked.
 *
 * A generator writes a file as readily as it rewrites one, so the step is held over both: a tracked file whose bytes changed, and a file
 * under a generated path that nobody has committed — which `git diff` alone does not see at all, and which is the shape a kit update
 * takes.
 *
 * Where the step is, and which paths it guards, is `ci-workflow.ts` (`staleStep`, `GENERATED`); the file's agreement with the repository
 * is held in `ci-workflow.test.ts`, which refuses a step that forgets one of those paths and a path this repository does not have.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GENERATED, readWorkflow, staleStep } from './ci-workflow.ts';
import { scratch } from './scratch.ts';

/** The two files the step must notice, each under one of `GENERATED`'s paths: the route tree, and a file of the generated theme. */
const ROUTE_TREE = 'apps/web/src/routeTree.gen.ts';
const THEME_FILE = 'apps/web/theme/theme.css';

/** A git repository holding both generated files committed, as a runner's checkout holds them after `actions/checkout`. */
function checkout(): string {
  const dir = scratch('ci-build-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'nemia ci');
  git('config', 'user.email', 'ci@nemia.invalid');
  for (const file of [ROUTE_TREE, THEME_FILE]) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), `the bytes the generator writes for ${file}\n`);
  }
  git('add', '-A');
  git('commit', '-m', 'the generated files, as their generators write them');
  return dir;
}

/** The staleness step, run as GitHub runs it: `bash -e` over a file, in `dir`, with nothing of the run's in its environment. */
function verdictOf(run: string, dir: string): { status: number; said: string } {
  const file = path.join(scratch('ci-build-step-'), 'stale.sh');
  fs.writeFileSync(file, run);
  const ran = spawnSync('bash', ['-e', file], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: ran.status ?? -1, said: `${ran.stdout}${ran.stderr}` };
}

/** `file` left holding bytes its generator would not write, as a commit that forgot to run the generator leaves it. */
const dirty = (dir: string, file: string): void => fs.appendFileSync(path.join(dir, file), 'a line a person typed by hand\n');

test('the build job refuses a generated file whose committed bytes are not its generator’s, by name and by the command that writes it', () => {
  const step = staleStep(readWorkflow());
  assert.ok(step?.run !== undefined, 'the build job has its staleness step today');
  const run = step.run;
  assert.equal(GENERATED.length, 2, 'two paths are generated today, and each is proved below');

  const clean = checkout();
  const green = verdictOf(run, clean);
  assert.equal(green.status, 0, `the committed bytes are the generators’, so the step passes: ${green.said}`);

  for (const [file, command] of [
    [ROUTE_TREE, 'npm run build'],
    [THEME_FILE, 'npm run theme:generate'],
  ] as const) {
    const dir = checkout();
    dirty(dir, file);
    const red = verdictOf(run, dir);
    assert.equal(red.status, 1, `a stale ${file} is a failure: ${red.said}`);
    assert.match(red.said, new RegExp(file.replaceAll('.', '\\.')), `the step names ${file}: ${red.said}`);
    assert.match(red.said, new RegExp(command.replaceAll(' ', '\\s')), `the step says to run \`${command}\`: ${red.said}`);
  }

  const created = checkout();
  fs.writeFileSync(path.join(created, 'apps/web/theme/theme-extra.css'), 'a file the generator writes and nobody committed\n');
  const uncommitted = verdictOf(run, created);
  assert.equal(uncommitted.status, 1, `a generated file nobody committed is as stale as one whose bytes changed: ${uncommitted.said}`);
  assert.match(uncommitted.said, /theme-extra\.css/, `the step names the file the generator wrote: ${uncommitted.said}`);
  assert.match(uncommitted.said, /npm\srun\stheme:generate/, `and the command that writes it: ${uncommitted.said}`);

  const both = checkout();
  dirty(both, ROUTE_TREE);
  dirty(both, THEME_FILE);
  const red = verdictOf(run, both);
  assert.equal(red.status, 1, `two stale files are a failure: ${red.said}`);
  for (const file of [ROUTE_TREE, THEME_FILE])
    assert.match(red.said, new RegExp(file.replaceAll('.', '\\.')), `both stale files are named, and ${file} is not: ${red.said}`);
});

test('a step that lists the stale files and forgets to fail is what this test refuses, and a text match would not', () => {
  const dir = checkout();
  dirty(dir, ROUTE_TREE);
  const forgetful = `git -c core.quotePath=false diff --name-only -- ${GENERATED.join(' ')}\n`;
  const waved = verdictOf(forgetful, dir);
  assert.equal(waved.status, 0, 'the forgetful step exits 0 on a stale file, which is the bug this boundary test exists for');
  assert.match(
    waved.said,
    new RegExp(ROUTE_TREE.replaceAll('.', '\\.')),
    'and it names the stale file all the same, so a pattern over its text passes',
  );
});
