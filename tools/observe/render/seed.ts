/**
 * The fake telemetry a render shows its dashboards over: fixtures written by hand, stamped inside the last minute and posted as
 * OTLP/HTTP JSON to the throwaway stack's own collector, never the live one.
 *
 * `SEED` holds what the daemon would say (the service `nemia`: its passes, a run's filings and appends, the waits and the denied calls
 * of two steps, that run's timeline once over, each number a span, the largest runs of a sweep of the disk, its metrics and its logs)
 * and what two steps' sessions would (`claude-code`: a turn with its model request and tools, and their `tool_result` events). Every
 * panel that draws series is met by two at least, and one failed `tool_result` carries no `tool_name`, so a panel that drops a label
 * shows it. The failed results are of both kinds, each in both steps: the `Bash` tool's, a command that exited non-zero, and other
 * tools'. What no fixture meets is listed in `UNSEEDED`, with why.
 * `packages/agent-orchestrator/test/observe.test.ts` holds the names here to those the code emits, and the dashboards to the seed.
 */
import { asked, awaited } from './stack.ts';

/** The attributes of a seeded span: each a word, or a number where the code sends one. */
export type SpanAttributes = Record<string, string | number>;

/** A span of the seed: how long before the stamp it began and how long it took, in milliseconds, and the spans under it. */
export type SpanSeed = { name: string; ago: number; took: number; attributes: SpanAttributes; children?: SpanSeed[] };

/** A log record of the seed: its body, how long before the stamp it was said, and its attributes. */
export type LogSeed = { body: string; ago: number; attributes: Record<string, string> };

/**
 * A metric of the seed, by the name the code gives it: a `histogram`, a `gauge` (unit `1`), a `total` (a sum that only grows) or a
 * `counter` (any other sum); each series its attributes and the value it reaches, or for a histogram the one value it observes; and
 * `restarted` for a series a daemon births at zero once it holds the store, seeded across a restart of its process.
 */
export type MetricSeed = {
  name: string;
  kind: 'histogram' | 'gauge' | 'total' | 'counter';
  series: [Record<string, string>, number][];
  restarted?: true;
};

/** `metric`, seeded across a restart of the daemon (`MetricSeed`'s `restarted`). */
const restarted = (metric: MetricSeed): MetricSeed => ({ ...metric, restarted: true });

/** What one service says in the seed: its resource's attributes beside its name, its root spans, its logs and its metrics. */
export type ServiceSeed = {
  service: string;
  resource?: Record<string, string>;
  spans: SpanSeed[];
  logs: LogSeed[];
  metrics: MetricSeed[];
};

/** The service a step's session files what it says under. */
export const SESSIONS = 'claude-code';

/** The seeded run a one-run panel is opened on, and a second one beside it. */
export const RUN = 'seeded-run-1';
const OTHER_RUN = 'seeded-run-2';

/** The two steps the seed tells of, by a step's four labels. */
const IMPLEMENT = { factory: 'nemia', workflow: 'build', step: 'implement', agent: 'ada' };
const REVIEW = { factory: 'nemia', workflow: 'build', step: 'review', agent: 'agora' };

/** A step the daemon timed whose session sent no span, as a step on another harness: what Time lists as unmeasured. */
const DESIGN = { factory: 'nemia', workflow: 'build', step: 'design', agent: 'seldon' };

/** The task a step's session of the seeded run runs as. */
const taskOf = (step: { step: string }): string => `${RUN}-${step.step}`;

/** A pass that began `ago` before the stamp, with the run it advanced. */
const pass = (ago: number, took: number, run: string): SpanSeed => ({
  name: 'pass',
  ago,
  took,
  attributes: {},
  children: [{ name: 'advancePass', ago: ago - 10, took: took / 2, attributes: { run } }],
});

/** A filing of `step` in the seeded run, with the runtime's appends of `kinds` under it. */
const filing = (step: typeof IMPLEMENT, ago: number, kinds: string[]): SpanSeed => ({
  name: 'file',
  ago,
  took: 40,
  attributes: { run: RUN, step: step.step },
  children: kinds.map((kind, i) => ({
    name: 'append',
    ago: ago - 5 - i * 5,
    took: 3,
    attributes: { run: RUN, step: step.step, task: taskOf(step), kind },
  })),
});

