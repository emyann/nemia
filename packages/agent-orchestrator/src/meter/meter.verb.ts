/**
 * The pass's meter, on the engine: each of its verbs counted in its phase (`meteredEngine`), a pass's cost from those counts and the
 * runtime's totals before and after it (`costOf`), and that cost put into the process's metrics (`recordPassMetrics`), beside the facts
 * of the steps it saw settle (`recordStepMetrics`), each series of theirs exported at zero before its first value (`seriesBorn`), as the
 * pass's own are once a daemon holds the store (`PASS_SERIES`). A controller, wrapping
 * the engine whose type the client gives (`runtime-client.ts`).
 */
import { Context, Effect, Exit, Metric, Option } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { addRuntime, asideEffect, withinEffect, type Tallies } from './tally.store.ts';
import { PASS_BOUNDS, passCost, READ_BOUNDS, PHASES, type HarnessCost, type PassCost, type Phase } from './meter.ts';
import { exportedNow, seriesBorn } from '../telemetry/telemetry.store.ts';
import { boundedAttributes, type DeniedFact, type StepFact, type TimelineFact, type Wait, type WaitFact } from './step.ts';

/**
 * The phase each of the engine's verbs is counted in: its pass is the runtime's, a read of a journal is `journals`, a verb that changes a
 * task is `act`.
 */
const ENGINE_PHASES: Readonly<Record<string, Phase>> = {
  tick: 'runtime',
  mcpState: 'runtime',
  mcpSignIn: 'runtime',
  mcpSignInState: 'runtime',
  mcpSignOut: 'runtime',
  view: 'journals',
  list: 'journals',
  feed: 'journals',
  sweep: 'journals',
  kept: 'journals',
  logs: 'journals',
  output: 'journals',
  transcript: 'journals',
  file: 'act',
  admit: 'act',
  stop: 'act',
  close: 'act',
  answer: 'act',
  say: 'act',
  removeBody: 'act',
  forget: 'act',
};

type EngineIo = Effect.Success<ReturnType<Engine['io']>>;

/** The runtime's running totals, or undefined for an engine that keeps none (a test's fake). */
export const ioOf = (e: Engine): Effect.Effect<EngineIo | undefined> => (typeof e.io === 'function' ? e.io() : Effect.succeed(undefined));

/**
 * `program` in a tally of the runtime's own (`Engine.tallied`), so that the totals `ioOf` reads inside it are the program's work alone,
 * never a read another caller of the engine makes while it waits; as it is, for an engine that keeps no tally (a test's fake).
 */
export const talliedIn = <A, E, R>(e: Engine, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  typeof e.tallied === 'function' ? e.tallied(program) : program;

/**
 * Each harness's observes between two of the runtime's totals, for a harness observed in between; `unread` only where some observe could
 * not read, and read as none from totals that carry no count of it.
 */
const observedBetween = (before: EngineIo | undefined, after: EngineIo | undefined): Record<string, HarnessCost> =>
  Object.fromEntries(
    Object.entries(after?.observed ?? {}).flatMap(([name, o]): Array<[string, HarnessCost]> => {
      const b = before?.observed[name] ?? { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 };
      const unread = (o.unread ?? 0) - (b.unread ?? 0);
      return o.calls > b.calls
        ? [
            [
              name,
              {
                calls: o.calls - b.calls,
                ms: o.ms - b.ms,
                listed: o.listed - b.listed,
                spawned: o.spawned - b.spawned,
                ...(unread > 0 ? { unread } : {}),
              },
            ],
          ]
        : [];
    }),
  );

/**
 * One call to the engine, counted in its phase — and what the runtime reported of it added there: the bytes it read and the processes it
 * started, with the time its harnesses' observes took moved to `observe`. A pass observes its harnesses at once, so its observe took the
 * slowest's time; a view observes the one harness of its task.
 */
const engineCall = <A, E>(e: Engine, verb: string, phase: Phase, call: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const before = yield* asideEffect(ioOf(e));
    return yield* withinEffect(phase, call).pipe(
      Effect.ensuring(
        asideEffect(
          Effect.map(ioOf(e), (after) => {
            if (!before || !after) return;
            const seen = Object.values(observedBetween(before, after));
            const ms = verb === 'tick' ? Math.max(0, ...seen.map((o) => o.ms)) : seen.reduce((n, o) => n + o.ms, 0);
            addRuntime(
              phase,
              { bytes: after.bytesRead - before.bytesRead, reads: after.reads - before.reads, spawned: after.spawned - before.spawned },
              { ms, calls: seen.reduce((n, o) => n + o.calls, 0), spawned: seen.reduce((n, o) => n + o.spawned, 0) },
            );
          }),
        ),
      ),
    );
  });

