/**
 * The pass's meter, on the engine: each of its verbs counted in its phase (`meteredEngine`), a pass's cost from those counts and the
 * runtime's totals before and after it (`costOf`), and that cost put into the process's metrics (`recordPassMetrics`). A controller,
 * wrapping the engine whose type the client gives (`runtime-client.ts`).
 */
import { Effect, Metric } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { addRuntime, aside, within, type Tallies } from './tally.store.ts';
import { PASS_BOUNDS, passCost, READ_BOUNDS, PHASES, type HarnessCost, type PassCost, type Phase } from './meter.ts';

/**
 * The phase each of the engine's verbs is counted in: its pass is the runtime's, a read of a journal is `journals`, a verb that changes a
 * task is `act`.
 */
const ENGINE_PHASES: Readonly<Record<string, Phase>> = {
  tick: 'runtime',
  view: 'journals',
  list: 'journals',
  feed: 'journals',
  logs: 'journals',
  output: 'journals',
  transcript: 'journals',
  file: 'act',
  admit: 'act',
  stop: 'act',
  close: 'act',
  answer: 'act',
  say: 'act',
};

type EngineIo = ReturnType<Engine['io']>;

/** The runtime's running totals, or undefined for an engine that keeps none (a test's fake). */
export const ioOf = (e: Engine): EngineIo | undefined => (typeof e.io === 'function' ? e.io() : undefined);

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
async function engineCall<T>(e: Engine, verb: string, phase: Phase, call: () => Promise<T>): Promise<T> {
  const before = aside(() => ioOf(e));
  try {
    return await within(phase, call);
  } finally {
    aside(() => {
      const after = ioOf(e);
      if (!before || !after) return;
      const seen = Object.values(observedBetween(before, after));
      const ms = verb === 'tick' ? Math.max(0, ...seen.map((o) => o.ms)) : seen.reduce((n, o) => n + o.ms, 0);
      addRuntime(
        phase,
        { bytes: after.bytesRead - before.bytesRead, reads: after.reads - before.reads, spawned: after.spawned - before.spawned },
        { ms, calls: seen.reduce((n, o) => n + o.calls, 0), spawned: seen.reduce((n, o) => n + o.spawned, 0) },
      );
    });
  }
}

/** The engine, each verb counted in its phase (`engineCall`); anything else passed through as it is. */
export const meteredEngine = (e: Engine): Engine =>
  new Proxy(e, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      const phase = typeof key === 'string' ? ENGINE_PHASES[key] : undefined;
      if (!phase || typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        engineCall(target, key as string, phase, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
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
 * (`pass.duration`, `pass.phase.duration` by `phase`, ms over `PASS_BOUNDS`), its journal reads (`pass.journal_reads`), and what the last
 * pass saw: the runs in the store (`store.runs`), the sessions queued and admitted (`sessions.queued`, `sessions.admitted`), how long the
 * oldest queued has waited (`admission.wait`, ms), and the machine's load per core (`machine.load`).
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
