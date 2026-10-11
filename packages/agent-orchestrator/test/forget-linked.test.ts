/**
 * `nemia rm` on a store under a link. Git names a worktree by its real path, every link on the way followed, so a store reached through one
 * — a home directory on another disk, or a temporary directory on macOS, `/var` in `/private/var` — reads its worktrees under a path the
 * store never wrote. A file of its own, since `WF_ROOT` is read once, as the package loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const REAL = scratch('wf-linked-');
const ROOT = path.join(scratch('wf-link-'), 'store');
fs.mkdirSync(path.join(REAL, 'store'));
fs.symlinkSync(path.join(REAL, 'store'), ROOT);
process.env.WF_ROOT = ROOT;
const { advanceRun, forgetRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

test("REFUSED before, now forgotten: a store under a link — git lists each worktree by its real path, and `nemia rm` still finds them as the run's, hands the directory's work off under the step whose it is, and removes them; nothing is held as a stray", async () => {
  const repo = fs.mkdtempSync(path.join(REAL, 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  const folder = fs.mkdtempSync(path.join(REAL, 'wf-'));
  fs.writeFileSync(path.join(folder, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const tasks = new Map<string, string>();
  const e = promised({
    view: async (id: string) => ({
      id,
      phase: tasks.get(id) ?? 'pending',
      state: {
        brief: tasks.has(id) ? 'filed' : '',
        settled: tasks.get(id) === 'failed' ? 'failed' : null,
        attempts: [],
        stopRequested: false,
      },
    }),
    file: async (spec: { id: string }) => {
      tasks.set(spec.id, 'pending');
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
  });

  const run = await runPlaced(startRun({ brief: 'under a link', repo, workflowDir: folder }));
  await runWith(e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  assert.ok(wt.startsWith(ROOT), 'the record names it through the link');
  assert.match(
    git(repo, 'worktree', 'list', '--porcelain'),
    new RegExp(`^worktree ${fs.realpathSync(wt).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'),
    'git, by its real path',
  );
  tasks.set(`${run.id}-implement`, 'failed');
  fs.writeFileSync(path.join(wt, 'left.txt'), 'left\n');

  const forgot = await runWith(e, forgetRun(run.id));
  assert.deepEqual(
    [forgot.kind, forgot.left, forgot.removed.length, forgot.handedOff.map((h) => h.step)],
    ['forgotten', [], 1, ['implement']],
  );
  assert.ok(
    !fs.existsSync(wt) && !fs.existsSync(path.join(ROOT, 'worktrees', run.id)) && !fs.existsSync(path.join(ROOT, 'runs', `${run.id}.json`)),
  );
  assert.equal(git(repo, 'show', '--name-only', '--format=', `wf/${run.id}/implement`), 'left.txt');
});
