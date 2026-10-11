/**
 * The tick records each wait of a run's steps once, off its records alone, across a restart: a session's queue and a check's run on the
 * pass whose read of the feed names the task settled, which a restarted tick reads from the feed's end and so never again; a gate's wait
 * on the pass that first reads its approval, marked on the run's `gatesTimed` in the record that pass writes, so a restarted tick reads it
 * timed.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness signed by hand, ticked by `tickRun` under a
 * registry of the test's own; a restart is a fresh memo of runs at rest (`freshRestMemo`), whose first pass reads the feed from its end:
 * a task the runtime settles on that very pass is recorded nowhere, the loss the tick takes rather than a double, so each restart here
 * makes its first pass before the work moves on. `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 * `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo, and dies where the two differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect, Metric, References } from 'effect';
import { Engine as RuntimeEngine, nameFor, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-wait-metrics-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '10';
process.env.WF_MAX_CONCURRENT = '10';
const { approveRun, runWith: runEngine, gitPlaceLayer, startRun, tickRun } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { EngineService } = await import('../src/runtime-client.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');

type Event = Parameters<AsyncJournal['append']>[1];

/** The engine's store, in memory, with its feed. */
const journal = ((): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
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
})();

const sessions = new Map<string, Sighting>();
/** A harness the test signs by hand: every session it starts works until `sign` or `exit` ends it. */
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `native-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop(id) {
    for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
  },
  async logs() {
    return '';
  },
};
const engine = plainEngine(
  RuntimeEngine.layer({
    root: path.join(ROOT, 'engine'),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

/** Attempt 1 of session `taskId` signed off done. */
const sign = (taskId: string) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: Date.now() },
  });
};

/** Attempt 1 of check `taskId` exited 0. */
const exit = (taskId: string) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed', busy: false, exitCode: 0 });
};

const registry = new Map();
let memo = freshRestMemo();
/** A restart of the tick: its memo of runs at rest, and of where it read the feed to, forgotten. */
const restart = () => {
  memo = freshRestMemo();
};
/** A restart while work is in flight: its first pass reads the feed from its end, before the work moves on. */
const restarted = async () => {
  restart();
  await tick();
};
/** `n` passes of the tick, as the daemon makes them, its metrics in the test's registry. */
const tick = async (n = 1) => {
  for (let i = 0; i < n; i++)
    await runPlaced(
      tickRun({ memo }).pipe(
        Effect.provide(EngineService.layer(engine)),
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provideService(References.MinimumLogLevel, 'Warn'),
      ),
    );
};
/** How many waits histogram `id` counted, over every series. */
const counted = async (id: string) =>
  (await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))))
    .filter((m) => m.id === id)
    .reduce((n, m) => n + (m.state as { count: number }).count, 0);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  return repo;
};

/** The workflow folder `waited`: `plan`, gated, then `build`, checked. */
const WORKFLOW = path.join(ROOT, 'waited');
fs.mkdirSync(WORKFLOW);
fs.writeFileSync(path.join(WORKFLOW, 'plan.md'), '---\nplace: git\ngate: true\n---\nPlan it.\n');
fs.writeFileSync(path.join(WORKFLOW, 'build.md'), '---\nafter: plan\nplace: git\ncheck: node -e 0\n---\nBuild it.\n');

/** Ticks until `ready` holds, at most `n` passes. */
const tickUntil = async (ready: () => boolean, n = 6) => {
  for (let i = 0; i < n && !ready(); i++) await tick();
  assert.ok(ready(), 'reached');
};

test("a session's queue, a check's run and a gate's wait are each recorded once, across restarts of the tick", async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  assert.deepEqual(readRun(run.id).gatesTimed, [], 'started with no gate timed');
  const plan = `${run.id}-plan`;
  await tickUntil(() => sessions.has(nameFor(plan, 1)));
  assert.equal(await counted('step.queue.duration'), 0, 'no queue recorded before its session settles');

  await restarted();
  sign(plan);
  await tick(3);
  assert.equal(await counted('step.queue.duration'), 0, 'a session held open at its gate has not settled');
  assert.equal(await counted('step.gate.wait'), 0, 'no gate wait before its approval');

  await runWith(engine, approveRun(run.id, 'plan'));
  await tick(2);
  assert.equal(await counted('step.gate.wait'), 1, "plan's gate, once its approval is read");
  assert.equal(await counted('step.queue.duration'), 1, "plan's queue, once it settles, though the tick restarted after its filing");
  assert.deepEqual(readRun(run.id).gatesTimed, [{ step: 'plan', try: 1 }], 'marked timed on the record');
  restart();
  await tick(2);
  assert.equal(await counted('step.gate.wait'), 1, 'never again after a restart: the record says it is timed');
  assert.equal(await counted('step.queue.duration'), 1, 'never again after a restart: the feed is read from its end');

  const build = `${run.id}-build`;
  await tickUntil(() => sessions.has(nameFor(build, 1)));
  await restarted();
  sign(build);
  await tickUntil(() => Boolean(readRun(run.id).steps.build?.check));
  const check = readRun(run.id).steps.build.check!.taskId;
  await tickUntil(() => sessions.has(nameFor(check, 1)));
  await restarted();
  exit(check);
  await tick(3);
  assert.equal(await counted('step.check.duration'), 1, "build's check, once");
  assert.equal(await counted('step.queue.duration'), 2, "build's queue too, and plan's not again");
  restart();
  await tick(2);
  assert.equal(await counted('step.check.duration'), 1, 'never again after a restart');
  assert.equal(await counted('step.queue.duration'), 2);
  assert.equal(await counted('step.gate.wait'), 1);
});

/** The workflow folder `alone`: one step, gated, that nothing waits on. */
const ALONE = path.join(ROOT, 'alone');
fs.mkdirSync(ALONE);
fs.writeFileSync(path.join(ALONE, 'plan.md'), '---\nplace: git\ngate: true\n---\nPlan it.\n');

test('a gate approved with nothing after it, on passes that file nothing, is recorded once and marked on disk', async () => {
  const before = await counted('step.gate.wait');
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: ALONE, isolate: false }));
  const plan = `${run.id}-plan`;
  await tickUntil(() => sessions.has(nameFor(plan, 1)));
  sign(plan);
  await tick(3);
  await runWith(engine, approveRun(run.id, 'plan'));
  await tick(4);
  assert.equal(await counted('step.gate.wait'), before + 1, "plan's gate, once over every pass");
  assert.deepEqual(readRun(run.id).gatesTimed, [{ step: 'plan', try: 1 }], 'marked timed on disk');
});
