/**
 * The pass's meter, on the engine: each of its verbs counted in its phase (`meteredEngine`), and a pass's cost from those counts and the
 * runtime's totals before and after it (`costOf`). A controller, wrapping the engine whose type the client gives (`runtime-client.ts`).
 */
import type { Engine } from '../runtime-client.ts';
import { addRuntime, aside, within, type Tallies } from './tally.store.ts';
import { passCost, type HarnessCost, type PassCost, type Phase } from './meter.ts';

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
    overheadMs: t.overheadMs,
  });
