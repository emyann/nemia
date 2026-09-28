/**
 * The shipped folders' implement check, run against real git: the build when the work touched the web app, and not otherwise, and the e2e
 * only on the merged tree.
 *
 * The folder is chosen before any work exists; what the work touched is git's fact by the time the check runs, so the condition is shell
 * over `git diff --name-only`, written in the `check:` line itself. It is run in two places, and both are tested here: by the run, as a
 * round's check, with `WF_BASE_REF` (through `CHECK`, the harness the engine is handed), and as ship's check, which the run executes the
 * same way in the repository's own checkout in the middle of the merge the shipper staged, where no `WF_BASE_REF` is set and what
 * counts is what the merge brings. A condition that cannot say what was touched fails with words, never reads as "nothing touched".
 *
 * The e2e runs in the second place alone (changed 2026-09-25): a round's check is the slow part of every round, and the e2e was 3-4 of
 * its six minutes and seldom changed a review's verdict. The line tells the two apart by `WF_BASE_REF`, which the run sets on the check
 * of every step in a worktree and never on ship's, so anything that runs the line without the run's environment runs the whole of it.
 *
 * `npm` is a stand-in on PATH that prints what it was asked, so the test reads which scripts ran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { CHECK, checkBrief } from '../src/check.ts';
import { composeBrief, type Run } from '../src/run.ts';
import { loadWorkflows } from '../src/workflow-store.ts';
import { scratch } from './scratch.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const ROOT = scratch('wf-web-check-');

const checkOf = (folder: string): string => {
  const check = loadWorkflows(path.join(REPO_ROOT, folder)).find((s) => s.name === 'implement')?.check;
  assert.ok(check, `${folder}: implement has a check`);
  return check;
};
const DEV = checkOf('workflows/dev');

/** Every shipped folder that has an e2e, by its path from the repository's root: the package's copy of ui is shipped too. */
const FOLDERS = [
  'workflows/dev',
  'workflows/dev-planned',
  'workflows/dev-build',
  'workflows/dev-planned-build',
  'workflows/ui',
  'packages/agent-orchestrator/workflows/ui',
];
/** The folders a person picks for the build: it runs whatever was touched. */
const BUILD_FOLDERS = FOLDERS.filter((f) => /build|ui/.test(f));

/** How each line ends its build: the e2e only where the run has not set `WF_BASE_REF` — on the merged tree, in ship's check. */
const AT_MERGE =
  'if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round\'s check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi';
const BUILD_LINE = `npm test && npm run typecheck && npm run build && ${AT_MERGE}`;
/** A line as it was before 2026-09-25, with the e2e in every round: what each REFUSED case below must catch. */
const everyRound = (line: string) => line.replace(AT_MERGE, 'npm run e2e');

// A stand-in `npm`: prints `npm <args>`, and fails the one script NPM_FAILS names.
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'npm'), '#!/bin/sh\necho "npm $*"\n[ "$*" = "${NPM_FAILS:-}" ] && exit 1\nexit 0\n', { mode: 0o755 });

/**
 * The environment every command here runs in: this machine's, with the stand-in first on PATH and no `WF_` name. This suite is itself run
 * as a check, whose `WF_BASE_REF` would otherwise reach the ship's case and make it one it is not.
 */
const baseEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('WF_') && !k.startsWith('GIT_'))),
  PATH: `${BIN}:${process.env.PATH}`,
  ...extra,
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    env: baseEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

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
  const brief = checkBrief(command, {
    WF_RUN: 'r-1',
    WF_STEP: 'implement',
    WF_BASE_REF: baseRef,
    WF_WORKSPACE: repo,
    WF_STDERR: '',
    WF_ARTIFACTS: ROOT,
  });
  const { cmd, args } = CHECK.command({ brief });
  const r = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env: baseEnv(extra) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Ship's check as the run executes it: through `CHECK`, in the repository's checkout, with the environment the tick hands an ending — no `WF_BASE_REF`. */
