/**
 * The pass's meter, on the engine: each of its verbs counted in its phase (`meteredEngine`), a pass's cost from those counts and the
 * runtime's totals before and after it (`costOf`), and that cost put into the process's metrics (`recordPassMetrics`), beside the facts
 * of the steps it saw settle (`recordStepMetrics`). A controller, wrapping the engine whose type the client gives (`runtime-client.ts`).
 */
import { Effect, Metric } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { addRuntime, asideEffect, withinEffect, type Tallies } from './tally.store.ts';
import { PASS_BOUNDS, passCost, READ_BOUNDS, PHASES, type HarnessCost, type PassCost, type Phase } from './meter.ts';
import { boundedAttributes, type StepFact } from './step.ts';

/**
 * The phase each of the engine's verbs is counted in: its pass is the runtime's, a read of a journal is `journals`, a verb that changes a
 * task is `act`.
 */
const ENGINE_PHASES: Readonly<Record<string, Phase>> = {
  tick: 'runtime',
  view: 'journals',
  list: 'journals',
  feed: 'journals',
  sweep: 'journals',
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

/** A pass's cost put into the pass's metrics (`PASS_METRICS`). */
export const recordPassMetrics = Effect.fn('recordPassMetrics')(function* (cost: PassCost) {
  yield* Metric.update(PASS_METRICS.duration, cost.ms);
  for (const phase of PHASES) yield* Metric.update(Metric.withAttributes(PASS_METRICS.phase, { phase }), cost.phases[phase].ms);
  yield* Metric.update(PASS_METRICS.reads, cost.phases.journals.reads);
  yield* Metric.update(PASS_METRICS.runs, cost.runs);
  yield* Metric.update(PASS_METRICS.queued, cost.queued);
  yield* Metric.update(PASS_METRICS.admitted, cost.admitted);
  yield* Metric.update(PASS_METRICS.wait, cost.waitMs);
  yield* Metric.update(PASS_METRICS.load, cost.load);
});

/** A step's time, in ms: a minute to two hours, the span a session runs in. */
const STEP_BOUNDS = [60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000];

/**
 * The metrics of a step, each by the attributes of `stepAttributes` alone: what its settled sessions cost (`step.cost`, USD, where
 * measured), their tokens (`step.tokens.input`, `step.tokens.output`, where measured) and their time (`step.duration`, ms); the sessions
 * by how they ended (`step.tries`), the checks by their verdict (`step.checks`), the rounds granted and run out of (`step.rounds`), and
 * the calls a harness denied (`step.denied`). Each counter only grows, so a collector reads it as one.
 */
export const STEP_METRICS = {
  cost: Metric.counter('step.cost', { description: "a step's settled sessions' cost, in USD", incremental: true }),
  input: Metric.counter('step.tokens.input', { description: "a step's settled sessions' input tokens", incremental: true }),
  output: Metric.counter('step.tokens.output', { description: "a step's settled sessions' output tokens", incremental: true }),
  duration: Metric.histogram('step.duration', { description: "a step's settled session's time, in ms", boundaries: STEP_BOUNDS }),
  tries: Metric.counter('step.tries', { description: "a step's sessions settled, by outcome", incremental: true }),
  checks: Metric.counter('step.checks', { description: "a step's checks settled, by verdict", incremental: true }),
  rounds: Metric.counter('step.rounds', { description: "a loop's rounds granted or exhausted", incremental: true }),
  denied: Metric.counter('step.denied', { description: "the calls a step's harness denied its sessions", incremental: true }),
} as const;

/** `value` into `metric`, by the fact's attributes, refused if one is not a step's (`boundedAttributes`). */
const into = <In, Out>(metric: Metric.Metric<In, Out>, attributes: Record<string, string>, value: In) =>
  Metric.update(Metric.withAttributes(metric, boundedAttributes(attributes)), value);

/** One fact into the metrics: a session's tally, cost, tokens, time and denials; a check's or a round's count. */
function recordFact(fact: StepFact): Effect.Effect<void> {
  const { attributes } = fact;
  if (fact.metric !== 'try') return into(fact.metric === 'check' ? STEP_METRICS.checks : STEP_METRICS.rounds, attributes, 1);
  return Effect.all(
    [
      into(STEP_METRICS.tries, attributes, 1),
      into(STEP_METRICS.duration, attributes, fact.ms),
      ...(fact.costUsd !== undefined ? [into(STEP_METRICS.cost, attributes, fact.costUsd)] : []),
      ...(fact.inputTokens !== undefined ? [into(STEP_METRICS.input, attributes, fact.inputTokens)] : []),
      ...(fact.outputTokens !== undefined ? [into(STEP_METRICS.output, attributes, fact.outputTokens)] : []),
      ...(fact.denied ? [into(STEP_METRICS.denied, attributes, fact.denied)] : []),
    ],
    { discard: true },
  );
}

/** The facts a pass read of its runs' steps, each recorded once into the step's metrics (`STEP_METRICS`). */
export const recordStepMetrics = Effect.fn('recordStepMetrics')(function* (facts: readonly StepFact[]) {
  for (const fact of facts) yield* recordFact(fact);
});