/** A call a harness denied `step`'s session, as the daemon's span of it. */
const denied = (step: typeof IMPLEMENT, ago: number, tool: string, call: string): SpanSeed => ({
  name: 'step.denied',
  ago,
  took: 0,
  attributes: { ...step, run: RUN, task: taskOf(step), tool, call },
});

/** A wait of `step` in the seeded run that ended with `outcome`. */
const wait = (name: string, step: typeof IMPLEMENT, ago: number, took: number, outcome: string): SpanSeed => ({
  name,
  ago,
  took,
  attributes: { ...step, run: RUN, try: '1', outcome },
});

/** The run the seeded timeline is of, by the three labels every number of it carries: one that succeeded. */
const ENDED = { factory: 'nemia', workflow: 'build', outcome: 'succeeded' };

/** One number of the seeded run's timeline, as the daemon's span of it: `value` of `part`, on `row`, with `own` beside the run's labels. */
const number = (of: string, row: string, part: string, value: number, own: SpanAttributes = {}): SpanSeed => ({
  name: 'run.timeline',
  ago: 20_000,
  took: 0,
  attributes: { ...ENDED, ...own, run: RUN, of, row, part, value },
});

/** The numbers of `step`'s row `row` in the seeded run's timeline: each try's wait, run and cost, and how many tries it took. */
const stepNumbers = (step: typeof IMPLEMENT, row: string, tries: [queued: number, ran: number, cost: number][]): SpanSeed[] => {
  const labels = { step: step.step, agent: step.agent };
  return [
    ...tries.flatMap(([queued, ran, cost], i) => [
      number('try', row, 'queued', queued, { ...labels, try: i + 1 }),
      number('try', row, 'ran', ran, { ...labels, try: i + 1 }),
      number('try', row, 'cost', cost, { ...labels, try: i + 1 }),
      number('check', `${row} check`, 'queued', queued / 2, { ...labels, try: i + 1 }),
      number('check', `${row} check`, 'ran', ran / 4, { ...labels, try: i + 1 }),
    ]),
    number('step', row, 'tries', tries.length, labels),
  ];
};

/** The seeded run's timeline: two steps, the first of two tries, two rounds of its loop, and the run's wall time and waits. */
const TIMELINE: SpanSeed[] = [
  ...stepNumbers(IMPLEMENT, '02 implement', [
    [4_000, 900_000, 12.5],
    [2_000, 300_000, 4],
  ]),
  ...stepNumbers(REVIEW, '03 review', [[1_000, 240_000, 3.25]]),
  number('round', 'review round 01', 'wall', 1_500_000),
  number('round', 'review round 02', 'wall', 600_000),
  number('run', 'run', 'wall', 2_400_000),
  number('run', 'run', 'queued', 7_000),
  number('run', 'run', 'check', 360_000),
  number('run', 'run', 'gate', 120_000),
];

/** One of the largest runs of a sweep of the store's disk, as the daemon's span of it: the run and the bytes it holds. */
const largest = (run: string, value: number): SpanSeed => ({
  name: 'disk.run',
  ago: 20_000,
  took: 0,
  attributes: { factory: 'nemia', run, value },
});

/** A tool call of a session's turn, by its tool, with its command when it is a Bash call that says one, and its wait on a permission. */
const tool = (labels: Record<string, string>, ago: number, took: number, name: string, command?: string): SpanSeed => ({
  name: 'claude_code.tool',
  ago,
  took,
  attributes: { ...labels, tool_name: name, ...(command === undefined ? {} : { full_command: command }) },
  children: [
    { name: 'claude_code.tool.blocked_on_user', ago, took: 400, attributes: labels },
    { name: 'claude_code.tool.execution', ago: ago - 400, took: took - 400, attributes: labels },
  ],
});

/** One turn of `step`'s session in the seeded run: a model request and five tool calls, which leave some of the turn uncovered. */
function turn(step: typeof IMPLEMENT): SpanSeed {
  const labels = { ...step, run: RUN, task: taskOf(step) };
  return {
    name: 'claude_code.interaction',
    ago: 50_000,
    took: 44_000,
    attributes: labels,
    children: [
      { name: 'claude_code.llm_request', ago: 49_000, took: 12_000, attributes: labels },
      tool(labels, 36_000, 2_000, 'Read'),
      tool(labels, 33_000, 1_500, 'Grep'),
      tool(labels, 31_000, 9_000, 'Bash', 'npm test'),
      tool(labels, 21_000, 5_000, 'Bash', 'node --test test/a.test.ts'),
      tool(labels, 15_000, 1_000, 'Bash'),
    ],
  };
}

