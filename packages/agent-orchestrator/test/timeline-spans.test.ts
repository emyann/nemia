/**
 * The tick hands a run's timeline to the traces once the run is over, as spans (`TIMELINE_SPAN`) whose numbers are the ones the run's
 * page reads (`timeline`, `timelineRows`): on the first pass that reads the run succeeded or called off with nothing in flight, marked on
 * the run's `runTimed` in the record that pass writes, so no later pass, and no daemon started again, hands them twice. A run still
 * going, one stopped at its gate, a record with no mark and one already marked give none.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness signed by hand, ticked by `tickRun` under a
 * tracer of the test's own that keeps every span. The clock is the test's (`Date`, seeded and moved by hand), so each time on the
 * timeline is a number of minutes the test chose and no two are alike. `WF_ROOT` is set before the runner is imported: it is read as the
 * module loads. `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo, and dies where the two differ.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect, Metric, References, Tracer } from 'effect';
import { Engine as RuntimeEngine, nameFor, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-timeline-spans-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '10';
process.env.WF_MAX_CONCURRENT = '10';
const { approveRun, cancelRun, runWith, startRun, tickRun } = await import('../src/runner.ts');
const { readRun, rewriteRun, stepsOf } = await import('../src/record/record.store.ts');
const { TIMELINE_SPAN } = await import('../src/meter/meter.verb.ts');
const { EngineService } = await import('../src/runtime-client.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { everyTryOf, taskPhasesRead } = await import('../src/views/views.verb.ts');
const { timeline, timelineRows } = await import('../src/timeline/index.ts');

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

/** Attempt 1 of session `taskId` signed off done, having cost `costUsd`. */
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

/** Attempt 1 of check `taskId` exited 0. */
const exit = (taskId: string) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed', busy: false, exitCode: 0 });
};

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
const registry = new Map();
/** `n` passes of the tick, as the daemon `life` makes them. */
const tick = async (n = 1, life = FIRST) => {
  for (let i = 0; i < n; i++)
    await Effect.runPromise(
      tickRun({ memo: life.memo }).pipe(
        Effect.provide(EngineService.layer(engine)),
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provideService(References.MinimumLogLevel, 'Warn'),
        Effect.withTracer(life.tracer),
      ),
    );
};
/** Ticks until `ready` holds, at most `n` passes. */
const tickUntil = async (ready: () => boolean, n = 6) => {
  for (let i = 0; i < n && !ready(); i++) await tick();
  assert.ok(ready(), 'reached');
};

/** The timeline spans `life` traced for `run`, each as its attributes. */
const timelineSpans = (run: string, life = FIRST): Record<string, unknown>[] =>
  life.spans
    .filter((span) => span.name === TIMELINE_SPAN && span.attributes.get('run') === run)
    .map((span) => Object.fromEntries(span.attributes));

/** One number as a line a person reads: what it is of, its row, which number, its try and its value. */
const lineOf = (r: { of?: unknown; row?: unknown; part?: unknown; try?: unknown; value?: unknown }) =>
  `${String(r.of)} | ${String(r.row)} | ${String(r.part)} | ${String(r.try ?? '-')} | ${String(r.value)}`;

/** The rows of the timeline the run's page reads of `id`, off the same store and engine: every try's view, each filed when it says. */
const pageRows = (id: string) =>
  runWith(
    engine,
    Effect.gen(function* () {
      const run = readRun(id);
      const steps = stepsOf(run);
      const everyTry = yield* everyTryOf(yield* EngineService, run, (yield* taskPhasesRead(run)).views);
      const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
      return timelineRows(run, timeline(run, everyTry, filed, steps), steps);
    }),
  );

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  return repo;
};

/** A workflow folder under the test's root, a file per step. */
const folder = (name: string, steps: Record<string, string>): string => {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir);
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
};

/** `plan`, gated, then `build`, checked. */
const WAITED = folder('waited', {
  plan: '---\nplace: git\ngate: true\n---\nPlan it.\n',
  build: '---\nafter: plan\nplace: git\ncheck: node -e 0\n---\nBuild it.\n',
});
/** One step, gated, that nothing waits on: an intake's shape. */
const ALONE = folder('alone', { intake: '---\nplace: git\ngate: true\n---\nAsk.\n' });
/** One step, with no gate and no check. */
const SOLO = folder('solo', { work: '---\nplace: git\n---\nDo it.\n' });

const MIN = 60_000;
/** The test's clock: `Date` seeded, and moved on by `minutes` at each call of the function it answers. */
const clockOf = (t: TestContext) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-06T10:00:00.000Z') });
  return (minutes: number) => t.mock.timers.setTime(Date.now() + minutes * MIN);
};

const start = (workflowDir: string) => Effect.runPromise(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, isolate: false }));

