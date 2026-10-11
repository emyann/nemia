/**
 * A step's metrics (`step.ts`, `recordStepMetrics`): the facts read off the tasks a pass saw settle, recorded by the five attributes
 * alone, and a fact whose attributes carry a run's id refused; the waits — a session's queue, a check's run, a gate's wait — equal to what
 * the timeline and `nemia stats` say of the same records, each a histogram by the five and a span with its run and try; and the calls a
 * harness denied a session (`deniedCalls`), one per call of each ended attempt past the run's mark, each a span and no metric. The tick
 * that hands them over is proven on a store in `test/step-metrics.test.ts` and `test/wait-metrics.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Metric, Tracer } from 'effect';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import type { TaskSpend } from '../status/status.ts';
import {
  boundedAttributes,
  checkWait,
  deniedCalls,
  gateWaits,
  onceFacts,
  queueWait,
  roundsGranted,
  settledFacts,
  settledOnce,
  settledWaits,
  settlesDue,
  stepAttributes,
  type FactReads,
  type DeniedFact,
  type FactView,
  type StepFact,
  type WaitFact,
} from './step.ts';
import { DENIED_SPAN, DENIED_SPAN_KEYS, recordStepMetrics, WAIT_SPANS } from './meter.verb.ts';
import { gateWaitOf, timeline } from '../timeline/index.ts';

const WORK = { name: 'work', agent: { name: 'ada' } } as Workflow;
const REVIEW = { name: 'review' } as Workflow;

const RUN = {
  id: 'r-1',
  factory: 'nemia',
  workflowDir: '/home/me/.agent-workflows/workflows/build',
  steps: {
    work: { status: 'running', taskId: 'r-1-work-try2', check: { taskId: 'r-1-work-try2-check' }, tries: [{ taskId: 'r-1-work' }] },
    review: { status: 'running', taskId: 'r-1-review' },
  },
} as unknown as Run;

/** A task's view that ran from 10:00 to 10:05 and settled as `settled`, its last attempt's exit `exitCode`. */
const view = (settled: string, exitCode?: number): FactView => ({
  state: {
    brief: 'Do it.',
    settled,
    attempts: [
      {
        startedAt: '2026-10-06T10:00:00.000Z',
        spawnedAt: '2026-10-06T10:00:00.000Z',
        endedAt: '2026-10-06T10:05:00.000Z',
        reason: null,
        usage: { inputTokens: 1200, outputTokens: 300, costUsd: 1.25 },
        ...(exitCode === undefined ? {} : { exitCode }),
      },
    ],
  },
});

const SPENT: TaskSpend = { usd: 1.25, measured: 1, unmeasured: 0, budgetEnded: false, denied: ['Bash(curl x)', 'Bash(git push)'] };

const reads = (over: Partial<FactReads> = {}): FactReads => ({
  views: new Map([
    ['r-1-work-try2', view('succeeded')],
    ['r-1-work-try2-check', view('failed', 1)],
    ['r-1-work', view('stopped')],
    ['r-1-review', view('succeeded')],
  ]),
  spendOf: (taskId) => (taskId === 'r-1-work-try2' ? SPENT : undefined),
  signedOff: () => ({ outcome: 'blocked', summary: '', artifacts: [] }),
  statusOf: () => 'running',
  ...over,
});

test("a step's attributes are its factory, workflow, step, agent and outcome, and nothing of the run", () => {
  assert.deepEqual(stepAttributes(RUN, WORK, 'done'), { factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome: 'done' });
  assert.deepEqual(stepAttributes({ workflowDir: '/w/intake' }, REVIEW, 'passed'), {
    factory: 'default',
    workflow: 'intake',
    step: 'review',
    agent: 'none',
    outcome: 'passed',
  });
});

test("REFUSED: attributes that carry a run's id or a task's are not a step's", () => {
  for (const key of ['run', 'task']) {
    let refused: unknown;
    try {
      boundedAttributes({ factory: 'nemia', step: 'work', [key]: 'r-1' });
    } catch (err) {
      refused = err;
    }
    assert.ok(refused instanceof Error, key);
    assert.match(
      refused.message,
      new RegExp(`carries the attribute "${key}", which is not one of factory, workflow, step, agent, outcome`),
    );
  }
});

