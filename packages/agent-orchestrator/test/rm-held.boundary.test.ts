/**
 * `nemia rm` over what git alone holds: a worktree a person locked, a hand-off a pre-commit hook refuses with the work left staged in
 * git's index, and a worktree on no branch. The test place models no lock, no hook, no index and no checkout on no branch, so these
 * keep the git place; the rest of `nemia rm` is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { isRepositoryRun } from '../src/run.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-rm-held-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, forgetRun, forgetLine: forgetLineOf, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { markCancelled, readRun } = await import('../src/record/record.store.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/**
 * An engine board a test settles by hand. It keeps what each task was filed with — so a view carries
 * the closeout schema the run really asked for — and counts every filing. Each task's session is its
 * own (`native-<id>`), and a settled task carries the exit code it is given, as a detached one does.
 *
 * Beside the engine it hands back what a test sets or reads on it:
 * - `said`: what the engine journalled as said to each task (`say`), in order: its view's `state.said`.
 * - `deaf`: tasks whose session is not given the words: `say` rejects, with no exit code, and journals nothing.
 * - `waiting`: what the harness says each task's session waits for, as `claude agents` says it: the engine carries it onto the view
 *   (`TaskView.waitingFor`).
 * - `denials`: what the harness denied each task's last attempt, as the runtime records it on the attempt's end (`Attempt.denials`):
 *   once it has settled.
 * - `stated`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.stated`): once
 *   it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as an
 *   older journal's does.
 */
const board = () => {
  type Filed = TaskSpec & { id: string };
  const tasks = new Map<
    string,
    { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; reason?: string | string[]; usage?: object }
  >();
  const filings: string[] = [];
  const stopped: string[] = [];
  const logs = new Map<string, string>();
  const outputs = new Map<string, string>();
  const said = new Map<string, Array<{ at: string; attempt: number; text: string }>>();
  const deaf = new Set<string>();
  const waiting = new Map<string, string>();
  const denials = new Map<string, Array<{ tool: string; what?: string }>>();
  const stated = new Map<string, boolean>();
  const forgets: { taskIds: string[]; yes: boolean }[] = [];
  const endOf = (reason: string) =>
    reason === 'budget' ? { ended: 'failed', reason: 'harness', limit: 'budget' } : { ended: 'failed', reason };
  let clock = Date.parse('2026-09-14T16:00:00.000Z');
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      const reasons = Array.isArray(t?.reason) ? t.reason : [t?.reason];
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        ...(waiting.get(id) ? { waitingFor: waiting.get(id) } : {}),
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: said.get(id) ?? [],
          /**
           * An attempt given a reason ended `failed` with it, as the engine records a session that went quiet unsigned, or broke. What it
           * consumed is on it once it has settled, and not before: a job writes its cost as it prints its result. Given several
           * reasons, one attempt ended with each, in order, and the last carries what the task settled with. `budget` is no end the
           * runtime judges: its harness's cut is carried on a failed end as `limit`, as the runtime records it.
           */
          attempts:
            !t || t.phase === 'pending'
              ? []
              : reasons.map((reason, i) =>
                  i < reasons.length - 1
                    ? { n: i + 1, ...endOf(reason!), nativeId: `native-${id}`, exitCode: null, usage: null }
                    : {
                        n: i + 1,
                        nativeId: `native-${id}`,
                        closeout: t.closeout,
                        exitCode: t.exitCode ?? null,
                        usage: settled && t.usage ? t.usage : null,
                        ...(reason ? endOf(reason) : { ended: null }),
                        ...(settled && denials.get(id) ? { denials: denials.get(id) } : {}),
                        ...(settled && !reason && stated.has(id) ? { ended: 'succeeded', reason: 'harness', stated: stated.get(id) } : {}),
                      },
                ),
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async (id: string) => {
      stopped.push(id);
    },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    /** A stream of a task's latest attempt the runtime kept, by `<id>.<stream>`: none where a test set none, as for a check run before. */
    output: async (id: string, stream: string) => outputs.get(`${id}.${stream}`),
    /**
     * The engine's `say`, as far as a run can tell it: refused in its words, exit code 2, for empty words, a task it has no record of, one
     * settled and one not started; rejected with no exit code for a session not given the words; otherwise journalled on the task, and
     * returned.
     */
    say: async (id: string, text: string) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      if (!text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const t = tasks.get(id);
      if (!t) throw refuse(`\`${id}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      if (['succeeded', 'failed', 'stopped'].includes(t.phase))
        throw refuse(`\`${id}\` has settled (${t.phase}): no session of it is running to hear anything.`);
      if (t.phase === 'pending') throw refuse(`\`${id}\` has not started an attempt yet, so there is no session to hear anything.`);
      if (deaf.has(id)) throw new Error(`say: ae/${id}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`);
      const entry = { at: new Date((clock += 60_000)).toISOString(), attempt: 1, text };
      said.set(id, [...(said.get(id) ?? []), entry]);
      return entry;
    },
    /**
     * The engine's `forget`, as far as a run can tell it: refused whole for a task not settled, naming it; otherwise each task taken off
     * the board with `yes`, its journal 1 KB and its 2 lines in the feed, and each call counted on `forgets`.
     */
    forget: async (ids: string[], options?: { yes?: boolean }) => {
      forgets.push({ taskIds: [...ids], yes: options?.yes === true });
      for (const id of ids)
        if (!['succeeded', 'failed', 'stopped'].includes(tasks.get(id)?.phase ?? 'pending'))
          throw new ForgetRefused({ taskId: id, message: `forget: \`${id}\` has not settled: stop it first.` });
      if (options?.yes) for (const id of ids) tasks.delete(id);
      return { forgotten: options?.yes === true, tasks: ids.map((taskId) => ({ taskId, journalBytes: 1024, feedLines: 2, sessions: [] })) };
    },
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number, reason?: string | string[], usage?: object) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode, reason, usage });
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, stated };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A run this file started on a repository: a repository run, whose repository and base branch are on its record. */
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/** Git in a checkout, as a person types it there. */
const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/**
 * A run another will wait on, on the board its child is ticked on — one engine, as in life: started for real, with worktrees, and its
 * step filed. With `work`, a file committed on its branch; with `signed` — by default, when there is work — its step signed off.
 */