/** The engine, each verb counted in its phase (`engineCall`); anything else passed through as it is. */
export const meteredEngine = (e: Engine): Engine =>
  new Proxy(e, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      const phase = typeof key === 'string' ? ENGINE_PHASES[key] : undefined;
      if (!phase || typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        engineCall(
          target,
          key as string,
          phase,
          Effect.suspend(() => (value as (...a: unknown[]) => Effect.Effect<unknown>).apply(target, args)),
        );
    },
  });

/** A pass's cost from its counts and the runtime's totals before and after it. */
export const costOf = (t: Tallies, ms: number, before: EngineIo | undefined, after: EngineIo | undefined): PassCost =>
  passCost({
    at: new Date().toISOString(),
    ms,
    phases: t.kinds,
    harnesses: observedBetween(before, after),
    records: t.records,
    rested: t.rested,
    ...t.seen,
    overheadMs: t.overheadMs,
  });

/**
 * The metrics of the pass, in the registry of whoever runs it — the process's own unless a test gives another: its time and each phase's
 * (`pass.duration`, `pass.phase.duration` by `phase`, ms over `PASS_BOUNDS`), its journal reads of bytes (`pass.journal_reads`, as
 * `PhaseCost` counts a read), and what the last pass saw: the runs in the store (`store.runs`), the sessions queued and admitted
 * (`sessions.queued`, `sessions.admitted`), how long the oldest queued has waited (`admission.wait`, ms), and the machine's load per core
 * (`machine.load`).
 */
export const PASS_METRICS = {
  duration: Metric.histogram('pass.duration', { description: 'the time of a tick pass, in ms', boundaries: PASS_BOUNDS }),
  phase: Metric.histogram('pass.phase.duration', { description: "a phase's time in a tick pass, in ms", boundaries: PASS_BOUNDS }),
  reads: Metric.histogram('pass.journal_reads', { description: 'the journals a tick pass read', boundaries: READ_BOUNDS }),
  runs: Metric.gauge('store.runs', { description: 'the runs the store listed to the last pass' }),
  queued: Metric.gauge('sessions.queued', { description: 'the sessions waiting for a slot, as the last pass saw them' }),
  admitted: Metric.gauge('sessions.admitted', { description: 'the sessions holding a slot, as the last pass saw them' }),
  wait: Metric.gauge('admission.wait', { description: 'how long the oldest queued session had waited at the last pass, in ms' }),
  load: Metric.gauge('machine.load', { description: "the machine's load over the last minute per core, at the last pass" }),
} as const;

/** The series of `pass.phase.duration` for `phase`. */
const phaseSeries = (phase: Phase) => Metric.withAttributes(PASS_METRICS.phase, { phase });

/**
 * The pass's series a collector reads by their increase, each a histogram (`PASS_METRICS`): its time, each phase's (`PHASES`) and its
 * journal reads — the ones a daemon births at zero once it holds the store (`seriesBorn`, `up`). The gauges are read as they stand.
 */
export const PASS_SERIES = [PASS_METRICS.duration, ...PHASES.map(phaseSeries), PASS_METRICS.reads] as const;

/** A pass's cost put into the pass's metrics (`PASS_METRICS`). */
export const recordPassMetrics = Effect.fn('recordPassMetrics')(function* (cost: PassCost) {
  yield* Metric.update(PASS_METRICS.duration, cost.ms);
  for (const phase of PHASES) yield* Metric.update(phaseSeries(phase), cost.phases[phase].ms);
  yield* Metric.update(PASS_METRICS.reads, cost.phases.journals.reads);
  yield* Metric.update(PASS_METRICS.runs, cost.runs);
  yield* Metric.update(PASS_METRICS.queued, cost.queued);
  yield* Metric.update(PASS_METRICS.admitted, cost.admitted);
  yield* Metric.update(PASS_METRICS.wait, cost.waitMs);
  yield* Metric.update(PASS_METRICS.load, cost.load);
});

/** A step's time, in ms: a minute to two hours, the span a session runs in. */
const STEP_BOUNDS = [60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000];

/** A wait in the queue or a check's run, in ms: a second to two hours, since a check or a free slot takes seconds. */
export const WAIT_BOUNDS = [1_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000, 7_200_000];

/** A person's wait at a gate, in ms: a minute to a day, since a person may answer the next morning. */
export const GATE_BOUNDS = [60_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 14_400_000, 28_800_000, 43_200_000, 86_400_000];

/**
 * The metrics of a step, each by the attributes of `stepAttributes` alone: what its settled sessions cost (`step.cost`, USD, where
 * measured), their tokens (`step.tokens.input`, `step.tokens.output`, where measured) and their time (`step.duration`, ms); the sessions
 * by how they ended (`step.tries`), the checks by their verdict (`step.checks`) and the rounds granted and run out of (`step.rounds`);
 * and the waits outside its sessions (`WaitFact`): a session's in the queue (`step.queue.duration`), its check's run by verdict
 * (`step.check.duration`), both over `WAIT_BOUNDS`, and a person's at its gate (`step.gate.wait`, over `GATE_BOUNDS`), each in ms. Each
 * counter only grows, so a collector reads it as one. A call a harness denied is none of them: it is a span (`DENIED_SPAN`).
 */