test('the facts of the tasks that settled: a session with its cost, tokens and time, a check by its verdict', () => {
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2', 'r-1-work-try2-check', 'r-2-work']), reads());
  const attrs = (outcome: string) => ({ factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome });
  assert.deepEqual(facts, [
    { metric: 'try', attributes: attrs('blocked'), costUsd: 1.25, inputTokens: 1200, outputTokens: 300, ms: 300_000 },
    { metric: 'check', attributes: attrs('refused') },
  ]);
});

test('an earlier try is read by how its session ended, never off the closeout of the try after it; nothing settled, no fact', () => {
  const [earlier] = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work']), reads({ signedOff: () => undefined }));
  assert.equal(earlier.attributes.outcome, 'stopped');
  assert.equal('costUsd' in earlier, false, 'no cost measured, none said');
  assert.deepEqual(settledFacts(RUN, [WORK, REVIEW], new Set(), reads()), []);
});

test('a round exhausted once for a step one of its settled tasks leaves out of rounds, and one granted for each loop taken again', () => {
  const exhausted = reads({ statusOf: (s) => (s.name === 'work' ? 'exhausted' : 'running') });
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2', 'r-1-work-try2-check']), exhausted);
  assert.deepEqual(
    facts.filter((f) => f.metric === 'round').map((f) => f.attributes.outcome),
    ['exhausted'],
  );
  assert.deepEqual(
    roundsGranted(RUN, [WORK, REVIEW], ['review']).map((f) => [f.attributes.step, f.attributes.outcome]),
    [['review', 'granted']],
  );
});

test("a session held open and answered, the step's task and one of its tries', is one try fact with its cost once", () => {
  const held = {
    ...RUN,
    steps: { work: { status: 'running', taskId: 'r-1-work-try2', tries: [{ taskId: 'r-1-work-try2' }] } },
  } as unknown as Run;
  const facts = settledFacts(held, [WORK], new Set(['r-1-work-try2']), reads());
  assert.deepEqual(
    facts.map((f) => [f.metric, 'costUsd' in f ? f.costUsd : undefined]),
    [['try', 1.25]],
  );
  const recheck = {
    ...RUN,
    steps: { work: { status: 'running', taskId: 'r-1-work', check: { taskId: 'r-1-work-try2-check' }, tries: [{ taskId: 'r-1-work' }] } },
  } as unknown as Run;
  assert.deepEqual(
    settledFacts(recheck, [WORK], new Set(['r-1-work', 'r-1-work-try2-check']), reads()).map((f) => f.metric),
    ['try', 'check'],
    "a recheck's session is counted once, and its check beside it",
  );
});

test('a settle is due once: a task its view says settled that the mark does not hold, a check like a session', () => {
  const marked = (settlesCounted: string[]) => ({ ...RUN, settlesCounted }) as Run;
  const views = new Map<string, FactView>([
    ['r-1-work-try2', view('succeeded')],
    ['r-1-work-try2-check', view('failed', 1)],
    ['r-1-work', view('stopped')],
    ['r-1-review', { state: { brief: 'Do it.', settled: null, attempts: [] } }],
    ['r-2-work', view('succeeded')],
  ]);
  assert.deepEqual([...settlesDue(marked([]), [WORK, REVIEW], views)!], ['r-1-work-try2', 'r-1-work-try2-check', 'r-1-work']);
  assert.deepEqual([...settlesDue(marked(['r-1-work-try2', 'r-1-work']), [WORK, REVIEW], views)!], ['r-1-work-try2-check']);
  assert.deepEqual([...settlesDue(marked([]), [WORK, REVIEW], new Map())!], [], 'REFUSED: a task the pass has no view of is not due');
  assert.deepEqual([...settlesDue(marked([...views.keys()]), [WORK, REVIEW], views)!], [], 'REFUSED: a task the mark holds is not due');
  assert.equal(settlesDue(RUN, [WORK, REVIEW], views), undefined, 'a record with no mark: the feed says which');
  const once = settledOnce(marked(['r-1-work']), [WORK, REVIEW], new Set(['r-1-work']), reads({ views }));
  assert.deepEqual(once.marks, { settlesCounted: ['r-1-work', 'r-1-work-try2', 'r-1-work-try2-check'] }, 'the mark, moved past them');
  assert.deepEqual(
    once.facts.map((f) => f.metric),
    ['try', 'check', 'wait'],
    'what the feed names is not asked of a marked record',
  );
  assert.deepEqual(settledOnce(marked([...views.keys()]), [WORK, REVIEW], new Set(['r-1-work']), reads({ views })), {
    facts: [],
    marks: {},
  });
  const fed = settledOnce(RUN, [WORK, REVIEW], new Set(['r-1-work']), reads({ views }));
  assert.deepEqual(
    [fed.facts.map((f) => f.metric), fed.marks],
    [['try'], {}],
    'a record with no mark is counted off the feed, and gets none',
  );
});

