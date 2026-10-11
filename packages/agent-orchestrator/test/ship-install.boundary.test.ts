/**
 * An ending's check that installs, in a real git repository with npm's workspaces, which the test place does not model (`ship.test.ts`
 * holds the endings that install nothing, on the test place):
 *
 * - a merge that brings a dependency: the check runs `npm install` in the checkout first, and git's index keeps the merge's lockfile;
 * - a merge whose lockfile is main's: no `npm` is run, proven by one planted first on the `PATH`, and `node_modules` is as it was;
 * - a merge its check refused: aborted with the branch's package left installed under an ignored `node_modules`, until `npm install`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { TaskSpec } from 'agent-runtime';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-ship-install-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, approveRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { checkoutParts } = await import('../src/workspace/worktree.store.ts');

/**
 * The ending of the tests' team's `dev` (`team.ts`): the file a person reads, its keys and its agent. It names `agent: shipper`, so the
 * team's agents and skills are copied beside every folder this file makes under `ROOT`.
 */
const SHIP_MD = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');
fs.cpSync(path.join(TEAM, 'agents'), path.join(ROOT, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(ROOT, 'skills'), { recursive: true });

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one file committed on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'add.ts'), 'export const add = (a, b) => a + b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/**
 * `implement → ship`, with the team's `dev/ship.md` as its ending — its keys and its agent — with only its `after:` changed, since this
 * folder has no review.
 */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  assert.match(SHIP_MD, /^after: review$/m);
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review$/m, 'after: implement'));
  return dir;
};

/**
 * An engine board a test settles by hand, as gate.test.ts's: what each task was filed with, and every filing. `settle` takes a check's
 * exit code where it is given: a check settled with none did not finish (`exitVerdicts`). `list` views the tasks it is handed that were
 * filed. A check's stdout is empty unless a test gives it (`printed`), and an `Error` given in its place is what reading it throws.
 */
const board = () => {
  type Filed = { id: string; brief: string; cwd?: string; closeoutSchema?: object; config?: TaskSpec['config'] } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; printed?: string | Error }>();
  const filings: string[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
    /** A check's verdict is its attempt's exit code (`exitVerdicts`); its log and streams say nothing of it. */
    logs: async () => '(no output yet)',
    output: async (id: string, stream: 'stdout' | 'stderr') => {
      const t = tasks.get(id);
      if (t?.printed instanceof Error) throw t.printed;
      return typeof t?.exitCode === 'number' ? (stream === 'stdout' ? (t.printed ?? '') : '') : undefined;
    },
    feed: async () => ({ entries: [], cursor: 0 }),
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, tasks, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };

/** What implement does in its worktree, by default: add.ts gains `sub`. */
const addSub = (workspace: string) => fs.appendFileSync(path.join(workspace, 'add.ts'), 'export const sub = (a, b) => a - b;\n');

/** A repository, a board, a folder and the work implement does, where a test gives its own. */
type Given = { repo?: string; board?: ReturnType<typeof board>; dir?: string; work?: (workspace: string) => void };

/**
 * A run of `implement → ship` with implement done and committed on its branch: the run at its result, waiting at the ending's gate.
 *
 * A repository and a board of its own, unless it is given them: two runs of one repository, on one board, are two endings for one checkout.
 */
async function atTheGate(given: Given = {}) {
  const repo = given.repo ?? aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: given.dir ?? folder() }));
  const { e, tasks, filings, settle } = given.board ?? board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  (given.work ?? addSub)(work.workspace!);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, e, tasks, filings, settle, pass, base: git(repo, 'rev-parse', 'HEAD') };
}

const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';

/**
 * A run at its ending, approved and filed, whose shipper did as its recipe says: staged the merge of the result in the repository's
 * checkout and signed off `done` with the message — and the pass after, which files ship's check on that merge.
 */
