/**
 * `nemia hold --until` refused where git alone can say why: a run on another base branch, checked out by hand, and one whose result
 * branch a person removed with `git worktree remove` and `git branch -D` — beyond the test place, which has no checkout of another
 * branch and no hand on a worktree past its handle — beside a pruned run, a folder run and one run --no-worktree, which this one fixture
 * sets up together. Over a store and repositories of its own, with git for real. The rest of `nemia hold` is told on the stage, in
 * `hold.test.ts`, and its pure refusals in `src/wait/wait.test.ts`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-hold-git-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, prune, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { LINE_NAME } = await import('../src/run.ts');
const { main } = await import('../src/cli/main.ts');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const holdFileOf = (id: string) => path.join(ROOT, 'runs', `${id}.hold`);

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** Just enough engine: each task's phase, and its closeout on its one attempt once it has one. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown }>();
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
          brief: t ? 'filed' : '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
        },
      };
    },
    file: async (spec: { id: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, filings, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A run of `oneStep` in `repo`, its step filed, `fix.ts` committed on its branch and signed off: merged into main with `merged`. */
const aDone = async (b: ReturnType<typeof board>, repo: string, { merged = false } = {}) => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, `fix-${run.id}.ts`), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'add fix');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', readRun(run.id).steps.implement.branch!);
  return run;
};

/** A run of `oneStep` in `repo`, its step filed and still running. */
const aRunning = async (b: ReturnType<typeof board>, repo: string) => {
  const run = await runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  return run;
};

/** `nemia <verb>`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  try {
    await main(argv, e);
    return { printed: printed.join('\n'), error: undefined };
  } catch (err) {
    return { printed: printed.join('\n'), error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

/** A refusal through the CLI: exit 2, and a message that `pattern` matches. */
const refused = async (t: TestContext, e: Engine, pattern: RegExp, ...argv: string[]) => {
  const { error } = await typed(t, e, ...argv);
  assert.ok(error, `nemia ${argv.join(' ')} was not refused`);
  assert.equal(error.exitCode, 2, error.message);
  assert.match(error.message, pattern);
};

/** A team whose one step works in a folder the run makes, with no repository. */
const folderTeam = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(dir, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite the note\n');
  return dir;
};

test('REFUSED at shipped defaults: a hold on a pruned run and on a folder run, and --until a folder run, a run started --no-worktree, one on another base branch, and one whose result branch is gone', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await aRunning(b, repo);
  const id = run.id;
  const target = await aRunning(b, repo);

  const pruned = await aDone(b, repo);
  assert.equal((await runWith(b.e, prune(pruned.id, { yes: true, unmerged: true }))).kind, 'pruned');
  await refused(
    t,
    b.e,
    new RegExp(`^${pruned.id} was pruned at .*: nothing of it is filed again, so there is nothing to hold\\.$`),
    'hold',
    pruned.id,
    '--until',
    target.id,
  );

  const folder = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'plain-')), workflowDir: folderTeam() }));
  await refused(t, b.e, new RegExp(`^${folder.id}'s team works in folders \\(place: folder\\)`), 'hold', folder.id, '--until', target.id);
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${folder.id}: ${folder.id} is a folder run \\(place: folder\\), which never ships onto a branch`),
    'hold',
    id,
    '--until',
    folder.id,
  );

  const inPlace = await runPlaced(startRun({ brief: 'on main itself', repo, workflowDir: oneStep(), isolate: false }));
  await refused(
    t,
    b.e,
    new RegExp(`^--until ${inPlace.id}: ${inPlace.id} worked on main itself \\(--no-worktree\\), so it has no result branch to ship`),
    'hold',
    id,
    '--until',
    inPlace.id,
  );

  git(repo, 'checkout', '-q', '-b', 'release');
  const onRelease = await runPlaced(startRun({ brief: 'onto release', repo, workflowDir: oneStep() }));
  git(repo, 'checkout', '-q', 'main');
  await refused(
    t,
    b.e,
    new RegExp(
      `^--until ${onRelease.id}: ${onRelease.id} ships onto release, and ${id} onto main, so ${id} would wait on a branch it never meets`,
    ),
    'hold',
    id,
    '--until',
    onRelease.id,
  );

  const dropped = await aDone(b, repo);
  git(repo, 'worktree', 'remove', '--force', readRun(dropped.id).steps.implement.workspace!);
  git(repo, 'branch', '-q', '-D', `wf/${dropped.id}/${LINE_NAME}`);
  await refused(
    t,
    b.e,
    new RegExp(
      `^--until ${dropped.id}: wf/${dropped.id}/${LINE_NAME} is gone, and git cannot find it on main, so ${id} would wait for ever`,
    ),
    'hold',
    id,
    '--until',
    dropped.id,
  );

  for (const r of [pruned, folder, run]) assert.ok(!fs.existsSync(holdFileOf(r.id)), `no hold written on ${r.id}`);
});