function asShipCheck(repo: string, command: string, extra: Record<string, string> = {}): Ran {
  const brief = checkBrief(command, { WF_RUN: 'r-1', WF_STEP: 'ship', WF_WORKSPACE: repo, WF_STDERR: '', WF_ARTIFACTS: ROOT });
  const { cmd, args } = CHECK.command({ brief });
  const r = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env: baseEnv(extra) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The command as a person runs it by hand, in bash, in the repository's checkout: no `WF_BASE_REF` either. */
function byHand(repo: string, command: string, extra: Record<string, string> = {}): Ran {
  const r = spawnSync('bash', ['-c', command], { cwd: repo, encoding: 'utf8', env: baseEnv(extra) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const BUILT = /^npm run build$/m;
const E2E = /^npm run e2e$/m;
const SKIPPED = 'no build, no e2e';
const HELD = "wf check: no e2e in a round's check";

test('dev and dev-planned judge implement by the same line: the suite and the types, then the build and the e2e on what git says was touched', () => {
  assert.equal(checkOf('workflows/dev-planned'), DEV, "dev-planned's implement is judged as dev's");
  assert.ok(DEV.startsWith('npm test && npm run typecheck && '), DEV);
  assert.ok(DEV.includes('git -c core.quotePath=false diff --no-renames --name-only "$range"'), DEV);
  assert.ok(DEV.includes('range="$WF_BASE_REF...HEAD"') && DEV.includes('range=HEAD...MERGE_HEAD'), DEV);
  // The folders a person picks for the build keep it whatever was touched: they asked for it.
  assert.deepEqual(BUILD_FOLDERS, [
    'workflows/dev-build',
    'workflows/dev-planned-build',
    'workflows/ui',
    'packages/agent-orchestrator/workflows/ui',
  ]);
  for (const folder of BUILD_FOLDERS) assert.equal(checkOf(folder), BUILD_LINE, folder);
  // Every line runs the e2e in one place, behind the one condition.
  for (const folder of FOLDERS) {
    const line = checkOf(folder);
    assert.equal(line.split(AT_MERGE).length, 2, `${folder}: the e2e is held for the merged tree, once\n${line}`);
    assert.equal(line.split('npm run e2e').length, 2, `${folder}: and runs nowhere else\n${line}`);
  }
});

test('as a check, in every shipped folder: a round that touches the web app builds and runs no e2e, and says so', () => {
  for (const folder of FOLDERS) {
    const { repo, base } = branched(['apps/web/src/routes/runs.tsx']);
    const r = asCheck(repo, checkOf(folder), base);
    assert.equal(r.status, 0, `${folder}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /^npm test$/m, folder);
    assert.match(r.stdout, BUILT, `${folder}: the build ran\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, E2E, `${folder}: no e2e in a round\n${r.stdout}`);
    assert.ok(r.stdout.includes(HELD), `${folder}: and the log says why\n${r.stdout}`);
  }
});

test("as ship's check, in every shipped folder: a merge that brings the web app runs the build and the e2e on the merged tree", () => {
  for (const folder of FOLDERS) {
    const repo = midMerge(['apps/web/src/routes/runs.tsx'], ['packages/agent-runtime/src/engine.ts']);
    const r = asShipCheck(repo, checkOf(folder));
    assert.equal(r.status, 0, `${folder}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, BUILT, `${folder}\n${r.stdout}`);
    assert.match(r.stdout, E2E, `${folder}\n${r.stdout}`);
    assert.ok(!r.stdout.includes(HELD), `${folder}\n${r.stdout}`);
  }
});

test('REFUSED as a check: a line with the e2e in every round, as each folder had before, runs it in a round — what the case above refuses', () => {
  for (const folder of FOLDERS) {
    const old = everyRound(checkOf(folder));
    assert.notEqual(old, checkOf(folder), folder);
    const { repo, base } = branched(['apps/web/src/routes/runs.tsx']);
    const r = asCheck(repo, old, base);
    assert.equal(r.status, 0, `${folder}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, E2E, `${folder}: the old line ran the e2e in a round\n${r.stdout}`);
  }
  // The build folders' old line, word for word.
  assert.equal(everyRound(BUILD_LINE), 'npm test && npm run typecheck && npm run build && npm run e2e');
});

test("REFUSED as ship's check: an e2e that fails fails the line on the merged tree; in a round, where it does not run, it cannot", () => {
  for (const folder of FOLDERS) {
    const repo = midMerge(['apps/web/src/routes/runs.tsx'], ['packages/agent-runtime/src/engine.ts']);
    const r = asShipCheck(repo, checkOf(folder), { NPM_FAILS: 'run e2e' });
    assert.notEqual(r.status, 0, `${folder}: a failing e2e fails the merge's check\n${r.stdout}`);
    assert.match(r.stdout, E2E, folder);

    const { repo: round, base } = branched(['apps/web/src/routes/runs.tsx']);
    const c = asCheck(round, checkOf(folder), base, { NPM_FAILS: 'run e2e' });
    assert.equal(c.status, 0, `${folder}: a round runs no e2e to fail\n${c.stdout}\n${c.stderr}`);
  }
});

test('REFUSED as a check: an empty WF_BASE_REF is not a round — a build folder runs the e2e rather than skip it', () => {
  for (const folder of BUILD_FOLDERS) {
    const { repo } = branched(['apps/web/src/routes/runs.tsx']);
    const r = asCheck(repo, checkOf(folder), '');
    assert.equal(r.status, 0, `${folder}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, E2E, `${folder}\n${r.stdout}`);
  }
});

test('as a check: a branch that touches the web app runs the build and no e2e', () => {
  for (const file of ['apps/web/src/routes/runs.tsx', 'apps/api/src/app.ts', 'package-lock.json', 'package.json', 'turbo.json']) {
    const { repo, base } = branched(['packages/agent-orchestrator/src/run.ts', file]);
    const r = asCheck(repo, DEV, base);
    assert.equal(r.status, 0, `${file}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /^npm test$/m, file);
    assert.match(r.stdout, BUILT, `${file}: the build ran\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, E2E, `${file}: the e2e is the merged tree's\n${r.stdout}`);
    assert.ok(!r.stdout.includes(SKIPPED), file);
  }
});

test('as a check: a branch that touches only the packages, the docs or the workflows runs neither, and says so', () => {
  const { repo, base } = branched([
    'packages/agent-orchestrator/src/run.ts',
    'packages/agent-runtime/src/domain.ts',
    'docs/pivot.md',
    'workflows/dev/README.md',
    'apps/webhook/x.ts',
  ]);
  const r = asCheck(repo, DEV, base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^npm run typecheck$/m);
  assert.doesNotMatch(r.stdout, BUILT);
  assert.doesNotMatch(r.stdout, E2E);
  assert.ok(r.stdout.includes(SKIPPED), r.stdout);
});

test('as a check: a file moved out of the web app, or one whose name is not ASCII, counts as touching it', () => {
  // A rename is listed by its new path alone under git's default rename detection, and a non-ASCII path is quoted: either would read
  // as a change to the packages only.
  const { repo } = branched(['apps/web/src/lib/shared.ts']);
  git(repo, 'checkout', '-q', '-b', 'moved');
  fs.mkdirSync(path.join(repo, 'packages', 'shared'), { recursive: true });
  git(repo, 'mv', 'apps/web/src/lib/shared.ts', 'packages/shared/shared.ts');
  git(repo, 'commit', '-q', '-m', 'move it out');
  const moved = git(repo, 'rev-parse', 'work');
  const r = asCheck(repo, DEV, moved);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, BUILT, `a move out of apps/web/ builds\n${r.stdout}`);

  const named = branched(['apps/web/src/routes/café.tsx']);
  const n = asCheck(named.repo, DEV, named.base);
  assert.equal(n.status, 0, `${n.stdout}\n${n.stderr}`);
  assert.match(n.stdout, BUILT, `a non-ASCII path under apps/web/ builds\n${n.stdout}`);
});

test('REFUSED as a check: a build that fails fails the check — the condition swallows nothing', () => {
  const { repo, base } = branched(['apps/web/src/main.tsx']);
  const r = asCheck(repo, DEV, base, { NPM_FAILS: 'run build' });
  assert.notEqual(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, E2E);
});

test('REFUSED as a check: a base git does not have (a shallow clone, a missing ref) fails with words, and skips nothing', () => {
  const { repo } = branched(['packages/agent-orchestrator/src/run.ts']);
  const r = asCheck(repo, DEV, '0123456789abcdef0123456789abcdef01234567');
  assert.notEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot tell what the work touched/);
  assert.ok(!r.stdout.includes(SKIPPED), r.stdout);
});

test('REFUSED as a check: an empty WF_BASE_REF, outside a merge, is not read as nothing touched', () => {
  const { repo } = branched(['packages/agent-orchestrator/src/run.ts']);
  const r = asCheck(repo, DEV, '');
  assert.notEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot tell what the work touched/);
  assert.ok(!r.stdout.includes(SKIPPED), r.stdout);
});

/** `branched`, then main moves on with `onMain`, and main is mid-merge of `work` — the merge the shipper stages, `--no-ff --no-commit`. */
function midMerge(files: string[], onMain: string[]): string {
  const { repo } = branched(files);
  git(repo, 'checkout', '-q', 'main');
  for (const f of onMain) write(repo, f);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'main moved');
  git(repo, 'merge', '--no-ff', '--no-commit', 'work');
  assert.ok(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')), 'mid-merge');
  return repo;
}

test("as ship's check, mid-merge with no WF_BASE_REF: a merge that brings the web app runs the build and the e2e on the merged tree", () => {
  const repo = midMerge(['apps/web/src/routes/runs.tsx'], ['packages/agent-runtime/src/engine.ts']);
  const r = asShipCheck(repo, DEV);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, BUILT, r.stdout);
  assert.match(r.stdout, E2E, r.stdout);
});

test("as ship's check, mid-merge: what counts is what the merge brings, not what the base branch did meanwhile", () => {
  // Main touched the web app after the branch left it; the branch did not. The merge brings no web change, and nothing is built.
  const repo = midMerge(['packages/agent-orchestrator/src/run.ts'], ['apps/web/src/main.tsx']);
  const r = asShipCheck(repo, DEV);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.doesNotMatch(r.stdout, BUILT);
  assert.ok(r.stdout.includes(SKIPPED), r.stdout);
});

test('REFUSED by hand: no WF_BASE_REF and no merge in progress fails loudly, and never passes as nothing touched', () => {
  const { repo } = branched(['packages/agent-orchestrator/src/run.ts']);
  const r = byHand(repo, DEV);
  assert.notEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot tell what the work touched, since git diff --name-only HEAD\.\.\.MERGE_HEAD failed/);
  assert.ok(!r.stdout.includes(SKIPPED), r.stdout);
});