/** A failed `tool_result` of `step`'s session: `count` of them, by `name` when the event says its tool, with its parameters when given. */
const failed = (step: typeof IMPLEMENT, count: number, name?: string, parameters?: string): LogSeed[] =>
  Array.from({ length: count }, (_, i) => ({
    body: 'claude_code.tool_result',
    ago: 40_000 - i * 1_000,
    attributes: {
      ...step,
      run: RUN,
      task: taskOf(step),
      'event.name': 'tool_result',
      success: 'false',
      ...(name === undefined ? {} : { tool_name: name }),
      ...(parameters === undefined ? {} : { tool_parameters: parameters }),
    },
  }));

/** A metric kept by step: each of `values` a series of `IMPLEMENT` or `REVIEW` with an outcome. */
const bySteps = (name: string, kind: MetricSeed['kind'], values: [typeof IMPLEMENT, string, number][]): MetricSeed => ({
  name,
  kind,
  series: values.map(([step, outcome, value]) => [{ ...step, outcome }, value]),
});

/** A metric with one series and no attribute. */
const lone = (name: string, kind: MetricSeed['kind'], value: number): MetricSeed => ({ name, kind, series: [[{}, value]] });

/** What the daemon says in the seed. */
const DAEMON: ServiceSeed = {
  service: 'nemia',
  spans: [
    ...[55, 45, 35, 25, 15, 5].map((s, i) => pass(s * 1000, 150 + i * 30, i % 2 ? OTHER_RUN : RUN)),
    filing(IMPLEMENT, 52_000, ['filed', 'started', 'ended']),
    filing(REVIEW, 30_000, ['filed', 'started']),
    denied(IMPLEMENT, 40_000, 'Bash', 'Bash(git push)'),
    denied(IMPLEMENT, 38_000, 'Bash', 'Bash(git push)'),
    denied(IMPLEMENT, 36_000, 'Skill', 'Skill(md3-spec)'),
    denied(REVIEW, 20_000, 'Bash', 'Bash(npm test)'),
    denied(REVIEW, 18_000, 'mcp__playwright__browser_navigate', 'mcp__playwright__browser_navigate'),
    ...TIMELINE,
    largest(RUN, 269_000_000),
    largest(OTHER_RUN, 41_500_000),
    wait('step.queue', IMPLEMENT, 58_000, 4_000, 'done'),
    wait('step.check', IMPLEMENT, 34_000, 9_000, 'refused'),
    wait('step.check', IMPLEMENT, 24_000, 8_000, 'passed'),
    wait('step.gate', REVIEW, 12_000, 6_000, 'done'),
  ],
  logs: [
    { body: 'implement filed', ago: 52_000, attributes: { run: RUN, step: 'implement' } },
    { body: 'implement ended: done', ago: 31_000, attributes: { run: RUN, step: 'implement' } },
    { body: 'review filed', ago: 30_000, attributes: { run: RUN, step: 'review' } },
    { body: 'another run, never shown for the seeded one', ago: 29_000, attributes: { run: OTHER_RUN, step: 'design' } },
  ],
  metrics: [
    restarted(lone('pass.duration', 'histogram', 180)),
    restarted({
      name: 'pass.phase.duration',
      kind: 'histogram',
      series: ['records', 'place', 'assess'].map((phase, i) => [{ phase }, 20 + i * 40]),
    }),
    restarted(lone('pass.journal_reads', 'histogram', 12)),
    lone('store.runs', 'gauge', 24),
    lone('sessions.queued', 'gauge', 2),
    lone('sessions.admitted', 'gauge', 5),
    lone('admission.wait', 'gauge', 1500),
    lone('machine.load', 'gauge', 0.6),
    {
      name: 'disk.bytes',
      kind: 'gauge',
      series: [
        [{ part: 'worktrees', kind: 'checkout', factory: 'nemia' }, 1_900_000_000],
        [{ part: 'worktrees', kind: 'dependencies', factory: 'nemia' }, 1_000_000_000],
        [{ part: 'runs', kind: 'pictures', factory: 'nemia' }, 7_400_000_000],
        [{ part: 'runs', kind: 'handed', factory: 'nemia' }, 1_400_000_000],
        [{ part: 'runs', kind: 'agents', factory: 'nemia' }, 180_000_000],
        [{ part: 'runs', kind: 'inputs', factory: 'nemia' }, 16_000_000],
        [{ part: 'runs', kind: 'records', factory: 'nemia' }, 22_000_000],
        [{ part: 'runs', kind: 'marks', factory: 'nemia' }, 9_000_000],
        [{ part: 'runs', kind: 'pictures', factory: 'pipao' }, 450_000_000],
        [{ part: 'runs', kind: 'handed', factory: 'pipao' }, 150_000_000],
        [{ part: 'runs', kind: 'runs-other' }, 130_000_000],
        [{ part: 'engine', kind: 'engine-other' }, 1_000_000_000],
        [{ part: 'engine', kind: 'journals' }, 200_000_000],
        [{ part: 'engine', kind: 'session-output', factory: 'nemia' }, 2_700_000_000],
        [{ part: 'engine', kind: 'check-output', factory: 'nemia' }, 1_000_000_000],
        [{ part: 'engine', kind: 'session-files', factory: 'nemia' }, 160_000_000],
        [{ part: 'engine', kind: 'journals', factory: 'nemia' }, 85_000_000],
        [{ part: 'engine', kind: 'bodies', factory: 'nemia' }, 55_000_000],
        [{ part: 'engine', kind: 'session-output', factory: 'pipao' }, 200_000_000],
        [{ part: 'engine', kind: 'check-output', factory: 'pipao' }, 100_000_000],
        [{ part: 'sessions', kind: 'harness-records' }, 400_000_000],
        [{ part: 'sessions', kind: 'harness-records', factory: 'nemia' }, 4_600_000_000],
        [{ part: 'sessions', kind: 'harness-records', factory: 'pipao' }, 200_000_000],
        [{ part: 'checks', kind: 'checks' }, 118_000_000],
        [{ part: 'series', kind: 'series' }, 20_000_000],
        [{ part: 'other', kind: 'other' }, 4_000_000],
      ],
    },
    {
      name: 'disk.unread',
      kind: 'gauge',
      series: [
        [{ part: 'runs' }, 0],
        [{ part: 'engine' }, 2],
      ],
    },
    lone('disk.free', 'gauge', 953_000_000_000),
    lone('disk.size', 'gauge', 1_007_000_000_000),
    lone('feed.followers', 'gauge', 2),
    restarted(lone('feed.follow.beats', 'total', 40)),
    restarted(lone('feed.follow.reads', 'total', 12)),
    restarted(lone('api.step.follows', 'total', 6)),
    { name: 'api.poll.reads', kind: 'histogram', series: ['/api/runs', '/api/runs/:id'].map((route, i) => [{ route }, 3 + i * 4]) },
    lone('subscription.wakes', 'counter', 9),
    lone('subscription.digests', 'counter', 4),
    lone('subscription.digest.checks', 'counter', 7),
    lone('subscription.say.failures', 'counter', 1),
    lone('nemia.acts', 'counter', 3),
    bySteps('step.cost', 'total', [
      [IMPLEMENT, 'done', 4.2],
      [REVIEW, 'done', 2.1],
    ]),
    bySteps('step.tokens.input', 'total', [
      [IMPLEMENT, 'done', 52_000],
      [REVIEW, 'done', 18_000],
    ]),
    bySteps('step.tokens.output', 'total', [
      [IMPLEMENT, 'done', 9_000],
      [REVIEW, 'done', 4_000],
    ]),
    bySteps('step.duration', 'histogram', [
      [IMPLEMENT, 'done', 900_000],
      [REVIEW, 'done', 60_000],
      [DESIGN, 'done', 5_000],
    ]),
    bySteps('step.tries', 'total', [
      [IMPLEMENT, 'done', 3],
      [IMPLEMENT, 'failed', 1],
      [REVIEW, 'done', 2],
    ]),
    bySteps('step.checks', 'total', [
      [IMPLEMENT, 'passed', 2],
      [IMPLEMENT, 'refused', 1],
    ]),
    bySteps('step.rounds', 'total', [
      [REVIEW, 'passed', 1],
      [REVIEW, 'refused', 2],
    ]),
    bySteps('step.queue.duration', 'histogram', [
      [IMPLEMENT, 'done', 4_000],
      [REVIEW, 'done', 30_000],
    ]),
    bySteps('step.check.duration', 'histogram', [
      [IMPLEMENT, 'passed', 480_000],
      [IMPLEMENT, 'refused', 50_000],
      [REVIEW, 'passed', 8_000],
    ]),
    bySteps('step.gate.wait', 'histogram', [
      [IMPLEMENT, 'done', 60_000],
      [REVIEW, 'done', 600_000],
    ]),
  ],
};