/** `program` over a registry of its own, and what it holds after. */
const recorded = async (facts: readonly StepFact[]) => {
  const registry = new Map();
  const own = <A, E>(program: Effect.Effect<A, E>) =>
    Effect.runPromise(program.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  await own(recordStepMetrics(facts));
  return own(Metric.snapshot);
};

test('a session that settled with a cost records its cost once, by the five attributes and no run', async () => {
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2']), reads());
  const snapshot = await recorded(facts);
  const cost = snapshot.filter((m) => m.id === 'step.cost');
  assert.equal(cost.length, 1);
  assert.equal((cost[0].state as { count: number }).count, 1.25);
  assert.deepEqual(Object.keys(cost[0].attributes ?? {}).sort(), ['agent', 'factory', 'outcome', 'step', 'workflow']);
  const count = (id: string) => (snapshot.find((m) => m.id === id)!.state as { count: number }).count;
  assert.equal(count('step.tries'), 1);
  assert.equal(
    snapshot.some((m) => m.id === 'step.denied'),
    false,
    'a denied call is no metric',
  );
  assert.equal(count('step.tokens.input'), 1200);
  assert.equal(count('step.duration'), 1);
  assert.ok(snapshot.every((m) => !('run' in (m.attributes ?? {}))));
});

test("REFUSED: a fact whose attributes carry a run's id is recorded nowhere", async () => {
  const fact: StepFact = { metric: 'check', attributes: { factory: 'nemia', step: 'work', outcome: 'passed', run: 'r-1' } };
  await assert.rejects(recorded([fact]), (err: Error) => {
    assert.match(err.message, /carries the attribute "run"/);
    return true;
  });
});

const DAY = '2026-10-06';

/** A task's view filed at `filed`, spawned at `spawned`, ended at `ended` and settled as `settled`, its exit `exitCode`; times of `DAY`. */
const clocked = (filed: string, spawned: string, ended: string, settled = 'succeeded', exitCode?: number): FactView => ({
  state: {
    brief: 'Do it.',
    settled,
    filedAt: `${DAY}T${filed}:00.000Z`,
    attempts: [
      {
        startedAt: `${DAY}T${spawned}:00.000Z`,
        spawnedAt: `${DAY}T${spawned}:00.000Z`,
        endedAt: `${DAY}T${ended}:00.000Z`,
        reason: null,
        usage: null,
        ...(exitCode === undefined ? {} : { exitCode }),
      },
    ],
  },
});

const CLOCKED = new Map([
  ['r-1-work', clocked('09:50', '09:52', '09:55', 'stopped')],
  ['r-1-work-try2', clocked('10:00', '10:04', '10:05')],
  ['r-1-work-try2-check', clocked('10:05', '10:06', '10:09', 'failed', 1)],
]);

/** Each task's filing, as the timeline is handed it off the feed. */
const filedOf = (views: ReadonlyMap<string, FactView>) => new Map([...views].map(([id, v]) => [id, v.state.filedAt!]));

test("each settled session's queue is filed to first spawn and each check's run spawned to ended: the timeline's own", () => {
  const settled = new Set(CLOCKED.keys());
  const waits = settledWaits(RUN, [WORK, REVIEW], settled, reads({ views: CLOCKED }));
  const attrs = (outcome: string) => ({ factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome });
  const at = (hm: string) => `2026-10-06T${hm}:00.000Z`;
  assert.deepEqual(waits, [
    { metric: 'wait', wait: 'queue', attributes: attrs('stopped'), run: 'r-1', try: 1, from: at('09:50'), to: at('09:52'), ms: 120_000 },
    { metric: 'wait', wait: 'queue', attributes: attrs('blocked'), run: 'r-1', try: 2, from: at('10:00'), to: at('10:04'), ms: 240_000 },
    { metric: 'wait', wait: 'check', attributes: attrs('refused'), run: 'r-1', try: 2, from: at('10:06'), to: at('10:09'), ms: 180_000 },
  ]);
  const tl = timeline({ ...RUN, createdAt: at('09:49') }, CLOCKED, filedOf(CLOCKED), [WORK, REVIEW]);
  const [first, second] = tl.steps.work;
  assert.deepEqual(
    waits.map((w) => w.ms),
    [first.session?.queuedMs, second.session?.queuedMs, second.check?.ranMs],
  );
});

test("a session's queue ends at its first attempt's spawn: neither when that attempt started, nor a later attempt's spawn", () => {
  const attempt = (started: string, spawned: string, ended: string) => ({
    startedAt: `${DAY}T${started}:00.000Z`,
    spawnedAt: `${DAY}T${spawned}:00.000Z`,
    endedAt: `${DAY}T${ended}:00.000Z`,
    reason: null,
    usage: null,
  });
  const retried: FactView = {
    state: {
      brief: 'Do it.',
      settled: 'succeeded',
      filedAt: `${DAY}T10:00:00.000Z`,
      attempts: [attempt('10:03', '10:04', '10:05'), attempt('10:06', '10:07', '10:09')],
    },
  };
  assert.deepEqual(queueWait(retried), { from: `${DAY}T10:00:00.000Z`, to: `${DAY}T10:04:00.000Z`, ms: 240_000 });
  const views = new Map([['r-1-work', retried]]);
  const tl = timeline({ ...RUN, steps: { work: { status: 'done', taskId: 'r-1-work' } } } as unknown as Run, views, filedOf(views), [WORK]);
  assert.equal(queueWait(retried)?.ms, tl.steps.work[0].session?.queuedMs, "the timeline's own");
});

test('REFUSED: a task not settled, one never spawned, one with no filing and a recheck sharing a session are no wait', () => {
  const unspawned: FactView = { state: { brief: 'Do it.', settled: 'stopped', filedAt: '2026-10-06T10:00:00.000Z', attempts: [] } };
  const unfiled = clocked('10:00', '10:04', '10:05');
  delete unfiled.state.filedAt;
  assert.deepEqual(settledWaits(RUN, [WORK, REVIEW], new Set(['r-1-work']), reads({ views: CLOCKED })).length, 1);
  assert.deepEqual(settledWaits(RUN, [WORK, REVIEW], new Set(['r-1-review']), reads({ views: CLOCKED })), [], 'no view');
  assert.deepEqual(settledWaits(RUN, [WORK, REVIEW], new Set(), reads({ views: CLOCKED })), [], 'nothing settled');
  assert.equal(queueWait(unspawned), null);
  assert.equal(checkWait(unspawned), null);
  assert.equal(queueWait(unfiled), null);
  const recheck = {
    ...RUN,
    steps: { work: { status: 'running', taskId: 'r-1-work', check: { taskId: 'r-1-work-try2-check' }, tries: [{ taskId: 'r-1-work' }] } },
  } as unknown as Run;
  const waits = settledWaits(recheck, [WORK], new Set(CLOCKED.keys()), reads({ views: CLOCKED }));
  assert.deepEqual(
    waits.map((w) => [w.wait, w.try]),
    [
      ['queue', 1],
      ['check', 2],
    ],
    "the recheck's session is its first try's",
  );
});

const PLAN = { name: 'plan', gate: true, after: [] } as unknown as Workflow;
const BUILD = { name: 'build', after: ['plan'] } as unknown as Workflow;
const GATED = {
  id: 'r-2',
  workflowDir: '/w/build',
  createdAt: '2026-10-06T09:59:00.000Z',
  steps: { plan: { status: 'done', taskId: 'r-2-plan' }, build: { status: 'done', taskId: 'r-2-build' } },
  approvals: [
    { step: 'plan', try: 1, at: '2026-10-06T10:30:00.000Z' },
    { step: 'build', try: 1, at: '2026-10-06T11:00:00.000Z' },
  ],
  gatesTimed: [],
} as unknown as Run;
const GATED_VIEWS = new Map([
  ['r-2-plan', clocked('10:00', '10:00', '10:10')],
  ['r-2-build', clocked('10:30', '10:31', '10:40')],
]);

test("a gate's wait is from its try's end to its approval, the one `nemia stats` reads, at a gated step alone", () => {
  const [wait, ...others] = gateWaits(GATED, [PLAN, BUILD], GATED_VIEWS);
  assert.deepEqual(wait, {
    metric: 'wait',
    wait: 'gate',
    attributes: { factory: 'default', workflow: 'build', step: 'plan', agent: 'none', outcome: 'approved' },
    run: 'r-2',
    try: 1,
    from: '2026-10-06T10:10:00.000Z',
    to: '2026-10-06T10:30:00.000Z',
    ms: 1_200_000,
  });
  assert.deepEqual(others, [], 'build is no gate, though approved');
  const tl = timeline(GATED, GATED_VIEWS, new Map(), [PLAN, BUILD]);
  assert.equal(wait.ms, gateWaitOf(GATED, tl, PLAN, tl.steps.plan[0]));
  const gatedByRun = gateWaits({ ...GATED, gates: ['build'] }, [PLAN, BUILD], GATED_VIEWS);
  assert.deepEqual(
    gatedByRun.map((w) => [w.attributes.step, w.ms]),
    [
      ['plan', 1_200_000],
      ['build', 1_200_000],
    ],
    'a gate the run was started with is timed too',
  );
});

const SHIP = { name: 'ship', gate: true, after: ['plan'] } as unknown as Workflow;
const UNGATED_PLAN = { name: 'plan', after: [] } as unknown as Workflow;
const PRE_APPROVED = {
  id: 'r-3',
  workflowDir: '/w/build',
  createdAt: '2026-10-06T09:39:00.000Z',
  steps: { plan: { status: 'done', taskId: 'r-3-plan' }, ship: { status: 'running', taskId: 'r-3-ship' } },
  approvals: [{ step: 'ship', try: 1, at: '2026-10-06T10:25:00.000Z' }],
  gatesTimed: [],
} as unknown as Run;
const PRE_APPROVED_VIEWS = new Map([
  ['r-3-plan', clocked('09:40', '09:41', '09:50')],
  ['r-3-ship', clocked('10:30', '10:31', '10:40')],
]);

test("a gate approved before its step was filed waits from its after step's end to the approval, as `nemia stats` reads it", () => {
  const waits = gateWaits(PRE_APPROVED, [UNGATED_PLAN, SHIP], PRE_APPROVED_VIEWS);
  assert.deepEqual(waits, [
    {
      metric: 'wait',
      wait: 'gate',
      attributes: { factory: 'default', workflow: 'build', step: 'ship', agent: 'none', outcome: 'approved' },
      run: 'r-3',
      try: 1,
      from: '2026-10-06T09:50:00.000Z',
      to: '2026-10-06T10:25:00.000Z',
      ms: 2_100_000,
    },
  ]);
  const tl = timeline(PRE_APPROVED, PRE_APPROVED_VIEWS, new Map(), [UNGATED_PLAN, SHIP]);
  assert.equal(waits[0].ms, gateWaitOf(PRE_APPROVED, tl, SHIP, tl.steps.ship[0]));
});

test('REFUSED: a gate already timed, a record with no gatesTimed and an approval with no try on the clock are no wait', () => {
  assert.deepEqual(gateWaits({ ...GATED, gatesTimed: [{ step: 'plan', try: 1 }] }, [PLAN, BUILD], GATED_VIEWS), []);
  const older = { ...GATED };
  delete older.gatesTimed;
  assert.deepEqual(gateWaits(older, [PLAN, BUILD], GATED_VIEWS), [], 'a record written before the tick timed gates');
  const unfiled = { ...GATED, steps: { build: GATED.steps.build } } as Run;
  assert.deepEqual(gateWaits(unfiled, [PLAN, BUILD], GATED_VIEWS), [], 'the try approved is not on the timeline yet');
});

test('a wait is recorded into its histogram by the five attributes, and as a span from its start to its end with its run and try', async () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const registry = new Map();
  const facts: WaitFact[] = [
    ...settledWaits(RUN, [WORK, REVIEW], new Set(CLOCKED.keys()), reads({ views: CLOCKED })),
    ...gateWaits(GATED, [PLAN, BUILD], GATED_VIEWS),
  ];
  await Effect.runPromise(recordStepMetrics(facts).pipe(Effect.withTracer(tracer), Effect.provideService(Metric.MetricRegistry, registry)));
  const snapshot = await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  const counted = (id: string) =>
    snapshot.filter((m) => m.id === id).map((m) => [m.attributes?.outcome, (m.state as { count: number; sum: number }).sum]);
  assert.deepEqual(counted('step.queue.duration'), [
    ['stopped', 120_000],
    ['blocked', 240_000],
  ]);
  assert.deepEqual(counted('step.check.duration'), [['refused', 180_000]]);
  assert.deepEqual(counted('step.gate.wait'), [['approved', 1_200_000]]);
  assert.ok(snapshot.every((m) => !('run' in (m.attributes ?? {})) && !('try' in (m.attributes ?? {}))));
  const waits = spans.filter((s) => s.name !== 'recordStepMetrics');
  assert.deepEqual(
    waits.map((s) => s.name),
    [WAIT_SPANS.queue, WAIT_SPANS.queue, WAIT_SPANS.check, WAIT_SPANS.gate],
  );
  const check = waits[2];
  const ns = (at: string) => BigInt(Date.parse(at)) * 1_000_000n;
  assert.equal(check.status._tag, 'Ended');
  assert.equal(check.status.startTime, ns('2026-10-06T10:06:00.000Z'));
  assert.equal(check.status._tag === 'Ended' ? check.status.endTime : null, ns('2026-10-06T10:09:00.000Z'));
  assert.deepEqual(Object.fromEntries(check.attributes), {
    run: 'r-1',
    try: 2,
    factory: 'nemia',
    workflow: 'build',
    step: 'work',
    agent: 'ada',
    outcome: 'refused',
  });
  assert.ok(
    spans.every((s) => s.parent._tag === 'None'),
    'each a root of its own',
  );
});

