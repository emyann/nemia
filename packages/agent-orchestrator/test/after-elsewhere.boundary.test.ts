/**
 * What `nemia start --after` refuses before a run is written, one refusal of which is a parent on another base branch: the repository's
 * own checkout is switched to a branch a person made. The handle of the test place switches no checkout to another branch, so this
 * keeps the git place; the rest of `--after` is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type TaskSpec, ForgetRefused } from 'agent-runtime';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { isRepositoryRun } from '../src/run.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-after-elsewhere-');
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
 * - `closedOut`: whether each task's last attempt gave the statement it was asked for, as the runtime reports it (`Attempt.closedOut`):
 *   once it has settled, its attempt ended `done` by its harness with the fact beside it. Absent, the attempt carries no such key, as
 *   an older journal's does.
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
  const closedOut = new Map<string, boolean>();
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
                        ...(settled && !reason && closedOut.has(id)
                          ? { ended: 'succeeded', reason: 'harness', closedOut: closedOut.get(id) }
                          : {}),
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
  return { e, tasks, filings, stopped, forgets, settle, logs, outputs, said, deaf, waiting, denials, closedOut };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** A run this file started on a repository: a repository run, whose repository and base branch are on its record. */
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);
/** A refusal of the kind `tag`, exit 2, whose words name each of `facts`: what was refused and the fix. */
const refusal =
  (tag: 'Missing' | 'Invalid' | 'Conflict', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && facts.every((fact) => err.message.includes(fact));

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
  return { run, wt, branch: `wf/${run.id}/implement` };
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).length;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test("REFUSED at `nemia start`, before a run is written: --after an unknown run, a run given twice, another repository's run, a cancelled one, one run --no-worktree, one on another base branch — and the CLI refuses --after with no run, a misspelt --after, a flag given twice and a second brief, and reads --after=<runId>", async (t) => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'parent.txt' });
  const other = await aParent(aRepo(), b, { work: 'other.txt' });
  const called = await aParent(repo, b, { work: 'called.txt' });
  markCancelled(called.run.id);
  const direct = await runPlaced(startRun({ brief: 'the direct parent', repo, workflowDir: oneStep(), isolate: false }));
  const before = runsWritten();
  const starting =
    (...after: string[]) =>
    async () =>
      await runPlaced(startRun({ brief: 'a child', repo, workflowDir: folder(), after }));

  await assert.rejects(
    starting('no-such-run-zz9z'),
    refusal('Invalid', '--after no-such-run-zz9z:', 'no run no-such-run-zz9z', 'nemia ls'),
  );
  await assert.rejects(starting(p.run.id, p.run.id), refusedWith(new RegExp(`^--after ${escaped(p.run.id)} is given twice`)));
  await assert.rejects(
    starting(other.run.id),
    refusedWith(
      new RegExp(
        `^--after ${escaped(other.run.id)}: ${escaped(other.run.id)} works on ${escaped(other.run.repo)}, and this run on ${escaped(repo)}\\.`,
      ),
    ),
  );
  await assert.rejects(
    starting(called.run.id),
    refusal('Invalid', `--after ${called.run.id}:`, 'was cancelled at', 'never lands', `without --after ${called.run.id}`),
  );
  await assert.rejects(starting(direct.id), refusedWith(/\(--no-worktree\), so it has no result branch to land/));
  gitIn(repo, 'checkout', '-q', '-b', 'elsewhere');
  await assert.rejects(
    starting(p.run.id),
    refusedWith(new RegExp(`lands on ${escaped(p.run.branch)}, and this run would start from elsewhere`)),
  );
  gitIn(repo, 'checkout', '-q', p.run.branch);
  assert.equal(runsWritten(), before, 'no run written');

  const { main } = await import('../src/cli/main.ts');
  const typed = (...flags: string[]) => main(['start', 'a child', '--workflows', folder(), '--repo', repo, ...flags]);
  await assert.rejects(typed('--after'), refusedWith(/^--after takes the run this one waits on, by its id/));
  await assert.rejects(typed('--after', '--no-worktree'), refusedWith(/^--after takes the run this one waits on/));
  await assert.rejects(typed('--after', p.run.id, '--after', p.run.id), refusedWith(/is given twice/));
  await assert.rejects(typed('--after='), refusedWith(/^--after takes the run this one waits on, by its id/));
  await assert.rejects(typed('--afer', p.run.id), refusal('Invalid', 'nemia start does not take --afer.', '--after <runId>'));
  await assert.rejects(typed('-a', p.run.id), refusedWith(/^nemia start does not take -a\./));
  await assert.rejects(typed('--repo', repo), refusedWith(/^nemia start takes --repo once/));
  await assert.rejects(
    typed('--after', p.run.id, p.run.id),
    refusedWith(new RegExp(`^nemia start takes one brief, and ${escaped(p.run.id)} is a second\\.`)),
  );
  assert.equal(
    runsWritten(),
    before,
    'nor by the CLI: dropped, any of these would start a run that waits on nothing, or on the wrong repository, and the tick would file it',
  );

  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  const second = await aParent(repo, b, { work: 'second.txt' });
  await typed('--after', p.run.id, `--after=${second.run.id}`);
  const id = printed[0].split(' ')[0];
  assert.deepEqual(readRun(id).after, [p.run.id, second.run.id], '--after is allowed as often as there are runs to wait on');
  assert.match(
    printed.join('\n'),
    new RegExp(
      `^waits on: ${escaped(p.run.id)}, ${escaped(second.run.id)} — nothing is filed until nemia decide says each has landed on ${escaped(p.run.branch)}$`,
      'm',
    ),
  );
  printed.length = 0;
  await typed();
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${printed[0].split(' ')[0]}.json`), 'utf8')), 'after'),
    false,
    'without --after the record is what it was',
  );
});