/** What `step`'s session says in the seed, and the failed `tool_result` events it is given. */
const session = (step: typeof IMPLEMENT, logs: LogSeed[]): ServiceSeed => ({
  service: SESSIONS,
  resource: { ...step, run: RUN, task: taskOf(step) },
  spans: [turn(step)],
  logs,
  metrics: [],
});

/**
 * The whole seed: the daemon, and the sessions of two steps, thirteen failed tool results between them: seven of the `Bash` tool,
 * four in one step and three in the other, and six of other tools, one with no tool named.
 */
export const SEED: ServiceSeed[] = [
  DAEMON,
  session(IMPLEMENT, [
    ...failed(IMPLEMENT, 4, 'Bash'),
    ...failed(IMPLEMENT, 2, 'Read'),
    ...failed(IMPLEMENT, 1, 'Skill', '{"skill":"md3-spec"}'),
    ...failed(IMPLEMENT, 1),
    { ...failed(IMPLEMENT, 1, 'Bash')[0], attributes: { ...failed(IMPLEMENT, 1, 'Bash')[0].attributes, success: 'true' } },
  ]),
  session(REVIEW, [
    ...failed(REVIEW, 3, 'Bash'),
    ...failed(REVIEW, 1, 'Skill', '{"skill":"look"}'),
    ...failed(REVIEW, 1, 'Skill', '{"skill":"md3-spec"}'),
  ]),
];