test("a finished run's timeline spans are its page's timeline, row for row, handed once across passes and a daemon started again", async (t) => {
  const later = clockOf(t);
  const run = await start(WAITED);
  assert.equal(readRun(run.id).runTimed, false, 'started with its timeline not handed over');
  const plan = `${run.id}-plan`;
  await tick();
  later(2);
  await tickUntil(() => sessions.has(nameFor(plan, 1)));
  later(7);
  sign(plan, 1.25);
  await tick(3);
  assert.deepEqual(timelineSpans(run.id), [], 'REFUSED: a run stopped at its gate, waiting on a person');
  later(11);
  await runWith(engine, approveRun(run.id, 'plan'));
  const build = `${run.id}-build`;
  await tickUntil(() => sessions.has(nameFor(build, 1)));
  later(13);
  sign(build, 3);
  await tickUntil(() => Boolean(readRun(run.id).steps.build?.check));
  const check = readRun(run.id).steps.build.check!.taskId;
  later(3);
  await tickUntil(() => sessions.has(nameFor(check, 1)));
  assert.deepEqual(timelineSpans(run.id), [], 'REFUSED: a run still going, its check running');
  assert.equal(readRun(run.id).runTimed, false);
  later(5);
  exit(check);
  await tickUntil(() => readRun(run.id).runTimed === true);

  const spans = timelineSpans(run.id);
  const rows = await pageRows(run.id);
  assert.deepEqual(spans.map(lineOf).sort(), rows.map(lineOf).sort(), "each span is a row of the page's timeline, and each row a span");
  const value = (row: string, part: string) => spans.find((s) => s.row === row && s.part === part)?.value;
  assert.deepEqual(
    [
      value('01 plan', 'queued'),
      value('01 plan', 'ran'),
      value('01 plan', 'cost'),
      value('02 build', 'ran'),
      value('02 build check', 'ran'),
      value('run', 'gate'),
    ],
    [2 * MIN, 7 * MIN, 1.25, 13 * MIN, 5 * MIN, 11 * MIN],
    'the minutes the test let pass',
  );
  assert.deepEqual([value('run', 'wall'), value('run', 'check'), value('01 plan', 'tries')], [41 * MIN, 5 * MIN, 1]);
  const labels = { factory: 'default', workflow: 'waited', outcome: 'succeeded' };
  assert.deepEqual(
    spans.find((s) => s.row === '02 build check' && s.part === 'ran'),
    { run: run.id, try: 1, of: 'check', row: '02 build check', part: 'ran', value: 5 * MIN, ...labels, step: 'build', agent: 'none' },
  );
  assert.deepEqual(
    spans.find((s) => s.row === 'run' && s.part === 'wall'),
    { run: run.id, of: 'run', row: 'run', part: 'wall', value: 41 * MIN, ...labels },
    "the run's row is no step's and no try's",
  );

  const handed = spans.length;
  later(30);
  await tick(3);
  assert.equal(timelineSpans(run.id).length, handed, 'never again on a later pass');
  const again = daemon();
  await tick(3, again);
  assert.ok(again.spans.length > 0, 'the daemon started again made its passes');
  assert.deepEqual(timelineSpans(run.id, again), [], 'REFUSED: a daemon started again reads the run timed on its record');
});

test('a one-step gated run held open then approved, as an intake is, gives its queue, its session, its tries and its gate', async (t) => {
  const later = clockOf(t);
  const run = await start(ALONE);
  const intake = `${run.id}-intake`;
  await tick();
  later(1);
  await tickUntil(() => sessions.has(nameFor(intake, 1)));
  later(4);
  sign(intake, 0.5);
  await tick(3);
  assert.deepEqual(timelineSpans(run.id), [], 'none while it waits at its gate');
  later(9);
  await runWith(engine, approveRun(run.id, 'intake'));
  await tickUntil(() => readRun(run.id).runTimed === true);
  const spans = timelineSpans(run.id);
  assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(run.id)).map(lineOf).sort());
  assert.deepEqual(
    spans.filter((s) => s.row === '01 intake').map((s) => [s.of, s.part, s.value]),
    [
      ['try', 'queued', 1 * MIN],
      ['try', 'ran', 4 * MIN],
      ['try', 'cost', 0.5],
      ['step', 'tries', 1],
    ],
  );
  assert.equal(spans.find((s) => s.row === 'run' && s.part === 'gate')?.value, 9 * MIN);
});

test('a run called off is handed over once its tasks have stopped, as cancelled', async (t) => {
  const later = clockOf(t);
  const run = await start(SOLO);
  const work = `${run.id}-work`;
  later(2);
  await tickUntil(() => sessions.has(nameFor(work, 1)));
  later(6);
  await runWith(engine, cancelRun(run.id));
  await tickUntil(() => readRun(run.id).runTimed === true);
  const spans = timelineSpans(run.id);
  assert.ok(spans.length > 0, 'its rows');
  assert.deepEqual([...new Set(spans.map((s) => s.outcome))], ['cancelled']);
  assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(run.id)).map(lineOf).sort());
  await tick(3);
  assert.equal(timelineSpans(run.id).length, spans.length, 'once');
});

test('REFUSED: a record with no runTimed, written before the tick timed runs, and one already timed give no span', async () => {
  const older = await start(SOLO);
  const { runTimed: _mark, ...unmarked } = readRun(older.id);
  rewriteRun(unmarked);
  const timed = await start(SOLO);
  rewriteRun({ ...readRun(timed.id), runTimed: true });
  for (const run of [older, timed]) {
    const work = `${run.id}-work`;
    await tickUntil(() => sessions.has(nameFor(work, 1)));
    sign(work, 1);
  }
  await tick(4);
  assert.deepEqual(timelineSpans(older.id), []);
  assert.deepEqual(timelineSpans(timed.id), []);
  assert.equal(readRun(older.id).runTimed, undefined, 'no mark is made on a record that had none');
});
