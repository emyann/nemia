/**
 * A measured run, end to end, told as one story on the stage (`story.ts`): a run of `plan` (gated) → `implement` (checked, `retries: 1`)
 * → `review` (looping back to implement, its findings tallied) → `ship` (the landing, gated, checked), walked by the store's tick
 * (`tickRun`) on the engine's stand-in, a daemon restarted once on the way. Its plan signs off blocked and is answered in its session,
 * then approved; implement's first try's check refuses and its second passes; review sends the work round once; ship is approved, merged
 * and lands on its check. What it is measured by, each read off the same walk: the steps' metrics, each recorded once whatever daemon
 * reads the settle (`recordStepMetrics`, `settledOnce`, `onceFacts`); the run's timeline handed to the traces as spans, row for row the
 * rows its page reads (`timelineFacts`, `timelineRows`); its clock's parts adding up to its wall (`clockOf`); `nemia stats --json`; the
 * spans of a pass nested under it, and the wait, denied and timeline spans roots of their own; and the series rolled to minutes and hours.
 * K17's one end-to-end check of a gate's wait is here: the metric, the stats and the timeline agree on plan's wait from the end of the
 * answer's turn. Each function's inputs are tables beside it: `src/meter/step.test.ts`, `src/timeline/*.test.ts`.
 *
 * Plan's blocked turn is answered on the stand-in's own `answer`, which the runtime's walks hold to the real engine's
 * (`agent-runtime/test/engine-walks.ts`): the answer is the task's input, and the settle after it begins its turn, attempt 2 of the same
 * task carrying `turn: 1`. The engine's own pass does nothing (`QUIET`), every task read off the stand-in. The wall is `Date`, mocked
 * and moved by hand (a wall decision keeps its now on `Date`): each time on the timeline is a number of minutes the story chose.
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads; `WF_VERIFY_REST=1` judges every run a pass answers from
 * its memo in full.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Metric, Option, References, Tracer } from 'effect';
import type { Stats } from '../src/stats/stats.ts';
import { scratch } from './scratch.ts';
import { staged, story, type Board } from './story.ts';

const ROOT = scratch('wf-measured-run-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { approveRun, cancelRun, retryRun, startRun, tickRun, runWith } = await import('../src/runner.ts');
const { readRun, rewriteRun, stepsOf } = await import('../src/record/record.store.ts');
const { DENIED_SPAN, TIMELINE_SPAN, WAIT_SPANS } = await import('../src/meter/meter.verb.ts');
const { stepAttributes } = await import('../src/meter/step.ts');
const { EngineService, engineOf } = await import('../src/runtime-client.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { everyTryOf, taskPhasesRead } = await import('../src/views/views.verb.ts');
const { clockOf, gateWaitOf, timeline, timelineRows } = await import('../src/timeline/index.ts');
const { readDay } = await import('../src/series/series.store.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const MIN = 60_000;
const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag: --dry-run or --force?' };
/** What a session's attempt used: a cost in USD, 1,200 tokens in and 300 out. */
const used = (costUsd: number) => ({ costUsd, inputTokens: 1200, outputTokens: 300 });
/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** A workflow folder of `files`, each a step's file by its name, or a schema beside them. */
const folder = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

/** `plan` (gated) → `implement` (checked, one retry) → `review` (looping, its findings tallied) → `ship` (gated, the landing, checked). */
const MEASURED = {
  'plan.md': '---\nplace: git\ngate: true\n---\nPlan it.\n',
  'implement.md': '---\nafter: plan\nplace: git\ncheck: npm test\nretries: 1\n---\nBuild it.\n',
  'review.md': '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\ntally: findings\n---\nReview it.\n',
  'review.schema.json': JSON.stringify({
    type: 'object',
    properties: { findings: { type: 'array', items: { type: 'string' } }, again: { type: 'boolean' } },
    required: ['findings', 'again'],
    additionalProperties: false,
  }),
  'ship.md':
    '---\nafter: review\nplace: git\nworkspace: base\ngate: true\ncheck: npm test\n---\nStage the merge, and sign off with its message.\n',
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
type Daemon = ReturnType<typeof daemon>;

/** The stage's engine as a whole-store pass asks it: a pass of its own that does nothing, and no tally. */
const ticking = (): Board => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return b;
};

