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
import { Effect, Metric, References, Tracer } from 'effect';
import { Engine as RuntimeEngine, nameFor, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-timeline-spans-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '10';
process.env.WF_MAX_CONCURRENT = '10';
const { approveRun, cancelRun, retryRun, runWith: runEngine, startRun, tickRun } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
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

/**
 * Attempt `n` of session `taskId`, the first unless given, signed off done, having cost `costUsd`, its closeout carrying `more` beside
 * the four fields, and over them.
 */
const sign = (taskId: string, costUsd: number, more: Record<string, unknown> = {}, n = 1) => {
  const name = nameFor(taskId, n);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    usage: { costUsd, inputTokens: 1200, outputTokens: 300 },
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null, ...more }, at: Date.now() },
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
    await runPlaced(
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
  stand().world.repository(repo, {});
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
/** `build`, checked, then `review`, which sends the work back to `build` while its closeout says `again`. */
const LOOPED = folder('looped', {
  build: '---\nplace: git\ncheck: node -e 0\n---\nBuild it.\n',
  review: '---\nafter: build\nplace: git\noutput: review.schema.json\nloop: build\n---\nReview it.\n',
});
fs.writeFileSync(
  path.join(LOOPED, 'review.schema.json'),
  JSON.stringify({
    type: 'object',
    properties: { findings: { type: 'array', items: { type: 'string' } }, again: { type: 'boolean' } },
    required: ['findings', 'again'],
    additionalProperties: false,
  }),
);
/** One step, with no gate and no check. */
const SOLO = folder('solo', { work: '---\nplace: git\n---\nDo it.\n' });

const MIN = 60_000;
/** The test's clock: `Date` seeded, and moved on by `minutes` at each call of the function it answers. */
const clockOf = (t: TestContext) => {
  let now = Date.parse('2026-10-06T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  return (minutes: number) => t.mock.timers.setTime((now += minutes * MIN));
};

const start = (workflowDir: string) => runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, isolate: false }));

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

test("a loop's second round is handed over with the first: every try's session and check, and each round's wall, as the page has them", async (t) => {
  const later = clockOf(t);
  const run = await start(LOOPED);
  const round = async (minutes: { build: number; check: number; review: number }, again: boolean, replies: Record<string, unknown>) => {
    await tickUntil(() => {
      const build = readRun(run.id).steps.build?.taskId;
      return Boolean(build) && sessions.get(nameFor(build!, 1))?.state === 'working';
    });
    const build = readRun(run.id).steps.build.taskId!;
    later(minutes.build);
    sign(build, 2, replies);
    await tickUntil(() => Boolean(readRun(run.id).steps.build.check));
    const check = readRun(run.id).steps.build.check!.taskId;
    await tickUntil(() => sessions.has(nameFor(check, 1)));
    later(minutes.check);
    exit(check);
    await tickUntil(() => {
      const review = readRun(run.id).steps.review?.taskId;
      return Boolean(review) && sessions.get(nameFor(review!, 1))?.state === 'working';
    });
    later(minutes.review);
    sign(readRun(run.id).steps.review.taskId!, 1, { findings: again ? ['rename it'] : [], again });
    return { build, check };
  };
  const first = await round({ build: 10, check: 4, review: 3 }, true, {});
  await tickUntil(() => (readRun(run.id).steps.build.tries?.length ?? 0) === 1);
  assert.deepEqual(timelineSpans(run.id), [], 'none while the loop goes round');
  const second = await round({ build: 6, check: 5, review: 2 }, false, {
    replies: [{ finding: 'rename it', answer: 'fixed', why: 'renamed' }],
  });
  assert.notEqual(second.build, first.build, 'the second round is a task of its own');
  await tickUntil(() => readRun(run.id).runTimed === true);

  const spans = timelineSpans(run.id);
  assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(run.id)).map(lineOf).sort(), "each span is a row of the page's timeline");
  const of = (row: string, part: string) => spans.filter((s) => s.row === row && s.part === part).map((s) => [s.try, s.value]);
  assert.deepEqual(of('01 build', 'ran'), [
    [1, 10 * MIN],
    [2, 6 * MIN],
  ]);
  assert.deepEqual(
    of('01 build check', 'ran'),
    [
      [1, 4 * MIN],
      [2, 5 * MIN],
    ],
    "the first try's check among them, which no pass's own views hold",
  );
  assert.deepEqual(of('01 build', 'tries'), [[undefined, 2]]);
  assert.deepEqual(of('review round 01', 'wall'), [[undefined, 17 * MIN]]);
  assert.deepEqual(of('review round 02', 'wall'), [[undefined, 13 * MIN]]);
  assert.deepEqual(of('run', 'wall'), [[undefined, 30 * MIN]]);
  assert.deepEqual(of('run', 'check'), [[undefined, 9 * MIN]]);
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