/** A panel no fixture meets, by its dashboard's file name and its title, with why. */
export const UNSEEDED: { dashboard: string; panel: string; why: string }[] = [
  {
    dashboard: 'system',
    panel: 'CPU, over the range',
    why: 'a profile is the profiler preload’s own format, sent to Pyroscope, which the render publishes no port of',
  },
  {
    dashboard: 'system',
    panel: 'Heap in use, over the range',
    why: 'a profile is the profiler preload’s own format, sent to Pyroscope, which the render publishes no port of',
  },
];

/** How many samples each metric series is given, and how far apart, ending at the stamp: enough for a rate over a minute. */
const POINTS = 13;
const POINT_GAP_MS = 15_000;

/** The upper bounds every seeded histogram is kept by. */
const BOUNDS = [10, 100, 1_000, 10_000, 100_000, 1_000_000];

/** `ms` since the epoch as OTLP's nanoseconds. */
const nanos = (ms: number): string => `${Math.round(ms)}000000`;

/** `attributes` as OTLP's list of values: a word a string's, a number a double's. */
const listed = (attributes: SpanAttributes): { key: string; value: { stringValue: string } | { doubleValue: number } }[] =>
  Object.entries(attributes).map(([key, value]) => ({
    key,
    value: typeof value === 'number' ? { doubleValue: value } : { stringValue: value },
  }));

/** A resource of `service`, with its own attributes. */
const resourceOf = (seed: ServiceSeed): { attributes: ReturnType<typeof listed> } => ({
  attributes: listed({ 'service.name': seed.service, ...seed.resource }),
});

/** Hex ids that differ at each call, `width` characters, from a counter of the stamp's own. */
const ids = (now: number): ((width: number) => string) => {
  let next = 0;
  return (width) => (BigInt(now) * 1_000_000n + BigInt((next += 1))).toString(16).padStart(width, '0').slice(-width);
};

/** `span` and every span under it as OTLP spans of one trace, stamped against `now`. */
function spansOf(span: SpanSeed, now: number, id: (width: number) => string, traceId = id(32), parentSpanId?: string): object[] {
  const spanId = id(16);
  const start = now - span.ago;
  const own = {
    traceId,
    spanId,
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
    name: span.name,
    kind: 1,
    startTimeUnixNano: nanos(start),
    endTimeUnixNano: nanos(start + span.took),
    attributes: listed(span.attributes),
  };
  return [own, ...(span.children ?? []).flatMap((child) => spansOf(child, now, id, traceId, spanId))];
}

