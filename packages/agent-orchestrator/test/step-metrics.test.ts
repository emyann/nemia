/**
 * The tick records a step's facts at the one place it sees them (`recordStepMetrics`, after `meteredPass`): a session that settles with a
 * cost is recorded once, on the first pass that reads it settled and does not find it in the run's own mark (`settlesCounted`), by the
 * five attributes alone, and never again: neither on a pass that answers the run from its memo of runs at rest, nor by a daemon started
 * again, which counts the settle its first pass makes and none a daemon before it counted. A session held open and answered is one try.
 * A record with no mark is counted on the pass whose read of the feed names its task settled (`settledIn`). And each call a harness
 * denied a session is a span of its own (`DENIED_SPAN`) on the pass that reads its attempt ended, whatever the turn signed, counted once
 * by the run's own mark (`deniedCounted`): a daemon started again, with no memo, records none twice.
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
import { Effect, Metric, References, Tracer } from 'effect';
import { Engine as RuntimeEngine, nameFor, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-step-metrics-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '10';
process.env.WF_MAX_CONCURRENT = '10';
const { retryRun, runWith, startRun, tickRun } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { DENIED_SPAN } = await import('../src/meter/meter.verb.ts');
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

/** Attempt `n` of `taskId`, the first unless said, signed off done, having cost `costUsd` and used 1,200 tokens in and 300 out. */
const sign = (taskId: string, costUsd: number, n = 1) => {
  const name = nameFor(taskId, n);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    usage: { costUsd, inputTokens: 1200, outputTokens: 300 },
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: Date.now() },
  });
};

const registry = new Map();
/** A daemon's life: its memo of runs at rest, and the spans its passes leave, kept by a tracer of the test's own. */
const daemon = () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { memo: freshRestMemo(), spans, tracer };
};
const FIRST = daemon();
/** One pass of the tick, as the daemon `life` makes it, its metrics in the test's registry. */
const tick = (life = FIRST) =>
  Effect.runPromise(
    tickRun({ memo: life.memo }).pipe(
      Effect.provide(EngineService.layer(engine)),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(References.MinimumLogLevel, 'Warn'),
      Effect.withTracer(life.tracer),
    ),
  );
/** The denied calls `life` traced for `run`, each as its span's attributes. */
const deniedSpans = (life: ReturnType<typeof daemon>, run: string) =>
  life.spans
    .filter((span) => span.name === DENIED_SPAN && span.attributes.get('run') === run)
    .map((span) => Object.fromEntries(span.attributes));
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

/** Attempt `n` of `taskId` signed off as `outcome`, its harness having denied it `denials`. */
const signDenied = (taskId: string, n: number, outcome: 'done' | 'blocked', denials: NonNullable<Sighting['denials']>) => {
  const name = nameFor(taskId, n);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    denials,
    closeout: { payload: { outcome, summary: 'said', artifacts: [], needs: outcome === 'blocked' ? 'which flag?' : null }, at: Date.now() },
  });
};

/** A run of `metered` whose step was denied `Glob` and signed off blocked, read by passes of the first daemon. */
const blockedRun = async () => {
  const run = await Effect.runPromise(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  const taskId = `${run.id}-implement`;
  assert.deepEqual(readRun(run.id).deniedCounted, [], 'a run just started has counted none');
  for (let i = 0; i < 4 && !sessions.has(nameFor(taskId, 1)); i++) await tick();
  assert.ok(sessions.has(nameFor(taskId, 1)), 'its session started');
  signDenied(taskId, 1, 'blocked', [{ tool: 'Glob' }]);
  for (let i = 0; i < 3; i++) await tick();
  return { run, taskId };
};

const LABELS = { factory: 'default', workflow: 'metered', step: 'implement', agent: 'none' };

test('a call denied in a try that ends blocked is counted once, with its tool, its run and its session', async () => {
  const { run, taskId } = await blockedRun();
  assert.deepEqual(deniedSpans(FIRST, run.id), [{ run: run.id, task: taskId, tool: 'Glob', call: 'Glob', ...LABELS }]);
  assert.deepEqual(readRun(run.id).deniedCounted, [{ task: taskId, attempts: 1 }]);
  assert.deepEqual(await series('step.denied'), [], 'no counter beside the span');
});

test("the next turn's denials count on top, a call denied twice is two, and a daemon started again records none twice", async () => {
  const { run, taskId } = await blockedRun();
  await runWith(engine, retryRun(run.id, 'implement', { mode: 'nudge', message: 'the --dry-run flag' }));
  for (let i = 0; i < 4 && !sessions.has(nameFor(taskId, 2)); i++) await tick();
  assert.ok(sessions.has(nameFor(taskId, 2)), 'the answer is the same task, in its next attempt');
  signDenied(taskId, 2, 'done', [
    { tool: 'Skill', what: 'look' },
    { tool: 'Skill', what: 'look' },
  ]);
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(
    deniedSpans(FIRST, run.id).map((span) => [span.tool, span.call, span.task]),
    [
      ['Glob', 'Glob', taskId],
      ['Skill', 'Skill(look)', taskId],
      ['Skill', 'Skill(look)', taskId],
    ],
  );
  assert.deepEqual(readRun(run.id).deniedCounted, [{ task: taskId, attempts: 2 }]);

  const restarted = daemon();
  for (let i = 0; i < 3; i++) await tick(restarted);
  assert.ok(restarted.spans.length > 0, 'the daemon started again made its passes');
  assert.deepEqual(deniedSpans(restarted, run.id), [], 'REFUSED: nothing counted again');
});

/** A workflow folder `name` of one step, `implement`, whose series are its own in the registry the file shares. */
const workflowOf = (name: string): string => {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nBuild it.\n');
  return dir;
};

/** A run of the workflow `name`, started and ticked by `life` until its session works. */
const working = async (name: string, life = FIRST) => {
  const run = await Effect.runPromise(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: workflowOf(name), isolate: false }));
  const taskId = `${run.id}-implement`;
  for (let i = 0; i < 4 && !sessions.has(nameFor(taskId, 1)); i++) await tick(life);
  assert.ok(sessions.has(nameFor(taskId, 1)), 'its session started');
  return { run, taskId };
};