export const STEP_METRICS = {
  cost: Metric.counter('step.cost', { description: "a step's settled sessions' cost, in USD", incremental: true }),
  input: Metric.counter('step.tokens.input', { description: "a step's settled sessions' input tokens", incremental: true }),
  output: Metric.counter('step.tokens.output', { description: "a step's settled sessions' output tokens", incremental: true }),
  duration: Metric.histogram('step.duration', { description: "a step's settled session's time, in ms", boundaries: STEP_BOUNDS }),
  tries: Metric.counter('step.tries', { description: "a step's sessions settled, by outcome", incremental: true }),
  checks: Metric.counter('step.checks', { description: "a step's checks settled, by verdict", incremental: true }),
  rounds: Metric.counter('step.rounds', { description: "a loop's rounds granted or exhausted", incremental: true }),
  queue: Metric.histogram('step.queue.duration', {
    description: "a step's session's wait from its filing to its spawn, in ms",
    boundaries: WAIT_BOUNDS,
  }),
  check: Metric.histogram('step.check.duration', { description: "a step's check's run, by verdict, in ms", boundaries: WAIT_BOUNDS }),
  gate: Metric.histogram('step.gate.wait', {
    description: "a step's wait for a person's approval at its gate, in ms",
    boundaries: GATE_BOUNDS,
  }),
} as const;

/** The span each wait is traced as, its name the one a dashboard reads. */
export const WAIT_SPANS: Readonly<Record<Wait, string>> = { queue: 'step.queue', check: 'step.check', gate: 'step.gate' };

/** The keys a wait's span carries beside its step's attributes: its run and its try, which no histogram is kept by. */
export const WAIT_SPAN_KEYS = ['run', 'try'] as const satisfies ReadonlyArray<keyof WaitFact>;

/** The histogram each wait is measured into. */
const WAIT_METRICS = { queue: STEP_METRICS.queue, check: STEP_METRICS.check, gate: STEP_METRICS.gate } as const;

/** A time in ms since the epoch, as a span's clock reads it: ns. */
const nanos = (at: string): bigint => BigInt(Date.parse(at)) * 1_000_000n;

/** The span each call a harness denied a step's session is traced as, its name the one a dashboard counts. */
export const DENIED_SPAN = 'step.denied';

/**
 * The keys a denied call's span carries beside its step's four labels: its run, its session's task, the tool denied and the call as a
 * permission rule names it, none of which a metric is kept by.
 */
export const DENIED_SPAN_KEYS = ['run', 'task', 'tool', 'call'] as const satisfies ReadonlyArray<keyof DeniedFact>;

/**
 * A span named `name` from `from` to `to`, a root of its own trace, carrying `own` and then `attributes`, refused if one of those is not a
 * step's (`boundedAttributes`): what it says spans passes or belongs to none, so no pass's span is its parent.
 */
export const rootSpan = (
  name: string,
  from: string,
  to: string,
  own: Record<string, string | number>,
  attributes: Record<string, string>,
) =>
  Effect.gen(function* () {
    const bounded = boundedAttributes(attributes);
    const tracer = yield* Effect.tracer;
    const span = tracer.span({
      name,
      parent: Option.none(),
      annotations: Context.empty(),
      links: [],
      startTime: nanos(from),
      kind: 'internal',
      root: true,
      sampled: true,
    });
    for (const [key, value] of Object.entries({ ...own, ...bounded })) span.attribute(key, value);
    span.end(nanos(to), Exit.void);
  });

/**
 * One wait into a span of its own (`WAIT_SPANS`) from when it began to when it ended, a root of its own trace, carrying its run and its
 * try (`WAIT_SPAN_KEYS`) beside its step's attributes: a wait spans passes, so no pass's span is its parent. Its histogram is
 * `writesOf`'s.
 */
const recordWait = (fact: WaitFact): Effect.Effect<void> =>
  rootSpan(WAIT_SPANS[fact.wait], fact.from, fact.to, Object.fromEntries(WAIT_SPAN_KEYS.map((key) => [key, fact[key]])), fact.attributes);

/**
 * One denied call into a span of its own (`DENIED_SPAN`), a root of its own trace, at the moment its attempt ended, carrying its run, its
 * task, its tool and its call (`DENIED_SPAN_KEYS`) beside its step's labels; into no metric, which could carry none of the four.
 */
