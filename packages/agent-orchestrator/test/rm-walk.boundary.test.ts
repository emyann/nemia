/**
 * The walk of `nemia rm` on the git place, at shipped defaults: a run that is over is forgotten, its worktree removed through git, what
 * its failed step left uncommitted committed on its branch first, what git ignores not, and nothing a link in it leads to touched. One of
 * the three walks kept on real git.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-store-');
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');

/** A run record over `/repo`, without worktrees: a test of the record, not of git. */
const aRun = (id: string, steps: Run['steps']): Run => ({
  id,
  repo: '/repo',
  workspace: '/repo',
  baseRef: 'abc123',
  branch: 'main',
  isolate: false,
  brief: 'add a flag',
  workflowDir: WORKFLOW,
  steps,
  createdAt: '2026-01-01T00:00:00Z',
});

/** What the daemon does to the run's json, and the only thing it does to it. */
const writeRun = (run: Run) => fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(run, null, 2));

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
           * consumed is on it once it has settled, and not before: a `--bg` session writes its cost as its process exits. Given several
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
                        ...(settled && !reason && stated.has(id) ? { ended: 'done', reason: 'harness', stated: stated.get(id) } : {}),
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

/** What `nemia rm` says the board's `forget` did with a run's one task. */
const FORGOT_ONE = '; the engine forgot 1 task of it (1.0 KB of journal, 2 feed lines)';

/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** Git in a checkout, as a person types it there. */
const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository whose `.gitignore` names what a worktree is given and what a check leaves: not work, and never committed. */
const anIgnoringRepo = (): string => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.e2e/\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'ignore');
  return repo;
};
const worktreesOf = (repo: string) =>
  gitIn(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
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

test("`nemia rm` forgets a run that is over, at shipped defaults: its worktree removed through git, which lists it no more — what the failed step left uncommitted committed on its branch first, what git ignores not, and nothing a link in it leads to touched — then the record and every file under its id; its branch kept, and said so; the engine's task of it forgotten, and said so; a second `nemia rm` says there is no such run, and exits 0", async (t) => {
  const repo = anIgnoringRepo();
  const b = board();
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder() }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const wt = readRun(run.id).steps.implement.workspace!;
  assert.equal(wt, path.join(ROOT, 'worktrees', run.id, 'implement'));
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));

  fs.writeFileSync(path.join(wt, 'fix.ts'), 'export const fixed = true;\n');
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep me\n');
  fs.mkdirSync(path.join(wt, 'node_modules'));
  fs.symlinkSync(outside, path.join(wt, 'node_modules', 'linked'));
  fs.mkdirSync(path.join(wt, '.e2e'));
  fs.writeFileSync(path.join(wt, '.e2e', 'shot.png'), 'png');
  fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement', 'report.md'), 'report\n');
  fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'checks', `${run.id}-implement-check.stderr`), 'boom\n');
  fs.writeFileSync(path.join(ROOT, 'checks', `${run.id}-x2-implement-check.stderr`), 'not mine\n');
  writeRun(aRun(`${run.id}-x2`, { implement: { taskId: `${run.id}-x2-implement` } }));
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'done'), { recursive: true });
  const filings = [...b.filings];

  const { printed, error } = await rmTyped(t, b.e, run.id);
  assert.equal(error, undefined);
  const branch = `wf/${run.id}/implement`;
  const commit = gitIn(repo, 'rev-parse', branch);
  assert.deepEqual(printed, [
    `${run.id}  forgotten: removed 1 worktree, committed what implement left uncommitted on ${branch} as ${commit.slice(0, 7)}; ` +
      `removed runs/${run.id}.json, runs/${run.id}.asks/, runs/${run.id}/, checks/${run.id}-implement-check.stderr, worktrees/${run.id}/; ` +
      `kept ${branch} — branches are kept unless asked: --delete-branches deletes those merged into ${run.branch}` +
      FORGOT_ONE,
  ]);

  assert.ok(!worktreesOf(repo).includes(wt), 'git lists the worktree no more');
  assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id));
  assert.equal(
    gitIn(repo, 'log', '-1', '--format=%s', branch),
    'implement: hand off what was left uncommitted, before its run was forgotten',
  );
  assert.deepEqual(
    gitIn(repo, 'show', '--name-only', '--format=', branch).split('\n'),
    ['fix.ts'],
    'the work written after the pass that handed the failed step off, and nothing git ignores',
  );
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  for (const gone of [[`${run.id}.json`], [run.id], [`${run.id}.asks`]])
    assert.ok(!under('runs', ...gone), `runs/${gone.join('/')} removed`);
  assert.ok(!under('checks', `${run.id}-implement-check.stderr`));
  assert.ok(under('checks', `${run.id}-x2-implement-check.stderr`), "another run's check log is left");
  assert.deepEqual(
    [b.filings, b.stopped, b.tasks.has(`${run.id}-implement`), b.forgets],
    [filings, [], false, [{ taskIds: [`${run.id}-implement`], yes: true }]],
    "the engine is asked to forget the run's task, once, and stops or files nothing",
  );
  assert.throws(
    () => readRun(run.id),
    (err: Error) => err.message.startsWith('no such run: '),
  );

  const again = await rmTyped(t, b.e, run.id);
  assert.deepEqual([again.printed, again.error], [[`${run.id}  no such run — nothing to forget`], undefined]);
  assert.ok(under('checks', `${run.id}-x2-implement-check.stderr`), "with no record, still not another stored run's");
  fs.rmSync(path.join(ROOT, 'runs', `${run.id}-x2.json`));
});
