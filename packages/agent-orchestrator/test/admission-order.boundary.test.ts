/**
 * Admission in order, on the runtime itself: at a ceiling of one, the runtime admits a run's next step before a newer run's first step
 * filed ahead of it, by the priority the orchestrator files it with. Admission is the runtime's, and the engine's stand-in runs no pass,
 * so this keeps the real engine over a journal in memory, and git beside it; what the orchestrator files is walked in store.test.ts.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nameFor, type Sighting, type TaskSpec, Engine as RuntimeEngine, ForgetRefused } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { isRepositoryRun } from '../src/run.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { plainEngine } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-admission-order-');
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

/** `nemia start`, for real, over a fresh repository, the steps working in the checkout itself. */
const started = async (dir: string) =>
  repositoryRunOf(await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false })));

/** The engine's store, in memory, as its own tests keep one. */
const memoryJournal = (): AsyncJournal => {
  const tasks = new Map<string, Parameters<AsyncJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness that starts whatever it is asked to, and remembers the order: every session at work. */
const startsInOrder = (sessions: Map<string, Sighting>): AsyncRunner => ({
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
});

test("REFUSED without the momentum: at a ceiling of one, the runtime admits a run's next step before a newer run's first step filed ahead of it — and, with no priority, the newer run", async () => {
  const a = await started(folder());
  const b = await started(folder());
  const filedBy = board();
  await runWith(filedBy.e, advanceRun(readRun(a.id)));
  await runWith(filedBy.e, advanceRun(readRun(b.id)));
  filedBy.settle(`${a.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual(
    (await runWith(filedBy.e, advanceRun(readRun(a.id)))).filed,
    ['review'],
    "run a's implement has ended; run b has filed its implement; a's review is filed after it, a pass later",
  );
  const newer = filedBy.tasks.get(`${b.id}-implement`)!.spec;
  const next = filedBy.tasks.get(`${a.id}-review`)!.spec;

  const admitted = async (weigh: (spec: typeof next) => typeof next) => {
    const sessions = new Map<string, Sighting>();
    const e = plainEngine(
      RuntimeEngine.layer({
        root: scratch('wf-admission-order-engine-'),
        journal: asyncStore(memoryJournal()),
        harnesses: { claude: asyncOps(startsInOrder(sessions)) },
        defaultHarness: 'claude',
        maxConcurrent: 1,
      }),
    );
    const as = (spec: typeof next) => ({ ...weigh(spec), harness: 'claude', queued: true }) as Parameters<Engine['file']>[0];
    await Effect.runPromise(e.file(as(newer)));
    await new Promise((r) => setTimeout(r, 5));
    await Effect.runPromise(e.file(as(next)));
    await Effect.runPromise(e.tick());
    assert.deepEqual([...sessions.keys()], [], 'nothing starts on the pass that admits it');
    await Effect.runPromise(e.tick());
    return [...sessions.keys()];
  };
  assert.deepEqual(
    await admitted((spec) => spec),
    [nameFor(`${a.id}-review`, 1)],
    'the two filings queued in the order they were filed, as the orchestrator filed them, one slot: the next pass starts the run in ' +
      "flight's next step, filed later",
  );
  const unweighed = ({ priority: _, ...spec }: typeof next) => spec;
  assert.deepEqual(await admitted(unweighed), [nameFor(`${b.id}-implement`, 1)], 'without it, the newer run, filed first');
});