/** The names of `span`'s ancestors, its parent first. */
const ancestorsOf = (span: Tracer.Span): string[] => {
  const names: string[] = [];
  let at: Tracer.AnySpan | undefined = Option.getOrUndefined(span.parent);
  while (at?._tag === 'Span') {
    names.push(at.name);
    at = Option.getOrUndefined(at.parent);
  }
  return names;
};

/** One number as a line a person reads: what it is of, its row, which number, its try and its value. */
const lineOf = (r: { of?: unknown; row?: unknown; part?: unknown; try?: unknown; value?: unknown }) =>
  `${String(r.of)} | ${String(r.row)} | ${String(r.part)} | ${String(r.try ?? '-')} | ${String(r.value)}`;

/** The rows of the timeline the run's page reads of `id`, off the store and the stage's engine: every try's view, filed when it says. */
const pageRows = (id: string) =>
  stage.runWith(
    stage.board().e,
    Effect.gen(function* () {
      const run = readRun(id);
      const steps = stepsOf(run);
      const everyTry = yield* everyTryOf(yield* EngineService, run, (yield* taskPhasesRead(run)).views);
      const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
      return timelineRows(run, timeline(run, everyTry, filed, steps), steps);
    }),
  );

/**
 * What a story measures by, new for each: the wall at 10:00 on the fixtures' day, moved on by `later`; the stage's engine as a whole-store
 * pass asks it (`ticking`); a registry of its own for the metrics; and its daemons, the first first, `life` the one making the passes now.
 */
const measuring = (t: TestContext) => {
  let now = Date.parse('2026-10-06T10:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const later = (minutes: number) => t.mock.timers.setTime((now += minutes * MIN));
  const b = ticking();
  const registry = new Map();
  const lives: Daemon[] = [daemon()];
  const life = () => lives.at(-1)!;
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++)
      await stage.runWith(
        b.e,
        tickRun({ memo: life().memo }).pipe(
          Effect.provideService(Metric.MetricRegistry, registry),
          Effect.provideService(References.MinimumLogLevel, 'Error'),
          Effect.withTracer(life().tracer),
        ),
      );
  };
  const spansOf = (name: string, id: string, of: readonly Daemon[] = lives) =>
    of
      .flatMap((l) => l.spans.filter((span) => span.name === name && span.attributes.get('run') === id))
      .map((span) => Object.fromEntries(span.attributes));
  const snapshot = () => Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  const counted = async (id: string) =>
    (await snapshot())
      .filter((m) => m.id === id)
      .map((m) => [m.attributes?.step, m.attributes?.outcome, (m.state as { count: number }).count])
      .sort((x, y) => String(x).localeCompare(String(y)));
  const summed = async (id: string, step: string) =>
    (await snapshot()).filter((m) => m.id === id && m.attributes?.step === step).reduce((n, m) => n + (m.state as { sum: number }).sum, 0);
  const spawn = (task: string) => b.settle(task, 'working');
  const sign = (task: string, closeout: object, more: object = {}) => b.end(task, 'succeeded', { closeout, usage: used(1), ...more });
  const exits = (task: string, code: number) => b.end(task, code === 0 ? 'succeeded' : 'failed', { exitCode: code });

  return { b, later, lives, life, tick, spansOf, snapshot, counted, summed, spawn, sign, exits };
};