const recordDenied = (fact: DeniedFact): Effect.Effect<void> =>
  rootSpan(DENIED_SPAN, fact.at, fact.at, Object.fromEntries(DENIED_SPAN_KEYS.map((key) => [key, fact[key]])), fact.attributes);

/** The span each number of a finished run's timeline is traced as, its name the one a dashboard averages. */
export const TIMELINE_SPAN = 'run.timeline';

/**
 * The keys a timeline number's span carries beside its attributes: its run, its try on a try's and a check's row, what it is a number of,
 * its row's name, which number and its value, none of which a metric is kept by.
 */
export const TIMELINE_SPAN_KEYS = ['run', 'try', 'of', 'row', 'part', 'value'] as const satisfies ReadonlyArray<keyof TimelineFact>;

/**
 * One number of a run's timeline into a span of its own (`TIMELINE_SPAN`), a root of its own trace and of no length, at the moment it is
 * recorded, carrying what the fact has of `TIMELINE_SPAN_KEYS` beside its attributes; into no metric, which could carry no row.
 */
const recordTimeline = (fact: TimelineFact): Effect.Effect<void> =>
  Effect.suspend(() => {
    const now = new Date().toISOString();
    const own = Object.fromEntries(TIMELINE_SPAN_KEYS.flatMap((key) => (fact[key] === undefined ? [] : [[key, fact[key]]])));
    return rootSpan(TIMELINE_SPAN, now, now, own, fact.attributes);
  });

/** One value a fact puts into one series: the series, to be born before it (`seriesBorn`), and the value put into it (`said`). */
type Write = { series: Metric.Metric<never, unknown>; said: Effect.Effect<void> };

/** `value` into the counter `metric`, by the fact's attributes, refused if one is not a step's (`boundedAttributes`). */
const counted = (metric: Metric.Counter<number>, attributes: Record<string, string>, value: number): Write => {
  const series = Metric.withAttributes(metric, boundedAttributes(attributes));
  return { series, said: Metric.update(series, value) };
};

/** `value` into the histogram `metric`, by the fact's attributes, refused if one is not a step's (`boundedAttributes`). */
const measured = (metric: Metric.Histogram<number>, attributes: Record<string, string>, value: number): Write => {
  const series = Metric.withAttributes(metric, boundedAttributes(attributes));
  return { series, said: Metric.update(series, value) };
};

/**
 * Each value `fact` puts into the step's metrics (`STEP_METRICS`), the one account of them that both a series' birth and its value are
 * read off: a session's tally and time, and its cost and tokens where measured; a check's or a round's count; a wait's time
 * (`WAIT_METRICS`). None for a denied call and a number of a run's timeline, which are spans alone.
 */
function writesOf(fact: StepFact): Write[] {
  const { attributes } = fact;
  if (fact.metric === 'denied' || fact.metric === 'timeline') return [];
  if (fact.metric === 'wait') return [measured(WAIT_METRICS[fact.wait], attributes, fact.ms)];
  if (fact.metric !== 'try') return [counted(fact.metric === 'check' ? STEP_METRICS.checks : STEP_METRICS.rounds, attributes, 1)];
  return [
    counted(STEP_METRICS.tries, attributes, 1),
    measured(STEP_METRICS.duration, attributes, fact.ms),
    ...(fact.costUsd !== undefined ? [counted(STEP_METRICS.cost, attributes, fact.costUsd)] : []),
    ...(fact.inputTokens !== undefined ? [counted(STEP_METRICS.input, attributes, fact.inputTokens)] : []),
    ...(fact.outputTokens !== undefined ? [counted(STEP_METRICS.output, attributes, fact.outputTokens)] : []),
  ];
}

/** The span of a fact that has one: a wait's (`recordWait`), a denied call's (`recordDenied`), a timeline number's (`recordTimeline`). */
function spanOf(fact: StepFact): Effect.Effect<void> {
  if (fact.metric === 'wait') return recordWait(fact);
  if (fact.metric === 'denied') return recordDenied(fact);
  return fact.metric === 'timeline' ? recordTimeline(fact) : Effect.void;
}

/**
 * The facts a pass read of its runs' steps, each recorded once: into the step's metrics (`writesOf`), and a wait, a denied call and a
 * number of a run's timeline each into its span (`spanOf`).
 *
 * Where a fact writes a metric, each series it writes is first born at zero and exported so (`seriesBorn`), then the values are put in
 * and exported in turn (`exportedNow`). A process that exports nothing waits for none, and facts that are spans alone ask for no export.
 */
export const recordStepMetrics = Effect.fn('recordStepMetrics')(function* (facts: readonly StepFact[]) {
  const writes = facts.flatMap(writesOf);
  yield* seriesBorn(writes.map((write) => write.series));
  for (const write of writes) yield* write.said;
  for (const fact of facts) yield* spanOf(fact);
  if (writes.length) yield* exportedNow;
});
