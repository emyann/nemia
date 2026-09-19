/**
 * The `dev` folders' implement check, run against real git: the build and the e2e when the work touched the web app, and not otherwise.
 *
 * The folder is chosen before any work exists; what the work touched is git's fact by the time the check runs, so the condition is shell
 * over `git diff --name-only`, written in the `check:` line itself. It is run in two places, and both are tested here: by the run, as a
 * check, with `WF_BASE_REF` (through `CHECK`, the harness the engine is handed), and by the shipper, by hand, in the repository's own
 * checkout in the middle of a merge, where no `WF_BASE_REF` is set and what counts is what the merge brings. A condition that cannot say
 * what was touched fails with words, never reads as "nothing touched".
 *
 * `npm` is a stand-in on PATH that prints what it was asked, so the test reads which scripts ran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { CHECK, checkBrief } from '../src/check.ts';
import { loadWorkflows } from '../src/workflow.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-web-check-'));

const checkOf = (folder: string): string => {
  const check = loadWorkflows(path.join(REPO_ROOT, 'workflows', folder)).find((s) => s.name === 'implement')?.check;
  assert.ok(check, `${folder}: implement has a check`);
  return check;
};
const DEV = checkOf('dev');

// A stand-in `npm`: prints `npm <args>`, and fails the one script NPM_FAILS names.
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'npm'), '#!/bin/sh\necho "npm $*"\n[ "$*" = "${NPM_FAILS:-}" ] && exit 1\nexit 0\n', { mode: 0o755 });

/**
 * The environment every command here runs in: this machine's, with the stand-in first on PATH and no `WF_` name. This suite is itself run
 * as a check, whose `WF_BASE_REF` would otherwise reach the shipper's case and make it one it is not.
 */
const baseEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('WF_') && !k.startsWith('GIT_'))),
  PATH: `${BIN}:${process.env.PATH}`, ...extra,
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', env: baseEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const write = (repo: string, file: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), `${file}\n`);
};

/** A repository on main, and a branch `work` off it whose one commit writes `files`. Returns the repo and main's commit the branch left from. */
function branched(files: string[]): { repo: string; base: string } {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'README.md');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'work');
  for (const f of files) write(repo, f);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'work');
  return { repo, base };
}

type Ran = { status: number | null; stdout: string; stderr: string };

/** The check as the run executes it: through `CHECK`, the harness the engine spawns, with the environment the run hands it. */
function asCheck(repo: string, command: string, baseRef: string, extra: Record<string, string> = {}): Ran {
  const brief = checkBrief(command, { WF_RUN: 'r-1', WF_STEP: 'implement', WF_BASE_REF: baseRef, WF_WORKSPACE: repo, WF_STDERR: '', WF_ARTIFACTS: ROOT });
  const { cmd, args } = CHECK.command({ brief });
  const r = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env: baseEnv(extra) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The command as the shipper runs it: by hand, in bash, in the repository's checkout, with no `WF_BASE_REF`. */
function byHand(repo: string, command: string): Ran {
  const r = spawnSync('bash', ['-c', command], { cwd: repo, encoding: 'utf8', env: baseEnv() });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const BUILT = /^npm run build$/m;
const E2E = /^npm run e2e$/m;
const SKIPPED = 'no build, no e2e';

test('dev and dev-planned judge implement by the same line: the suite and the types, then the build and the e2e on what git says was touched', () => {
  assert.equal(checkOf('dev-planned'), DEV, "dev-planned's implement is judged as dev's");
  assert.ok(DEV.startsWith('npm test && npm run typecheck && '), DEV);
  assert.ok(DEV.includes('git diff --name-only "$range"'), DEV);
  assert.ok(DEV.includes('range="$WF_BASE_REF...HEAD"') && DEV.includes('range=HEAD...MERGE_HEAD'), DEV);
  // The folders a person picks for the build keep it whatever was touched: they asked for it.
  for (const folder of ['dev-build', 'dev-planned-build', 'ui']) assert.equal(checkOf(folder), 'npm test && npm run typecheck && npm run build && npm run e2e', folder);
});

test('as a check: a branch that touches the web app runs the build and the e2e', () => {
  for (const file of ['apps/web/src/routes/runs.tsx', 'apps/api/src/app.ts', 'package-lock.json', 'package.json', 'turbo.json']) {
    const { repo, base } = branched(['packages/agent-workflows/src/run.ts', file]);
    const r = asCheck(repo, DEV, base);
    assert.equal(r.status, 0, `${file}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /^npm test$/m, file);
    assert.match(r.stdout, BUILT, `${file}: the build ran\n${r.stdout}`);
    assert.match(r.stdout, E2E, `${file}: the e2e ran\n${r.stdout}`);
    assert.ok(!r.stdout.includes(SKIPPED), file);
  }
});

test('as a check: a branch that touches only the packages, the docs or the workflows runs neither, and says so', () => {
  const { repo, base } = branched(['packages/agent-workflows/src/run.ts', 'packages/agent-engine/src/domain.ts', 'docs/pivot.md', 'workflows/dev/README.md', 'apps/webhook/x.ts']);
  const r = asCheck(repo, DEV, base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^npm run typecheck$/m);
  assert.doesNotMatch(r.stdout, BUILT);
  assert.doesNotMatch(r.stdout, E2E);
  assert.ok(r.stdout.includes(SKIPPED), r.stdout);
});

test('REFUSED as a check: a build that fails fails the check — the condition swallows nothing', () => {
  const { repo, base } = branched(['apps/web/src/main.tsx']);
  const r = asCheck(repo, DEV, base, { NPM_FAILS: 'run build' });
  assert.notEqual(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, E2E);
});

test('REFUSED as a check: a base git does not have (a shallow clone, a missing ref) fails with words, and skips nothing', () => {
  const { repo } = branched(['packages/agent-workflows/src/run.ts']);
  const r = asCheck(repo, DEV, '0123456789abcdef0123456789abcdef01234567');
  assert.notEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot tell what the work touched/);
  assert.ok(!r.stdout.includes(SKIPPED), r.stdout);
});

test('REFUSED as a check: an empty WF_BASE_REF, outside a merge, is not read as nothing touched', () => {
  const { repo } = branched(['packages/agent-workflows/src/run.ts']);
  const r = asCheck(repo, DEV, '');
  assert.notEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot tell what the work touched/);
  assert.ok(!r.stdout.includes(SKIPPED), r.stdout);
});