test('A measured run, end to end: a gate answered, two tries with checks, a loop round twice and a landing, measured once across a restart', async (t) => {
  const s = story(t);
  const { b, later, lives, life, tick, spansOf, snapshot, counted, summed, spawn, sign, exits } = measuring(t);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'add.ts': 'export const add = (a, b) => a + b;\n' });
  const workflowDir = folder(MEASURED);
  const { id } = await stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir }));
  const steps = () => readRun(id).steps;
  const plan = `${id}-plan`;
  const labelled = (step: string) => ({ run: id, factory: 'default', workflow: path.basename(workflowDir), step, agent: 'none' });
  const commit = (line: string) => {
    fs.appendFileSync(path.join(steps().implement.workspace!, 'add.ts'), `${line}\n`);
    stage.place().world.commit(steps().implement.workspace!, line);
  };
  const implementTasks: string[] = [];

  await s.test(
    'plan is filed with its labels, waits 2 minutes for a slot, runs 5 and signs off blocked: nothing is timed or counted yet',
    async () => {
      await tick();
      assert.deepEqual(b.tasks.get(plan)!.spec.labels, labelled('plan'), 'a ready step');
      const { outcome: _, ...keys } = stepAttributes(
        readRun(id),
        readRun(id).workflow!.find((x) => x.name === 'plan')!,
        'done',
      );
      assert.deepEqual({ run: id, ...keys }, labelled('plan'), 'the keys its metrics are kept by, the same');
      later(2);
      spawn(plan);
      later(5);
      b.end(plan, 'input-required', { closeout: BLOCKED, usage: used(0.5) });
      await tick(2);
      assert.deepEqual(
        [readRun(id).settlesCounted, readRun(id).gatesTimed, readRun(id).runTimed],
        [[], [], false],
        'started with its marks',
      );
      assert.deepEqual(await counted('step.tries'), [], 'held open for a word, not settled');
      assert.deepEqual(await counted('step.queue.duration'), []);
    },
  );

  await s.test(
    'answered 6 minutes later in its session, its turn runs 3 and signs done: at its gate, no gate wait before the approval',
    async () => {
      later(6);
      await stage.runWith(b.e, retryRun(id, 'plan', { mode: 'continue', message: 'the --dry-run flag' }));
      await tick();
      assert.deepEqual(steps().plan.tries, [{ taskId: plan, cause: 'continue' }], 'the answer is a turn of the session that asked');
      spawn(plan);
      later(3);
      sign(plan, SIGNED, { usage: used(0.25) });
      await tick(2);
      assert.deepEqual(await counted('step.gate.wait'), []);
      assert.deepEqual(spansOf(TIMELINE_SPAN, id), [], 'REFUSED: a run stopped at its gate, waiting on a person');
      assert.deepEqual(await counted('step.tries'), [['plan', 'done', 1]], 'a blocked try answered and signed done is one try');
      assert.deepEqual(await counted('step.cost'), [['plan', 'done', 0.75]], 'its cost once, both turns');
    },
  );

  await s.test("approved 9 minutes on: its gate's wait is timed once from the answer's end, and implement is filed", async () => {
    later(9);
    await stage.runWith(b.e, approveRun(id, 'plan'));
    await tick();
    assert.deepEqual(readRun(id).gatesTimed, [{ step: 'plan', try: 2 }], 'the gate of the try that answered, marked on the record');
    assert.deepEqual(await counted('step.gate.wait'), [['plan', 'approved', 1]]);
    assert.equal(await summed('step.gate.wait', 'plan'), 9 * MIN, "from the answer's end, never the first turn's");
    const [gate] = spansOf(WAIT_SPANS.gate, id);
    assert.deepEqual([gate?.try, gate?.step], [2, 'plan'], 'a span with its run and its try');
    implementTasks.push(steps().implement.taskId!);
  });

  await s.test(
    "implement's first try is denied a call, signs, and a daemon started again reads its settle: counted once, by five attributes",
    async () => {
      const [first] = implementTasks;
      later(1);
      spawn(first);
      later(10);
      commit('export const sub = (a, b) => a - b;');
      sign(first, SIGNED, { usage: used(2), denials: [{ tool: 'Glob' }], skills: ['look'] });
      lives.push(daemon());
      await tick();
      assert.ok(life().spans.length > 0, 'the daemon started again made its pass');
      assert.deepEqual(await counted('step.cost'), [
        ['implement', 'done', 2],
        ['plan', 'done', 0.75],
      ]);
      const [cost] = (await snapshot()).filter((m) => m.id === 'step.cost' && m.attributes?.step === 'implement');
      assert.deepEqual(cost?.attributes, {
        factory: 'default',
        workflow: path.basename(workflowDir),
        step: 'implement',
        agent: 'none',
        outcome: 'done',
      });
      assert.deepEqual(
        await counted('step.gate.wait'),
        [['plan', 'approved', 1]],
        'REFUSED: the gate is not timed again by a daemon started again',
      );
      assert.deepEqual(
        spansOf(DENIED_SPAN, id).map((x) => [x.tool, x.call, x.task]),
        [['Glob', 'Glob', first]],
        'the call denied, a span of its own with its run and its session',
      );
      assert.deepEqual(await counted('step.denied'), [], 'no counter beside the span');
    },
  );

  await s.test(
    'its check refuses, try 2 is filed by `retries: 1` with its labels, is denied a call twice and passes its check',
    async () => {
      const check1 = steps().implement.check!.taskId;
      later(1);
      spawn(check1);
      later(2);
      exits(check1, 1);
      await tick();
      const second = steps().implement.taskId!;
      implementTasks.push(second);
      assert.notEqual(second, implementTasks[0], 'the try is filed');
      assert.deepEqual(b.tasks.get(second)!.spec.labels, labelled('implement'), 'a try');
      later(1);
      spawn(second);
      later(5);
      const look = { tool: 'Skill', what: 'look' };
      sign(second, SIGNED, { usage: used(1.5), denials: [look, look], skills: [] });
      await tick();
      const check2 = steps().implement.check!.taskId;
      later(1);
      spawn(check2);
      later(2);
      exits(check2, 0);
      await tick();
      assert.deepEqual(
        spansOf(DENIED_SPAN, id).map((x) => x.call),
        ['Glob', 'Skill(look)', 'Skill(look)'],
        'a call denied twice is two',
      );
      assert.deepEqual(await counted('step.checks'), [
        ['implement', 'passed', 1],
        ['implement', 'refused', 1],
      ]);
    },
  );

  await s.test('review sends the work round once: a round granted, filed with its labels, and the second round accepted', async () => {
    const review = steps().review.taskId!;
    later(1);
    spawn(review);
    later(3);
    sign(review, { ...SIGNED, findings: ['rename it'], again: true }, { usage: used(0.75) });
    await tick();
    const round = steps().implement.taskId!;
    implementTasks.push(round);
    assert.deepEqual(b.tasks.get(round)!.spec.labels, labelled('implement'), 'a round');
    assert.deepEqual(await counted('step.rounds'), [['review', 'granted', 1]]);
    later(1);
    spawn(round);
    later(4);
    commit('// renamed');
    sign(round, { ...SIGNED, replies: [{ finding: 'rename it', answer: 'fixed', why: 'renamed' }] });
    await tick();
    const check3 = steps().implement.check!.taskId;
    later(1);
    spawn(check3);
    later(2);
    exits(check3, 0);
    await tick();
    const second = steps().review.taskId!;
    assert.notEqual(second, review, 'the second round is a task of its own');
    later(1);
    spawn(second);
    later(2);
    sign(second, { ...SIGNED, findings: [], again: false }, { usage: used(0.5) });
    await tick(2);
    assert.deepEqual(spansOf(TIMELINE_SPAN, id), [], 'none while the run waits at its ending');
  });

  await s.test(
    'ship approved 7 minutes on, merges and lands on its check: the timeline is handed over once, row for row the page',
    async () => {
      later(7);
      await stage.runWith(b.e, approveRun(id, 'ship', 'Merge it.'));
      await tick();
      const ship = steps().ship.taskId!;
      later(1);
      spawn(ship);
      stage.place().world.stage(repo, steps().implement.branch!);
      later(2);
      sign(ship, { ...SIGNED, message: 'Add sub\n\nadd.ts exports sub.\n' }, { usage: used(0.25) });
      await tick();
      const check = steps().ship.check!.taskId;
      later(1);
      spawn(check);
      later(1);
      exits(check, 0);
      await tick(2);
      assert.ok('commit' in readRun(id).steps.ship.landed!, 'it landed');
      assert.equal(readRun(id).runTimed, true, 'marked handed over on its record');
      const spans = spansOf(TIMELINE_SPAN, id);
      const rows = await pageRows(id);
      assert.deepEqual(spans.map(lineOf).sort(), rows.map(lineOf).sort(), "each span is a row of the page's timeline, and each row a span");
      const value = (row: string, part: string) =>
        spans.filter((x) => x.row === row && x.part === part).map((x) => [x.try ?? '-', x.value]);
      assert.deepEqual(
        [value('01 plan', 'queued'), value('01 plan', 'ran'), value('01 plan', 'cost'), value('01 plan', 'tries')],
        [[[1, 2 * MIN]], [[1, 8 * MIN]], [[1, 0.75]], [['-', 2]]],
        "plan's session ran its two turns, 5 minutes and 3, on try 1; the answered try 2 is a turn of it, with no row of its own",
      );
      assert.deepEqual(value('02 implement', 'ran'), [
        [1, 10 * MIN],
        [2, 5 * MIN],
        [3, 4 * MIN],
      ]);
      assert.deepEqual(value('02 implement check', 'ran'), [
        [1, 2 * MIN],
        [2, 2 * MIN],
        [3, 2 * MIN],
      ]);
      assert.deepEqual(
        [value('review round 01', 'wall'), value('review round 02', 'wall')],
        [[['-', 27 * MIN]], [['-', 11 * MIN]]],
        'each round totals apart: 10:25 to 10:52, then 10:52 to 11:03',
      );
      assert.deepEqual(
        ['answer', 'gate', 'check', 'queued', 'wall'].map((part) => value('run', part)[0]?.[1]),
        [6 * MIN, 16 * MIN, 7 * MIN, 12 * MIN, 75 * MIN],
        "the minutes the story let pass: the answer waited on 6, plan's gate 9 and ship's 7, the checks ran 7, the wall 10:00 to 11:15",
      );
      const labels = { factory: 'default', workflow: path.basename(workflowDir), outcome: 'succeeded' };
      assert.deepEqual(
        spans.find((x) => x.row === '04 ship check' && x.part === 'ran'),
        { run: id, try: 1, of: 'check', row: '04 ship check', part: 'ran', value: MIN, ...labels, step: 'ship', agent: 'none' },
      );
      assert.deepEqual(
        spans.find((x) => x.row === 'run' && x.part === 'wall'),
        { run: id, of: 'run', row: 'run', part: 'wall', value: 75 * MIN, ...labels },
        "the run's row is no step's and no try's",
      );
    },
  );

  await s.test("the run's clock: its five parts add up to its wall, each pinned to the minutes the story let pass", async () => {
    const run = readRun(id);
    const runSteps = stepsOf(run);
    const views = await stage.runWith(
      b.e,
      Effect.gen(function* () {
        return yield* everyTryOf(yield* EngineService, run, (yield* taskPhasesRead(run)).views);
      }),
    );
    const filed = new Map([...views].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
    const clock = clockOf(run, views, filed, runSteps, [], Date.now());
    assert.deepEqual(clock, { wallMs: 75 * MIN, sessionsMs: 34 * MIN, checksMs: 7 * MIN, personMs: 22 * MIN, slotMs: 12 * MIN, restMs: 0 });
    assert.equal(clock.sessionsMs + clock.checksMs + clock.personMs + clock.slotMs + clock.restMs, clock.wallMs);
    const tl = timeline(run, views, filed, runSteps);
    const planStep = runSteps.find((x) => x.name === 'plan')!;
    assert.equal(gateWaitOf(run, tl, planStep, tl.steps.plan[1]), 9 * MIN, "K17: the timeline's gate wait from the answer's end");
  });

  await s.test(
    "`nemia stats --json`: landed on its first try, two rounds, the gate waits from the answer's end, the calls refused, the skills, the tally",
    async () => {
      const printed: string[] = [];
      const log = t.mock.method(console, 'log', (...args: unknown[]) => void printed.push(args.map(String).join(' ')));
      try {
        await stage.main(['stats', '--json']);
      } finally {
        log.mock.restore();
      }
      const stats = JSON.parse(printed.join('\n')) as Stats;
      const { total } = stats.all;
      assert.deepEqual(
        [total.runs, total.landed, total.firstTry, total.rounds, total.refused],
        [1, 1, 1, 2, 1],
        'landed on its first try, two rounds, a check refused',
      );
      assert.equal(total.gateWaitMs, 8 * MIN, "the mean of plan's 9 minutes and ship's 7");
      const row = (step: string) => stats.all.steps.find((x) => x.step === step)!;
      assert.equal(
        row('plan').gateWaitMs,
        9 * MIN,
        "K17: `nemia stats` reads plan's wait from the answer's end, as the metric and the timeline do",
      );
      assert.equal(await summed('step.gate.wait', 'plan'), row('plan').gateWaitMs);
      assert.deepEqual(
        [row('implement').deniedCalls, row('implement').denials],
        [
          3,
          [
            { call: 'Skill(look)', count: 2 },
            { call: 'Glob', count: 1 },
          ],
        ],
      );
      assert.deepEqual([row('implement').skillLoads, row('implement').skillTries], [1, 2], 'one skill loaded over the two tries that say');
      assert.deepEqual(
        stats.all.tallies.map((x) => [x.step, x.tally, x.total.sum]),
        [['review', 'findings', 1]],
      );
    },
  );

  await s.test('each metric was recorded once, whatever daemon read it, and none names a run', async () => {
    assert.deepEqual(await counted('step.tries'), [
      ['implement', 'done', 3],
      ['plan', 'done', 1],
      ['review', 'done', 2],
      ['ship', 'done', 1],
    ]);
    assert.deepEqual(await counted('step.tasks'), [
      ['implement', undefined, 1],
      ['plan', undefined, 1],
      ['review', undefined, 1],
      ['ship', undefined, 1],
    ]);
    assert.deepEqual(await counted('step.gate.wait'), [
      ['plan', 'approved', 1],
      ['ship', 'approved', 1],
    ]);
    assert.deepEqual(
      await counted('step.tokens.input'),
      [
        ['implement', 'done', 3 * 1200],
        ['plan', 'done', 2 * 1200],
        ['review', 'done', 2 * 1200],
        ['ship', 'done', 1200],
      ],
      "each session's tokens once, both turns of plan's",
    );
    const total = async (id: string) => (await counted(id)).reduce((n, [, , c]) => n + Number(c), 0);
    assert.deepEqual(
      [await total('step.queue.duration'), await total('step.check.duration'), await total('step.duration')],
      [7, 4, 7],
      "each session's queue and each check's run once",
    );
    for (const m of await snapshot())
      if (m.id.startsWith('step.')) assert.ok(!Object.values(m.attributes ?? {}).some((v) => v.includes(id)), `${m.id} names no run`);
    const before = JSON.stringify(await snapshot());
    lives.push(daemon());
    later(30);
    await tick(3);
    assert.ok(life().spans.length > 0, 'the daemon started again made its passes');
    assert.equal(
      JSON.stringify((await snapshot()).filter((m) => m.id.startsWith('step.'))),
      JSON.stringify(JSON.parse(before).filter((m: { id: string }) => m.id.startsWith('step.'))),
      'REFUSED: nothing counted again',
    );
    assert.deepEqual(
      [spansOf(TIMELINE_SPAN, id, [life()]), spansOf(DENIED_SPAN, id, [life()])],
      [[], []],
      'REFUSED: nothing handed over again',
    );
    assert.deepEqual([...(readRun(id).settlesCounted ?? [])].sort(), [...b.tasks.keys()].sort(), 'every task of the run marked, once');
  });

  await s.test("a pass's spans nest under it; a wait's, a denied call's and a timeline number's are roots of their own", async () => {
    const [first] = lives;
    const advance = first.spans.find((x) => x.name === 'advancePass' && x.attributes.get('run') === id);
    assert.ok(advance, 'the pass over the run');
    assert.deepEqual(
      ancestorsOf(advance).filter((name) => name === 'pass' || name === 'tick'),
      ['pass', 'tick'],
    );
    for (const name of [WAIT_SPANS.queue, WAIT_SPANS.check, WAIT_SPANS.gate, DENIED_SPAN, TIMELINE_SPAN]) {
      const spans = lives.flatMap((l) => l.spans.filter((x) => x.name === name && x.attributes.get('run') === id));
      assert.ok(spans.length > 0, name);
      assert.ok(
        spans.every((x) => Option.isNone(x.parent)),
        `${name}: a root, spanning passes`,
      );
    }
  });

  await s.test('the passes are rolled into the series: a line a minute, and the hour they filled once it is done', async () => {
    const minutes = readDay('minute', '2026-10-06');
    const hours = readDay('hour', '2026-10-06');
    assert.ok(
      minutes.some((x) => x.s === 'pass.ms' && x.t === '2026-10-06T10:00:00.000Z'),
      'the first minute',
    );
    assert.ok(new Set(minutes.map((x) => x.t)).size > 10, 'a line for each minute a pass was in');
    assert.ok(
      minutes.filter((x) => x.s === 'store.runs').every((x) => x.last === 1),
      'what each pass saw: the one run in the store',
    );
    assert.deepEqual(
      [...new Set(hours.map((x) => x.t))],
      ['2026-10-06T10:00:00.000Z'],
      'the hour from 10:00, rolled once the walk passed 11:00; the hour it is in is not done',
    );
    const passes = hours.find((x) => x.s === 'pass.ms')!;
    assert.equal(
      passes.n,
      minutes.filter((x) => x.s === 'pass.ms' && x.t < '2026-10-06T11:00:00.000Z').reduce((n, x) => n + x.n, 0),
      "the hour's passes, its minutes' summed",
    );
  });
});