/** The sample at which a restarted series' second process begins, born at zero. */
const RESTART = Math.floor(POINTS / 2);

/**
 * The data points of one metric series, a sample every `POINT_GAP_MS` up to `now`, growing to `value` unless it is a gauge; a series
 * `restarted` grows to it twice, from zero at the first sample and again at `RESTART`, its second process started there.
 */
function pointsOf(metric: MetricSeed, attributes: Record<string, string>, value: number, now: number): object[] {
  const { kind } = metric;
  const timeOf = (i: number) => now - (POINTS - 1 - i) * POINT_GAP_MS;
  const bucket = BOUNDS.findIndex((bound) => value <= bound);
  return Array.from({ length: POINTS }, (_, i) => {
    const second = metric.restarted === true && i >= RESTART;
    const n = second ? i - RESTART : i;
    const of = metric.restarted === true ? (second ? POINTS - 1 - RESTART : RESTART - 1) : POINTS - 1;
    const at = {
      attributes: listed(attributes),
      startTimeUnixNano: nanos(second ? timeOf(RESTART) : now - POINTS * POINT_GAP_MS),
      timeUnixNano: nanos(timeOf(i)),
    };
    if (kind === 'gauge') return { ...at, asDouble: value };
    if (kind !== 'histogram') return { ...at, asDouble: (value * n) / of };
    const counts = [...BOUNDS, Infinity].map((_, at) => String(at === (bucket < 0 ? BOUNDS.length : bucket) ? n : 0));
    return { ...at, count: String(n), sum: value * n, bucketCounts: counts, explicitBounds: BOUNDS };
  });
}

/** One metric of the seed as OTLP's, stamped against `now`. */
function metricOf(metric: MetricSeed, now: number): object {
  const dataPoints = metric.series.flatMap(([attributes, value]) => pointsOf(metric, attributes, value, now));
  if (metric.kind === 'gauge') return { name: metric.name, unit: '1', gauge: { dataPoints } };
  if (metric.kind === 'histogram') return { name: metric.name, histogram: { aggregationTemporality: 2, dataPoints } };
  return { name: metric.name, sum: { aggregationTemporality: 2, isMonotonic: metric.kind === 'total', dataPoints } };
}

/** The seed as the three OTLP/HTTP JSON bodies a collector takes, every time in it counted back from `now`, milliseconds. */
export function stamped(seed: readonly ServiceSeed[], now: number): { traces: object; logs: object; metrics: object } {
  const id = ids(now);
  const scope = { name: 'seed' };
  return {
    traces: {
      resourceSpans: seed.map((s) => ({
        resource: resourceOf(s),
        scopeSpans: [{ scope, spans: s.spans.flatMap((span) => spansOf(span, now, id)) }],
      })),
    },
    logs: {
      resourceLogs: seed.map((s) => ({
        resource: resourceOf(s),
        scopeLogs: [
          {
            scope,
            logRecords: s.logs.map((log) => ({
              timeUnixNano: nanos(now - log.ago),
              severityNumber: 9,
              severityText: 'Info',
              body: { stringValue: log.body },
              attributes: listed(log.attributes),
            })),
          },
        ],
      })),
    },
    metrics: {
      resourceMetrics: seed
        .filter((s) => s.metrics.length)
        .map((s) => ({ resource: resourceOf(s), scopeMetrics: [{ scope, metrics: s.metrics.map((metric) => metricOf(metric, now)) }] })),
    },
  };
}

/** Post the seed, stamped now, to the collector at `otlp`; the stamp, milliseconds since the epoch. */
export async function post(otlp: string, seed: readonly ServiceSeed[] = SEED): Promise<number> {
  const now = Date.now();
  const bodies = stamped(seed, now);
  await asked(`${otlp}/v1/metrics`, bodies.metrics);
  await asked(`${otlp}/v1/logs`, bodies.logs);
  await asked(`${otlp}/v1/traces`, bodies.traces);
  return now;
}

/** What a render opens every dashboard on: the range in milliseconds since the epoch, and the seeded run and session. */
export type Picks = { from: number; to: number; run: string; session: string };