/**
 * Passes of the daemon `life` until its tick has closed `taskId`, signed and held open, and no pass after: the runtime settles a closed
 * task on its next pass, which is then the first pass of whichever daemon is started next, whose memo reads the feed from its end.
 */
const closedUnsettled = async (taskId: string, life = FIRST) => {
  const state = async () => (await Effect.runPromise(engine.view(taskId))).state;
  for (let i = 0; i < 4 && !(await state()).closed; i++) await tick(life);
  assert.deepEqual([(await state()).closed, (await state()).settled], [true, null], 'closed by the tick, not settled yet');
};

/** Each series of `id` the workflow `name` has in the registry, as its outcome and its count. */
const counted = async (id: string, name: string) =>
  (await series(id))
    .filter((m) => m.attributes?.workflow === name)
    .map((m) => [m.attributes?.outcome, (m.state as { count: number }).count]);

test('a session that settles on the first pass of a daemon started again is counted once by it, and by no daemon after it', async () => {
  const { run, taskId } = await working('restarted');
  assert.deepEqual(readRun(run.id).settlesCounted, [], 'a run just started has counted no settle');
  sign(taskId, 2.5);
  await closedUnsettled(taskId);

  const second = daemon();
  for (let i = 0; i < 4; i++) await tick(second);
  assert.deepEqual(await counted('step.cost', 'restarted'), [['done', 2.5]], 'its cost, though no daemon read its settle off the feed');
  assert.deepEqual(await counted('step.tries', 'restarted'), [['done', 1]]);
  assert.deepEqual(await counted('step.tokens.input', 'restarted'), [['done', 1200]]);
  assert.deepEqual(readRun(run.id).settlesCounted, [taskId]);

  const third = daemon();
  for (let i = 0; i < 3; i++) await tick(third);
  assert.ok(third.spans.length > 0, 'the daemon started again made its passes');
  assert.deepEqual(await counted('step.cost', 'restarted'), [['done', 2.5]], 'REFUSED: nothing counted again');
  assert.deepEqual(await counted('step.tries', 'restarted'), [['done', 1]], 'REFUSED: no try counted again');
  assert.deepEqual(readRun(run.id).settlesCounted, [taskId], 'the task is marked once');
});

test('a blocked try answered in its session and signed done is one try, with its cost once', async () => {
  const { run, taskId } = await working('answered');
  signDenied(taskId, 1, 'blocked', []);
  for (let i = 0; i < 3; i++) await tick();
  assert.deepEqual(await counted('step.tries', 'answered'), [], 'held open for a word, not settled');
  await runWith(engine, retryRun(run.id, 'implement', { mode: 'nudge', message: 'the --dry-run flag' }));
  for (let i = 0; i < 4 && !sessions.has(nameFor(taskId, 2)); i++) await tick();
  assert.ok(sessions.has(nameFor(taskId, 2)), 'the answer is the same task, in its next attempt');
  sign(taskId, 0.75, 2);
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(await counted('step.tries', 'answered'), [['done', 1]]);
  assert.deepEqual(await counted('step.cost', 'answered'), [['done', 0.75]]);
  assert.deepEqual(readRun(run.id).settlesCounted, [taskId]);
});

test('a record with no settlesCounted, started before the mark, is counted off the feed once, and never by a daemon started again', async () => {
  const { run, taskId } = await working('unmarked');
  const file = path.join(ROOT, 'runs', `${run.id}.json`);
  const { settlesCounted: _, ...before } = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(file, JSON.stringify(before));
  sign(taskId, 1.5);
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(await counted('step.cost', 'unmarked'), [['done', 1.5]]);
  assert.equal(readRun(run.id).settlesCounted, undefined, 'no mark is made for it');

  const restarted = daemon();
  for (let i = 0; i < 3; i++) await tick(restarted);
  assert.deepEqual(await counted('step.cost', 'unmarked'), [['done', 1.5]], 'REFUSED: an old record is never counted again');
  assert.deepEqual(await counted('step.tries', 'unmarked'), [['done', 1]]);
});