/** An attempt that began at `hm` of `DAY`, was denied `denials`, and ended a minute later as `ended`, or runs still with none. */
const deniedAttempt = (hm: string, denials: Array<{ tool: string; what?: string }>, ended: string | null = 'done') => ({
  startedAt: `${DAY}T${hm}:00.000Z`,
  spawnedAt: `${DAY}T${hm}:00.000Z`,
  endedAt: ended === null ? null : `${DAY}T${hm}:59.000Z`,
  reason: null,
  usage: null,
  ended,
  denials,
});

/** A task's view of `attempts`, not settled: a task held open between its turns. */
const turns = (...attempts: ReturnType<typeof deniedAttempt>[]): FactView => ({ state: { brief: 'Do it.', settled: null, attempts } });

const BASH = { tool: 'Bash', what: 'git push' };
const DENIED_RUN = { ...RUN, deniedCounted: [] } as Run;
const DENIED_VIEWS = new Map([
  ['r-1-work-try2', turns(deniedAttempt('10:00', [{ tool: 'Glob' }], 'blocked'), deniedAttempt('10:10', [BASH, BASH]))],
  ['r-1-work-try2-check', turns(deniedAttempt('10:20', [{ tool: 'Read' }]))],
]);
const callOf = (d: { tool: string; what?: string }) => (d.what ? `${d.tool}(${d.what})` : d.tool);
/** What `deniedCalls` gives of `run` over `views`, each as its task, attempt, tool, call and time. */
const denied = (run: Run, views: ReadonlyMap<string, FactView> = DENIED_VIEWS) =>
  deniedCalls(run, [WORK, REVIEW], views, callOf).map((f) => [f.task, f.attempt, f.tool, f.call, f.at.slice(11, 19)]);

