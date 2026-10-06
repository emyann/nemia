/**
 * The tick records a step's facts at the one place it sees them (`recordStepMetrics`, after `meteredPass`): a session that settles with a
 * cost is recorded once, on the pass whose read of the feed names it settled (`settledIn`), by the five attributes alone, and never again
 * on a pass that answers the run from its memo of runs at rest.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness signed by hand, ticked by `tickRun` under a
 * registry of the test's own. `WF_ROOT` is set before the runner is imported: it is read as the module loads. `WF_VERIFY_REST=1` judges
 * in full every run a pass answers from its memo, and dies where the two differ.
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

const ROOT = scratch('wf-step-metrics-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '10';
process.env.WF_MAX_CONCURRENT = '10';
const { startRun, tickRun } = await import('../src/runner.ts');
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
/** A harness the test signs by hand: every session it starts works until `sign` ends it. */
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

/** Attempt 1 of `taskId` signed off done, having cost `costUsd` and used 1,200 tokens in and 300 out. */
const sign = (taskId: string, costUsd: number) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    usage: { costUsd, inputTokens: 1200, outputTokens: 300 },
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: Date.now() },
  });
};

const registry = new Map();
const memo = freshRestMemo();
/** One pass of the tick, as the daemon makes it, its metrics in the test's registry. */
const tick = () =>
  Effect.runPromise(
    tickRun({ memo }).pipe(
      Effect.provide(EngineService.layer(engine)),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(References.MinimumLogLevel, 'Warn'),
    ),
  );
/** The series of `id` in the test's registry. */
const series = async (id: string) =>
  (await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)))).filter((m) => m.id === id);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  return repo;
};

/** The workflow folder `metered`: one step, `implement`. */
const WORKFLOW = path.join(ROOT, 'metered');
fs.mkdirSync(WORKFLOW);
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nplace: git\n---\nBuild it.\n');

test("a step that settles with a cost records its cost once, by its factory, workflow, step, agent and outcome, and no run's id", async () => {
  const run = await Effect.runPromise(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  const taskId = `${run.id}-implement`;
  for (let i = 0; i < 4 && !sessions.has(nameFor(taskId, 1)); i++) await tick();
  assert.ok(sessions.has(nameFor(taskId, 1)), 'its session started');
  assert.deepEqual(await series('step.cost'), [], 'nothing recorded before it settles');

  sign(taskId, 1.25);
  for (let i = 0; i < 4; i++) await tick();

  const cost = await series('step.cost');
  assert.equal(cost.length, 1, 'one series');
  assert.equal((cost[0].state as { count: number }).count, 1.25, 'recorded once, over four passes');
  assert.deepEqual(cost[0].attributes, { factory: 'default', workflow: 'metered', step: 'implement', agent: 'none', outcome: 'done' });
  const tries = await series('step.tries');
  assert.deepEqual(
    tries.map((m) => [m.attributes?.outcome, (m.state as { count: number }).count]),
    [['done', 1]],
  );
  assert.equal(((await series('step.tokens.output'))[0].state as { count: number }).count, 300);
  for (const id of ['step.cost', 'step.tries', 'step.duration', 'step.tokens.input'])
    for (const m of await series(id)) assert.ok(!Object.values(m.attributes ?? {}).some((v) => v.includes(run.id)), `${id} names no run`);
});