async function stagedAndSigned(given: Given & { message?: string; artifacts?: string[] } = {}) {
  const at = await atTheGate(given);
  await runWith(at.e, approveRun(at.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(at.e, advanceRun(readRun(at.id)))).filed, ['ship']);
  git(at.repo, 'merge', '--no-ff', '--no-commit', at.branch);
  at.settle(`${at.id}-ship`, 'succeeded', { ...SIGNED, artifacts: given.artifacts ?? [], message: given.message ?? MESSAGE });
  const signed = await runWith(at.e, advanceRun(readRun(at.id)));
  return { ...at, signed, checkId: `${at.id}-ship-check` };
}

const mergeHead = (repo: string): boolean => fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));

/** `npm`, offline, in a directory: a workspace-only tree needs no registry, and a test never reaches one. */
const npm = (cwd: string, ...args: string[]) =>
  execFileSync('npm', [...args, '--offline', '--no-audit', '--no-fund'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * A repository as npm workspaces leave it: `packages/a` a workspace package, the lockfile npm writes committed on main, and `node_modules`
 * installed from it in the checkout — as a person's checkout is, by the `npm install` they last ran on main.
 */
const anNpmRepo = (): string => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(repo, 'packages', 'a'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages', 'a', 'package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }));
  fs.writeFileSync(path.join(repo, 'packages', 'a', 'index.js'), "module.exports = 'a';\n");
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  npm(repo, 'install', '--package-lock-only');
  npm(repo, 'install');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'workspaces');
  return repo;
};