test('A run measured as its record says: a lone gate approved, a run called off, and a record an older nemia wrote', async (t) => {
  const s = story(t);
  const { b, later, tick, spansOf, counted, spawn, sign } = measuring(t);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  const start = (files: Record<string, string>) =>
    stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder(files), isolate: false }));
  const ONE = { 'work.md': '---\nplace: git\n---\nDo it.\n' };

  await s.test(
    'a gate approved with nothing after it, on a pass that files nothing and hands over no timeline, is timed once and marked on disk',
    async () => {
      const { id } = await start({ 'intake.md': '---\nplace: git\ngate: true\n---\nAsk.\n' });
      const { runTimed: _, ...unmarked } = readRun(id);
      rewriteRun(unmarked);
      await tick();
      later(1);
      spawn(`${id}-intake`);
      later(4);
      sign(`${id}-intake`, SIGNED);
      await tick(3);
      later(9);
      await stage.runWith(b.e, approveRun(id, 'intake'));
      await tick(4);
      assert.deepEqual(await counted('step.gate.wait'), [['intake', 'approved', 1]], 'once over every pass');
      assert.deepEqual(readRun(id).gatesTimed, [{ step: 'intake', try: 1 }], 'marked timed on disk');
      assert.deepEqual([readRun(id).runTimed, spansOf(TIMELINE_SPAN, id)], [undefined, []], 'a record started before the timeline mark');
    },
  );

  await s.test('a run called off is handed over once its task has stopped, as cancelled', async () => {
    const { id } = await start(ONE);
    await tick();
    later(2);
    spawn(`${id}-work`);
    later(6);
    await stage.runWith(b.e, cancelRun(id));
    await tick();
    assert.deepEqual(spansOf(TIMELINE_SPAN, id), [], 'REFUSED: its task still in flight');
    b.settle(`${id}-work`, 'stopped');
    await tick(3);
    const spans = spansOf(TIMELINE_SPAN, id);
    assert.ok(spans.length > 0, 'its rows');
    assert.deepEqual([...new Set(spans.map((x) => x.outcome))], ['cancelled']);
    assert.deepEqual(spans.map(lineOf).sort(), (await pageRows(id)).map(lineOf).sort());
  });

  await s.test(
    'REFUSED: a record with none of the marks counts no settle, times no gate or call and hands over no timeline, and gets no mark',
    async () => {
      const { id } = await start(ONE);
      const { settlesCounted: _s, gatesTimed: _g, deniedCounted: _d, runTimed: _r, ...older } = readRun(id);
      rewriteRun(older);
      await tick();
      spawn(`${id}-work`);
      later(3);
      sign(`${id}-work`, SIGNED, { denials: [{ tool: 'Glob' }] });
      await tick(3);
      assert.equal(b.tasks.get(`${id}-work`)!.phase, 'succeeded', 'the session settled');
      assert.deepEqual(
        [await counted('step.tries'), spansOf(DENIED_SPAN, id), spansOf(TIMELINE_SPAN, id)],
        [
          [
            ['intake', 'done', 1],
            ['work', 'stopped', 1],
          ],
          [],
          [],
        ],
        'the tries of the two checkpoints before, and none of its own',
      );
      const after = readRun(id);
      assert.deepEqual(
        [after.settlesCounted, after.gatesTimed, after.deniedCounted, after.runTimed],
        [undefined, undefined, undefined, undefined],
      );
    },
  );
});