test("a gated step that signed off blocked, was answered and then approved gives its wait on the answer and its gate's, each its own", async (t) => {
  const later = clockOf(t);
  const run = await start(ALONE);
  const intake = `${run.id}-intake`;
  await tick();
  later(1);
  await tickUntil(() => sessions.has(nameFor(intake, 1)));
  later(4);
  sign(intake, 0.5, { outcome: 'blocked', needs: 'which flag: --dry-run or --force?' });
  await tick(3);
  assert.deepEqual(timelineSpans(run.id), [], 'none while it waits on an answer');
  later(6);
  await runWith(engine, retryRun(run.id, 'intake', { mode: 'continue', message: 'the --dry-run flag' }));
  await tickUntil(() => sessions.has(nameFor(intake, 2)));
  assert.equal(readRun(run.id).steps.intake.taskId, intake, 'the answer is a turn of the session that asked');
  later(3);
  sign(intake, 0.25, {}, 2);
  await tick(3);
  assert.deepEqual(readRun(run.id).gatesTimed, [], 'nothing timed while it waits at its gate');
  later(9);
  await runWith(engine, approveRun(run.id, 'intake'));
  await tickUntil(() => readRun(run.id).runTimed === true);
  const spans = timelineSpans(run.id);
  assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(run.id)).map(lineOf).sort(), "each span is a row of the page's timeline");
  const value = (row: string, part: string) => spans.filter((s) => s.row === row && s.part === part).map((s) => s.value);
  assert.deepEqual(
    [value('run', 'answer'), value('run', 'gate'), value('01 intake', 'ran'), value('01 intake', 'tries'), value('run', 'wall')],
    [[6 * MIN], [9 * MIN], [7 * MIN], [2], [14 * MIN]],
    'the minutes the test let pass: the session ran its two turns, and waited between them on the answer',
  );
  assert.deepEqual(readRun(run.id).gatesTimed, [{ step: 'intake', try: 2 }], 'the gate of the try that answered is timed, once');
  await tick(3);
  assert.equal(timelineSpans(run.id).length, spans.length, 'never again on a later pass');
});

test('REFUSED: a gated step sent back from its gate with words waited on no answer, and its gate is timed from the turn it was sent back for', async (t) => {
  const later = clockOf(t);
  const run = await start(ALONE);
  const intake = `${run.id}-intake`;
  await tick();
  later(1);
  await tickUntil(() => sessions.has(nameFor(intake, 1)));
  later(4);
  sign(intake, 0.5);
  await tick(3);
  later(6);
  await runWith(engine, retryRun(run.id, 'intake', { mode: 'continue', message: 'smaller steps, please' }));
  await tickUntil(() => sessions.has(nameFor(intake, 2)));
  const causes = readRun(run.id).steps.intake.tries?.map((x) => x.cause);
  assert.deepEqual(
    [readRun(run.id).steps.intake.taskId, causes],
    [intake, ['continue']],
    'the record an answer to a blocked sign-off leaves, but for what the first turn signed',
  );
  later(3);
  sign(intake, 0.25, {}, 2);
  await tick(3);
  later(9);
  await runWith(engine, approveRun(run.id, 'intake'));
  await tickUntil(() => readRun(run.id).runTimed === true);
  const spans = timelineSpans(run.id);
  assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(run.id)).map(lineOf).sort(), "each span is a row of the page's timeline");
  const value = (row: string, part: string) => spans.filter((s) => s.row === row && s.part === part).map((s) => s.value);
  assert.deepEqual(
    [value('run', 'answer'), value('run', 'gate'), value('01 intake', 'ran'), value('01 intake', 'tries')],
    [[0], [9 * MIN], [7 * MIN], [2]],
    'the six minutes before the send-back were at its gate, unapproved, and are in no part',
  );
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