/** The longest step a panel asks its chart in (`interval` in a dashboard's file): a chart's points fall on its multiples. */
const LONGEST_STEP_MS = 5 * 60_000;

/**
 * The picks of a seed stamped `seededAt` and looked at `now`: from a quarter of an hour before the stamp to the first multiple of
 * `LONGEST_STEP_MS` after now, so that a chart stepped that far has a point after the seed; the seeded run, every session.
 */
export const picks = (seededAt: number, now: number): Picks => ({
  from: seededAt - 15 * 60_000,
  to: Math.ceil(now / LONGEST_STEP_MS) * LONGEST_STEP_MS,
  run: RUN,
  session: '$__all',
});

/** How long `arrived` waits for each store, in seconds. */
export const ARRIVAL_SECONDS = 180;

/** One store's question through Grafana's datasource proxy, answered once the seed is in it. */
type Arrival = { what: string; path: () => string; there: (answer: unknown) => boolean };

/** The first number an instant query's vector holds, 0 when it holds none. */
const firstValue = (answer: unknown): number =>
  Number((answer as { data?: { result?: { value?: [number, string] }[] } }).data?.result?.[0]?.value?.[1] ?? 0);

/** An instant query of the store `uid`, asked now. */
const instant = (uid: string, api: string, query: string) => (): string => `${uid}/${api}?query=${encodeURIComponent(query)}`;

/** The questions that say the seed arrived: a daemon's metric, its denied calls and its timeline, a log, and Tempo's span metrics. */
const ARRIVALS: Arrival[] = [
  {
    what: "the daemon's metrics in Prometheus",
    path: instant('prometheus', 'api/v1/query', 'sum(increase(step_tries_total{service_name="nemia"}[10m]))'),
    there: (answer) => firstValue(answer) > 0,
  },
  {
    what: 'the denied calls in Tempo',
    path: () => `tempo/api/search?limit=20&q=${encodeURIComponent('{name="step.denied"}')}`,
    there: (answer) => ((answer as { traces?: unknown[] }).traces?.length ?? 0) >= 5,
  },
  {
    what: "the run's timeline in Tempo",
    path: () => `tempo/api/search?limit=20&q=${encodeURIComponent('{name="run.timeline"}')}`,
    there: (answer) => ((answer as { traces?: unknown[] }).traces?.length ?? 0) >= 20,
  },
  {
    what: 'the tool results in Loki',
    path: instant('loki', 'loki/api/v1/query', 'sum(count_over_time({service_name="claude-code"} | success="false" [10m]))'),
    there: (answer) => firstValue(answer) >= 13,
  },
  {
    what: "Tempo's span metrics in Prometheus",
    path: instant('prometheus', 'api/v1/query', 'sum(traces_spanmetrics_calls_total{service="claude-code"})'),
    there: (answer) => firstValue(answer) > 0,
  },
];

/** The question that says the span metrics grew: what a panel over a range reads, an increase. */
const GREW: Arrival = {
  what: "an increase of Tempo's span metrics in Prometheus",
  path: instant('prometheus', 'api/v1/query', 'sum(increase(traces_spanmetrics_latency_sum{service="claude-code"}[10m]))'),
  there: (answer) => firstValue(answer) > 0,
};

/**
 * Wait until the seed answers a query in each store, asked through Grafana at `grafana`: for the event, bounded at `seconds` each,
 * never for a length of time. Tempo's generator writes a span-metric series at its first value, a few seconds after the spans, and a
 * panel reads its increase: so once the series is there, the sessions' turns are posted to `otlp` a second time, and the wait ends
 * when the increase is above zero.
 */
export async function arrived(
  grafana: string,
  otlp: string,
  seed: readonly ServiceSeed[] = SEED,
  seconds = ARRIVAL_SECONDS,
): Promise<void> {
  const wait = ({ what, path, there }: Arrival): Promise<boolean> =>
    awaited(what, seconds, async () => (there(await asked(`${grafana}/api/datasources/proxy/uid/${path()}`)) ? true : undefined));
  for (const arrival of ARRIVALS) await wait(arrival);
  const sessions = seed.filter((s) => s.service === SESSIONS).map((s) => ({ ...s, logs: [], metrics: [] }));
  await asked(`${otlp}/v1/traces`, stamped(sessions, Date.now()).traces);
  await wait(GREW);
}