test('each call of each ended attempt is one denied fact, in order, a call denied twice two, whatever the attempt signed', () => {
  assert.deepEqual(denied(DENIED_RUN), [
    ['r-1-work-try2', 1, 'Glob', 'Glob', '10:00:59'],
    ['r-1-work-try2', 2, 'Bash', 'Bash(git push)', '10:10:59'],
    ['r-1-work-try2', 2, 'Bash', 'Bash(git push)', '10:10:59'],
  ]);
  const [fact] = deniedCalls(DENIED_RUN, [WORK, REVIEW], DENIED_VIEWS, callOf);
  assert.deepEqual(fact.attributes, { factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada' }, "the step's labels, no outcome");
  assert.equal(fact.run, 'r-1');
});

test("REFUSED: an attempt still running, one before its task's mark, a check's task and a record with no deniedCounted give no fact", () => {
  const running = new Map([['r-1-work-try2', turns(deniedAttempt('10:00', [{ tool: 'Glob' }], null))]]);
  assert.deepEqual(denied(DENIED_RUN, running), [], 'counted once its attempt ends, never while it runs');
  const marked = { ...DENIED_RUN, deniedCounted: [{ task: 'r-1-work-try2', attempts: 1 }] } as Run;
  assert.deepEqual(
    denied(marked).map(([, attempt]) => attempt),
    [2, 2],
    'the first attempt is counted already',
  );
  assert.deepEqual(denied({ ...DENIED_RUN, deniedCounted: [{ task: 'r-1-work-try2', attempts: 2 }] }), []);
  assert.equal(
    denied(DENIED_RUN).some(([task]) => task === 'r-1-work-try2-check'),
    false,
    "a check's task is never read",
  );
  assert.deepEqual(denied(RUN), [], 'a record written before the tick counted denials');
});

test("what a pass hands over once comes with the run's marks moved past it, and a record without a mark keeps none", () => {
  const first = onceFacts({ ...GATED, steps: DENIED_RUN.steps, deniedCounted: [] }, [WORK, REVIEW], DENIED_VIEWS, callOf);
  assert.equal(first.facts.length, 3);
  assert.deepEqual(first.marks, { gatesTimed: [], deniedCounted: [{ task: 'r-1-work-try2', attempts: 2 }] });
  const again = onceFacts({ ...DENIED_RUN, ...first.marks }, [WORK, REVIEW], DENIED_VIEWS, callOf);
  assert.deepEqual(again, { facts: [], marks: first.marks }, 'REFUSED: nothing handed over twice');
  const gate = onceFacts(GATED, [PLAN, BUILD], GATED_VIEWS, callOf);
  assert.deepEqual([gate.facts.length, gate.marks], [1, { gatesTimed: [{ step: 'plan', try: 1 }] }], 'no deniedCounted, none made');
  assert.deepEqual(onceFacts(RUN, [WORK, REVIEW], DENIED_VIEWS, callOf), { facts: [], marks: {} });
});

test("a task that is the step's and one of its tries' is read once", () => {
  const held = {
    ...DENIED_RUN,
    steps: { work: { status: 'running', taskId: 'r-1-work', tries: [{ taskId: 'r-1-work' }] } },
  } as unknown as Run;
  const views = new Map([['r-1-work', turns(deniedAttempt('10:00', [{ tool: 'Glob' }], 'blocked'))]]);
  assert.deepEqual(denied(held, views), [['r-1-work', 1, 'Glob', 'Glob', '10:00:59']]);
});

test("a denied call is recorded as a span at its attempt's end with its run, task, tool and call, and into no metric", async () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const registry = new Map();
  const facts = deniedCalls(DENIED_RUN, [WORK, REVIEW], DENIED_VIEWS, callOf);
  await Effect.runPromise(recordStepMetrics(facts).pipe(Effect.withTracer(tracer), Effect.provideService(Metric.MetricRegistry, registry)));
  const snapshot = await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  assert.deepEqual(
    snapshot.filter((m) => m.id.startsWith('step.')),
    [],
    'no metric of a step',
  );
  const calls = spans.filter((s) => s.name === DENIED_SPAN);
  assert.equal(calls.length, 3);
  const last = calls[2];
  assert.deepEqual(Object.fromEntries(last.attributes), {
    run: 'r-1',
    task: 'r-1-work-try2',
    tool: 'Bash',
    call: 'Bash(git push)',
    factory: 'nemia',
    workflow: 'build',
    step: 'work',
    agent: 'ada',
  });
  assert.deepEqual(
    [...last.attributes.keys()].filter((key) => !['factory', 'workflow', 'step', 'agent'].includes(key)),
    [...DENIED_SPAN_KEYS],
  );
  const at = BigInt(Date.parse('2026-10-06T10:10:59.000Z')) * 1_000_000n;
  assert.deepEqual([last.status.startTime, last.status._tag === 'Ended' ? last.status.endTime : null], [at, at]);
  assert.ok(
    calls.every((s) => s.parent._tag === 'None'),
    'each a root of its own',
  );
});

test("REFUSED: a denied call whose attributes carry a task's id is recorded nowhere", async () => {
  const fact: DeniedFact = {
    metric: 'denied',
    attributes: { factory: 'nemia', step: 'work', task: 'r-1-work' },
    run: 'r-1',
    task: 'r-1-work',
    tool: 'Glob',
    call: 'Glob',
    at: '2026-10-06T10:00:59.000Z',
    attempt: 1,
  };
  await assert.rejects(recorded([fact]), (err: Error) => {
    assert.match(err.message, /carries the attribute "task"/);
    return true;
  });
});
