/**
 * `nemia hold --until` where git alone could say something: a run on another base branch, checked out by hand, and one whose result
 * branch a person removed with `git worktree remove` and `git branch -D`, a folder run and one run --no-worktree, which hold all the
 * same since the wait reads no git, beside a pruned run, which a hold is refused on. One fixture sets them up together. Over a store and
 * repositories of its own, with git for real. The rest of `nemia hold` is told on the stage, in
 * `hold.test.ts`, and its pure refusals in `src/wait/wait.test.ts`.
 */
import { recordText, runRecord } from '../testing.ts';
import { runMarkKey } from '../src/runs/run-keys.ts';
import { test, type TestContext } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { TaskPhase } from '../src/run.ts';
import { scratch } from 'test-kit/scratch';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';
import { names } from './assessed.ts';
import { advanceRun, prune, startRun, runWith as runEngine, gitPlaceLayer } from '../src/runner.ts';
import { builtinGitPlace } from '../src/place/builtin.store.ts';
import { LINE_NAME } from '../src/run.ts';
import { typed as onHandler } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-hold-git-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const runWith = runOver(runEngine, gitPlaceLayer, ENV);
const runPlaced = runGiven(gitPlaceLayer, ENV);

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit. */
const aRepo = () => {
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
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  const wt = runRecord(ROOT, run.id).steps.implement.workspace!;
  fs.writeFileSync(path.join(wt, `fix-${run.id}.ts`), 'export const fixed = true;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'add fix');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  if (merged) git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', runRecord(ROOT, run.id).steps.implement.branch!);
  return run;
};

/** A run of `oneStep` in `repo`, its step filed and still running. */
const aRunning = async (b: ReturnType<typeof board>, repo: string) => {
  const run = await runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  return run;
};

/** `nemia <verb>` run on its entry's handler, as the api calls it: the error it ended with, if it did. */
const typed = async (_t: TestContext, e: Engine, ...argv: string[]) => {
  try {
    await onHandler(argv, e, undefined, builtinGitPlace, ENV);
    return { error: undefined };
  } catch (err) {
    return { error: err as Error & { exitCode?: number; _tag?: string } };
  }
};

/** A refusal of the handler: of the kind `tag`, exit 2, and a message that names each of `facts` — the ids, the flag, the branch. */
const refused = async (t: TestContext, e: Engine, tag: string, facts: string[], ...argv: string[]) => {
  const { error } = await typed(t, e, ...argv);
  assert.ok(error, `nemia ${argv.join(' ')} was not refused`);
  assert.equal(error._tag, tag, error.message);
  assert.equal(error.exitCode, 2, error.message);
  names(error.message, ...facts);
};

/** A team whose one step works in a folder the run makes, with no repository. */
const folderTeam = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.writeFileSync(path.join(dir, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite the note\n');
  return dir;
};

test('a hold on a pruned run is refused, and a hold on or until a folder run, a run started --no-worktree, one on another base branch, or one whose result branch is gone is held: git is not read', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = await aRunning(b, repo);
  const target = await aRunning(b, repo);

  const pruned = await aDone(b, repo);
  assert.equal((await runWith(b.e, prune(pruned.id, { yes: true, unmerged: true }))).kind, 'pruned');
  await refused(t, b.e, 'Conflict', [`${pruned.id} was pruned at`, 'nothing to hold'], 'hold', pruned.id, '--until', target.id);

  const folder = await runPlaced(startRun({ brief: 'a note', repo: fs.mkdtempSync(path.join(ROOT, 'plain-')), workflowDir: folderTeam() }));
  assert.equal(
    (await typed(t, b.e, 'hold', folder.id, '--until', target.id)).error,
    undefined,
    'a folder run is held until a run, as any other',
  );
  const inPlace = await runPlaced(startRun({ brief: 'on main itself', repo, workflowDir: oneStep(), isolate: false }));
  git(repo, 'checkout', '-q', '-b', 'release');
  const onRelease = await runPlaced(startRun({ brief: 'onto release', repo, workflowDir: oneStep() }));
  git(repo, 'checkout', '-q', 'main');
  const dropped = await aDone(b, repo);
  git(repo, 'worktree', 'remove', '--force', runRecord(ROOT, dropped.id).steps.implement.workspace!);
  git(repo, 'branch', '-q', '-D', `wf/${dropped.id}/${LINE_NAME}`);
  for (const until of [folder.id, inPlace.id, onRelease.id, dropped.id]) {
    const waiter = await aRunning(b, repo);
    assert.equal((await typed(t, b.e, 'hold', waiter.id, '--until', until)).error, undefined, `--until ${until} is held: git is not read`);
    assert.ok(recordText(ROOT, runMarkKey(waiter.id, 'hold')) !== undefined, `a hold written on ${waiter.id}`);
  }

  for (const r of [pruned, run]) assert.ok(recordText(ROOT, runMarkKey(r.id, 'hold')) === undefined, `no hold written on ${r.id}`);
});