const aParent = async (
  repo: string,
  b: ReturnType<typeof board>,
  {
    work,
    signed = Boolean(work),
    workflowDir,
    brief = 'the parent',
  }: { work?: string; signed?: boolean; workflowDir?: string; brief?: string } = {},
) => {
  const run = repositoryRunOf(await runPlaced(startRun({ brief, repo, workflowDir: workflowDir ?? oneStep() })));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    gitIn(wt, 'add', '-A');
    gitIn(wt, 'commit', '-q', '-m', `add ${work}`);
  }
  if (signed) b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: readRun(run.id).steps.implement.branch! };
};

const worktreesOf = (repo: string) =>
  gitIn(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
const hasBranch = (repo: string, branch: string) => gitIn(repo, 'branch', '--list', branch) !== '';
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));
/** `nemia rm`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const rmTyped = async (t: TestContext, e: Engine, ...args: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    printed.push(a.join(' '));
  });
  const { main } = await import('../src/cli/main.ts');
  try {
    await main(['rm', ...args], e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

test("REFUSED at shipped defaults: a locked worktree — git will not remove it, and neither does `nemia rm`: the run is held, its record, files and branch kept, exit 2, with the command that unlocks it; unlocked, `nemia rm` again finishes. A directory in the run's own that git does not know is held the same way", async (t) => {
  const repo = aRepo();
  const b = board();
  const locked = await aParent(repo, b, { work: 'locked.txt' });
  gitIn(repo, 'worktree', 'lock', '--reason', 'a person holds it', locked.wt);
  markCancelled(locked.run.id);

  const held = await rmTyped(t, b.e, locked.run.id);
  assert.deepEqual(
    [held.error?.exitCode, held.error?.message],
    [2, `nemia rm: ${locked.run.id} not forgotten — its line above says why, and what to do.`],
  );
  assert.deepEqual(held.printed, [
    `${locked.run.id}  not forgotten: ${locked.wt} is locked (a person holds it), and git will not remove it — unlock it if nothing needs it: git -C ${repo} worktree unlock ${locked.wt}. Its record, files and branches are kept until every worktree is gone: nemia rm ${locked.run.id} again then.`,
  ]);
  assert.ok(fs.existsSync(path.join(locked.wt, 'locked.txt')) && worktreesOf(repo).includes(locked.wt));
  assert.ok(readRun(locked.run.id).cancelledAt, 'the record is read with its cancellation, still');

  gitIn(repo, 'worktree', 'unlock', locked.wt);
  assert.equal((await runWith(b.e, forgetRun(locked.run.id))).kind, 'forgotten');
  assert.ok(!worktreesOf(repo).includes(locked.wt) && !under('runs', `${locked.run.id}.cancelled`) && hasBranch(repo, locked.branch));

  const stray = await aParent(repo, b, { work: 'stray.txt' });
  const odd = path.join(ROOT, 'worktrees', stray.run.id, 'notes');
  fs.mkdirSync(odd);
  fs.writeFileSync(path.join(odd, 'mine.txt'), 'mine\n');
  const f = await runWith(b.e, forgetRun(stray.run.id));
  assert.equal(
    forgetLineOf(f),
    `${stray.run.id}  not forgotten: ${odd} is not a worktree git knows, and nemia rm removes worktrees only through git — look in it, and remove it yourself if nothing there is wanted; removed 1 worktree. Its record, files and branches are kept until every worktree is gone: nemia rm ${stray.run.id} again then.`,
  );
  assert.ok(
    fs.existsSync(path.join(odd, 'mine.txt')) && under('runs', `${stray.run.id}.json`),
    "something in the run's directory that git does not list is never deleted behind git's back",
  );
  fs.rmSync(odd, { recursive: true });
  const finished = await runWith(b.e, forgetRun(stray.run.id));
  assert.deepEqual(
    [finished.kind, finished.removed, finished.gone],
    ['forgotten', [], [stray.wt]],
    'its worktree was already gone, and that is normal',
  );
});

test("REFUSED at shipped defaults: a hand-off git will not commit — a pre-commit hook refusing a failed step's code — holds the run in the hook's own words with a safe way on, not git's --force; the work stays, staged. A hook that speaks on stdout alone is heard too, and once a person has committed it, `nemia rm` again forgets the run", async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { signed: true });
  fs.writeFileSync(path.join(p.wt, 'flag.ts'), 'export const flag: any = 1;\n');
  const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(
    hook,
    '#!/bin/sh\necho "lint: flag.ts:1 unexpected any" >&2\necho "husky - pre-commit script failed (code 1)" >&2\nexit 1\n',
    { mode: 0o755 },
  );

  const held = await runWith(b.e, forgetRun(p.run.id));
  assert.equal(
    forgetLineOf(held),
    `${p.run.id}  not forgotten: ${p.wt} holds what implement left uncommitted, and the hand-off could not commit it — lint: flag.ts:1 unexpected any / husky - pre-commit script failed (code 1). That work is on no branch until it is committed, so nothing of it was removed: commit it there yourself (it is staged: git -C ${p.wt} commit), then nemia rm ${p.run.id} again. Its record, files and branches are kept until every worktree is gone: nemia rm ${p.run.id} again then.`,
  );
  assert.equal(gitIn(p.wt, 'status', '--porcelain'), 'A  flag.ts', 'the work is where it was, staged');
  assert.ok(worktreesOf(repo).includes(p.wt) && under('runs', `${p.run.id}.json`));

  fs.writeFileSync(hook, '#!/bin/sh\necho "secret scan: a token in flag.ts"\nexit 1\n', { mode: 0o755 });
  assert.equal(
    (await runWith(b.e, forgetRun(p.run.id))).left[0].uncommitted,
    'secret scan: a token in flag.ts',
    'a hook that speaks on stdout alone: git hands it on as its own stderr',
  );
  fs.writeFileSync(hook, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  assert.equal((await runWith(b.e, forgetRun(p.run.id))).left[0].uncommitted, 'it exited 1', "one that says nothing: git's exit status");

  fs.rmSync(hook);
  gitIn(p.wt, 'commit', '-q', '-m', 'the flag, committed by a person');
  const forgot = await runWith(b.e, forgetRun(p.run.id));
  assert.deepEqual([forgot.kind, forgot.handedOff], ['forgotten', []]);
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s', p.branch), 'the flag, committed by a person');
});

test('REFUSED at shipped defaults: a worktree on no branch — its session stopped with HEAD detached, a commit made there — is held and named with its commit, not removed with the commit on no branch; put on a branch, `nemia rm` again forgets the run and the branch keeps the commit. One detached, clean, at a commit on a branch loses nothing, and is removed', async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'first.txt' });
  gitIn(p.wt, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(p.wt, 'rebased.txt'), 'rebased\n');
  gitIn(p.wt, 'add', '-A');
  gitIn(p.wt, 'commit', '-q', '-m', 'made on no branch');
  const sha = gitIn(p.wt, 'rev-parse', 'HEAD');

  const held = await runWith(b.e, forgetRun(p.run.id));
  assert.equal(
    forgetLineOf(held),
    `${p.run.id}  not forgotten: ${p.wt} is on no branch — its HEAD is detached at ${sha.slice(0, 7)}, as a rebase, a bisect or a checkout of a commit leaves it — and removing it would leave what it holds, committed or not, on no branch: put it on one (git -C ${p.wt} switch -c <branch>, or finish or abort what left it there), then nemia rm ${p.run.id} again. Its record, files and branches are kept until every worktree is gone: nemia rm ${p.run.id} again then.`,
  );
  assert.ok(worktreesOf(repo).includes(p.wt) && gitIn(p.wt, 'rev-parse', 'HEAD') === sha, 'the worktree, and its commit, where they were');

  gitIn(p.wt, 'checkout', '-q', '--detach', p.branch);
  fs.writeFileSync(path.join(p.wt, 'more.txt'), 'more\n');
  assert.deepEqual(
    (await runWith(b.e, forgetRun(p.run.id))).left.map((l) => l.detached),
    [gitIn(p.wt, 'rev-parse', 'HEAD')],
    'uncommitted work beside it, at a commit that is on a branch: a hand-off would still commit onto no branch',
  );
  fs.rmSync(path.join(p.wt, 'more.txt'));
  gitIn(p.wt, 'checkout', '-q', sha);
  gitIn(p.wt, 'switch', '-q', '-c', 'keep-the-rebase');
  assert.equal((await runWith(b.e, forgetRun(p.run.id))).kind, 'forgotten');
  assert.equal(gitIn(repo, 'rev-parse', 'keep-the-rebase'), sha);

  const q = await aParent(repo, b, { work: 'clean.txt' });
  gitIn(q.wt, 'checkout', '-q', '--detach');
  const forgot = await runWith(b.e, forgetRun(q.run.id));
  assert.deepEqual([forgot.kind, forgot.removed, forgot.handedOff], ['forgotten', [q.wt], []]);
});