test('ui ends in a gated ship, like the build folders, and the check the run executes on its merge, named on its brief, runs the e2e on the merged tree, and none in a round', () => {
  for (const folder of ['workflows/ui', 'packages/agent-orchestrator/workflows/ui']) {
    const dir = path.join(REPO_ROOT, folder);
    const workflow = loadWorkflows(dir);
    const ship = workflow.find((s) => s.name === 'ship');
    assert.ok(ship, `${folder} has a ship`);
    assert.deepEqual(
      { gate: ship.gate, workspace: ship.workspace, after: ship.after, check: ship.check },
      { gate: true, workspace: 'main', after: ['review'], check: checkOf(folder) },
      folder,
    );

    // The line the shipper is told the run executes on its merge, taken off its brief as the shipper reads it.
    const run: Run = {
      id: 'r-1',
      repo: '/repo',
      workspace: '/repo',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Make the Factory darker',
      workflowDir: dir,
      createdAt: '2026-09-25T00:00:00Z',
      steps: Object.fromEntries(
        workflow.map((s) => [
          s.name,
          s.name === 'ship' ? { taskId: null } : { taskId: `t-${s.name}`, workspace: '/wt', branch: 'wf/r-1/implement' },
        ]),
      ),
    };
    const brief = composeBrief(ship, run, workflow, undefined, '/wf/runs/r-1/artifacts/ship');
    const named = /Once you sign off, the run executes `([^\n]*)` in this checkout, on the merge you left staged/.exec(brief)?.[1];
    assert.equal(named, checkOf(folder), `${folder}: the ship is told implement's check\n\n${brief}`);

    const repo = midMerge(['apps/web/src/routes/runs.tsx'], ['packages/agent-runtime/src/engine.ts']);
    const r = asShipCheck(repo, named);
    assert.equal(r.status, 0, `${folder}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, BUILT, `${folder}\n${r.stdout}`);
    assert.match(r.stdout, E2E, `${folder}: the e2e runs at the ship\n${r.stdout}`);

    const { repo: round, base } = branched(['apps/web/src/routes/runs.tsx']);
    const c = asCheck(round, named, base);
    assert.equal(c.status, 0, `${folder}\n${c.stdout}\n${c.stderr}`);
    assert.doesNotMatch(c.stdout, E2E, `${folder}: and in no round\n${c.stdout}`);
    assert.ok(c.stdout.includes(HELD), `${folder}\n${c.stdout}`);
  }
});