/** implement's work that brings a dependency: a workspace package `b`, and the lockfile npm writes for it, as a branch commits both. */
const addB = (workspace: string) => {
  fs.mkdirSync(path.join(workspace, 'packages', 'b'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages', 'b', 'package.json'), JSON.stringify({ name: 'b', version: '1.0.0' }));
  fs.writeFileSync(path.join(workspace, 'packages', 'b', 'index.js'), "module.exports = 'b';\n");
  npm(workspace, 'install', '--package-lock-only');
};

/** The team's folder, its ship's `check:` a line that needs package `b` installed where it runs, as a typecheck needs `@types/js-yaml`. */
const requiringB = (): string => {
  const dir = folder();
  const ship = path.join(dir, 'ship.md');
  const text = fs.readFileSync(ship, 'utf8');
  assert.match(text, /^check: .+$/m);
  fs.writeFileSync(ship, text.replace(/^check: .+$/m, `check: node -e "require('b')"`));
  return dir;
};

/** The check the run filed, run as the engine's worker runs it, in the checkout, with `npm` offline and a `PATH` a test may put first. */
const runCheck = (tasks: ReturnType<typeof board>['tasks'], checkId: string, repo: string, first?: string) => {
  const [cmd = '', ...args] = tasks.get(checkId)!.spec.config?.command ?? [];
  const PATH = first ? `${first}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH;
  return spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH, npm_config_offline: 'true' } });
};

/** Each entry under a `node_modules`, a level down, with what it is and when it changed: what an install would change. */
const modulesOf = (repo: string): string[] =>
  fs
    .readdirSync(path.join(repo, 'node_modules'), { recursive: true, withFileTypes: false })
    .map(String)
    .sort()
    .map((rel) => {
      const st = fs.lstatSync(path.join(repo, 'node_modules', rel));
      return `${rel} ${st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file'} ${st.mtimeMs}`;
    });

test("an ending's merge that brings a dependency: its check installs what the merged lockfile asks for in the checkout, first, says so, and lands — package.json and package-lock.json as the merge staged them", async () => {
  const repo = anNpmRepo();
  const { id, e, tasks, settle, signed, checkId, base } = await stagedAndSigned({ repo, dir: requiringB(), work: addB });
  assert.throws(() => execFileSync('node', ['-e', "require('b')"], { cwd: repo, stdio: 'ignore' }), 'the checkout does not have b yet');

  const filed = tasks.get(checkId)!.spec;
  assert.equal(filed.brief, `node -e "require('b')"`);
  assert.deepEqual(filed.config?.command?.slice(0, 2), ['sh', '-c']);
  assert.match(filed.config?.command?.[2] ?? '', /\nnode -e "require\('b'\)"$/, 'the install first, then the check on a line of its own');
  assert.ok(
    signed.notes.includes(
      "ship: the merge's package-lock.json asks for node_modules/b, which the checkout's node_modules does not have: its check runs npm install there first",
    ),
    signed.notes.join('\n'),
  );

  const r = runCheck(tasks, checkId, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\[nemia check\] the staged merge asks for packages this checkout has not installed: npm install --no-save/m);
  assert.equal(fs.realpathSync(path.join(repo, 'node_modules', 'b')), fs.realpathSync(path.join(repo, 'packages', 'b')));
  git(repo, 'diff', '--quiet');
  assert.match(
    git(repo, 'diff', '--cached', '--name-only'),
    /^package-lock\.json$/m,
    "the merge owns the manifests: the working tree still matches what it staged, and what it staged is the branch's lockfile",
  );

  settle(checkId, 'succeeded', undefined, 0);
  await runWith(e, advanceRun(readRun(id)));
  const landed = readRun(id).steps.ship.landed;
  assert.ok(landed && 'commit' in landed, JSON.stringify(landed));
  assert.equal(git(repo, 'rev-parse', 'HEAD^1'), base);
  assert.equal(git(repo, 'status', '--porcelain'), '', 'nothing left in the checkout');
});

test("an ending's merge whose lockfile is main's: its check installs nothing, and the checkout's node_modules is as it was", async () => {
  const repo = anNpmRepo();
  const before = modulesOf(repo);
  const { tasks, signed, checkId } = await stagedAndSigned({ repo, dir: requiringB() });
  assert.deepEqual(tasks.get(checkId)!.spec.config?.command, ['sh', '-c', `node -e "require('b')"`], 'the check alone, no install');
  assert.equal(
    signed.notes.some((n) => n.includes('npm install')),
    false,
    signed.notes.join('\n'),
  );

  const bin = fs.mkdtempSync(path.join(ROOT, 'npm-'));
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\ntouch ${JSON.stringify(path.join(bin, 'called'))}\n`, { mode: 0o755 });
  const r = runCheck(tasks, checkId, repo, bin);
  assert.equal(r.status, 1, `the check refuses on its own command, which needs b\n${r.stdout}${r.stderr}`);
  assert.equal(
    fs.existsSync(path.join(bin, 'called')),
    false,
    'npm was not called: the one first on the PATH leaves a mark, and there is none',
  );
  assert.deepEqual(modulesOf(repo), before);
});

test("a merge its check refused is aborted with the branch's packages left installed; the next `npm install` on main takes them out", async () => {
  const repo = anNpmRepo();
  const { id, e, tasks, settle, checkId } = await stagedAndSigned({ repo, dir: requiringB(), work: addB });
  assert.equal(runCheck(tasks, checkId, repo).status, 0);
  settle(checkId, 'failed', undefined, 1);
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(mergeHead(repo), false, 'aborted');
  assert.ok(readRun(id).steps.ship.landed && 'aborted' in readRun(id).steps.ship.landed!);
  assert.equal(fs.existsSync(path.join(repo, 'packages', 'b')), false, 'the branch is gone from the checkout');
  assert.ok(fs.lstatSync(path.join(repo, 'node_modules', 'b')).isSymbolicLink(), 'and its package is still installed');
  assert.equal(checkoutParts(repo), null, 'a package the lockfile does not name is not looked for');

  assert.match(npm(repo, 'install'), /removed 1 package/, "npm install on main removes what main's lockfile does not name");
  assert.equal(fs.existsSync(path.join(repo, 'node_modules', 'b')), false);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});
