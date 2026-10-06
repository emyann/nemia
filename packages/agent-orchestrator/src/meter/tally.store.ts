/**
 * What a pass costs, counted while it runs: the time spent in each kind of work, the calls, the bytes read and the processes started.
 *
 * Open only during a pass (`metered`, or `meteredPass` for an Effect program), and empty outside one: a reader called by a verb, the api
 * or a test between passes runs as it would unmetered, at the price of one comparison. Inside a pass, `within(kind, f)` charges the time
 * until `f` settles to `kind`, and the time of a `within` nested in it to the inner kind instead — so a run record's approvals are asks,
 * and a place verb run to file a step is the place's — and the time in no `within` at all to `assess`, the judgement and whatever else
 * is not counted. The counting itself is the overhead, and the reading that closes one interval opens the next, so the kinds and the
 * overhead add up to the pass's time exactly, and the pass's time is measured apart from them, so a test can hold the one against the
 * other.
 *
 * A pass is sequential — `tick` awaits each run before the next — which is what makes a stack right here. The meter is the pass's own,
 * carried by its async context (`AsyncLocalStorage`): what else in the process reads through these readers while a pass is open (the api's
 * own requests) counts nothing to it, and an Effect pass yields to no other fiber but where it waits (`PreventSchedulerYield`), so their
 * work falls in none of its phases either. A wait is the pass's time, whatever the process did meanwhile. What the runtime reports of
 * its own reads (`addRuntime`) is the pass's alone too: `tickRun` runs the pass in a tally of the runtime's (`talliedIn`).
 *
 * The bytes are the ones read through `readText` and `countRead`, a thin wrapper around the store's readers: not a syscall tracer, so
 * what a child process reads (git) is not in them, and neither is a read the store makes some other way. Nothing is carried between
 * passes: `metered` returns the counts, and the next pass starts from nothing.
 */
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Effect, Fiber, Context, References } from 'effect';
import { NOTHING_SEEN, PHASES, type CheckLabels, type Phase, type PhaseCost, type Seen } from './meter.ts';

/** The kinds of work a pass is counted in: its phases (`PHASES`). `assess` is the time in no other. */
type Kind = Phase;
type Tally = PhaseCost;

/**
 * A pass's counts: each kind's, the run records read, the runs at rest answered from the tick's memo (`rested`), what the pass saw beside
 * its time (`seen`, `noteSeen`), the checks it filed (`checks`, `noteFiledCheck`), and the time the counting itself took (`overheadMs`).
 */
export type Tallies = {
  kinds: Record<Kind, Tally>;
  records: number;
  rested: number;
  seen: Seen;
  checks: CheckLabels[];
  overheadMs: number;
};

type Frame = { kind: Kind };
type Meter = Tallies & { stack: Frame[]; mark: number };

/** The meter of the pass whose async context this is, or none outside a pass. */
const passes = new AsyncLocalStorage<Meter>();
const open = (): Meter | undefined => passes.getStore();

const empty = (): Tally => ({ ms: 0, calls: 0, bytes: 0, reads: 0, spawned: 0 });
const top = (m: Meter): Kind => m.stack.at(-1)?.kind ?? 'assess';

/** The time from the last mark to `now`, charged to the kind on top — `assess` with none — and the mark moved to `now`. */
const charge = (m: Meter, now: number) => {
  m.kinds[top(m)].ms += now - m.mark;
  m.mark = now;
};

/**
 * `f`, run as counting: the time before it charged first, and its own time, from the reading that charged to the one that closes it, added
 * to the overhead, with the mark moved to that same closing reading, so no time falls between the kinds and the overhead. Throws as `f`
 * does, counted all the same.
 */
const counting = <T>(m: Meter, f: () => T): T => {
  const now = performance.now();
  charge(m, now);
  try {
    return f();
  } finally {
    const after = performance.now();
    m.overheadMs += after - now;
    m.mark = after;
  }
};

const enter = (m: Meter, frame: Frame) =>
  counting(m, () => {
    m.stack.push(frame);
    m.kinds[frame.kind].calls++;
  });

const leave = (m: Meter, frame: Frame) =>
  counting(m, () => {
    const at = m.stack.lastIndexOf(frame);
    if (at >= 0) m.stack.splice(at, 1);
  });

/**
 * `f`, counted as `kind` while a pass is metered: its time until it returns, or until the promise it returns settles. Throws and rejects as
 * `f` does. Outside a pass, `f` itself.
 */
export function within<T>(kind: Kind, f: () => T): T {
  const m = open();
  if (!m) return f();
  const frame: Frame = { kind };
  enter(m, frame);
  let out: T;
  try {
    out = f();
  } catch (err) {
    leave(m, frame);
    throw err;
  }
  if (out instanceof Promise) return out.finally(() => leave(m, frame)) as T;
  leave(m, frame);
  return out;
}

/**
 * `program`, counted as `kind` while a pass is metered, as `within` counts a Promise: its time until it ends, however it ends,
 * interruption included. Outside a pass, `program` itself.
 */
export const withinEffect = <A, E, R>(kind: Kind, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const m = open();
    if (!m) return program;
    const frame: Frame = { kind };
    return Effect.acquireUseRelease(
      Effect.sync(() => enter(m, frame)),
      () => program,
      () => Effect.sync(() => leave(m, frame)),
    );
  });

/** A read of `bytes`, counted to the kind at work — `assess` in none — while a pass is metered. */
export const countRead = (bytes: number): void => {
  const m = open();
  if (!m) return;
  const t = m.kinds[top(m)];
  t.reads++;
  t.bytes += bytes;
};

/** A process started, counted to the kind at work while a pass is metered. */
export const countSpawn = (): void => {
  const m = open();
  if (m) m.kinds[top(m)].spawned++;
};

/** One run record read. */
export const countRecord = (): void => {
  const m = open();
  if (m) m.records++;
};

/** One run at rest, answered from the tick's memo (`rest.ts`). */
export const countRested = (): void => {
  const m = open();
  if (m) m.rested++;
};

/** What the pass saw (`Seen`), each figure given taking the place of the one before, while a pass is metered. */
export const noteSeen = (seen: Partial<Seen>): void => {
  const m = open();
  if (m) m.seen = { ...m.seen, ...seen };
};

/** A check the pass filed, by what it belongs to (`CheckLabels`), while a pass is metered. */
export const noteFiledCheck = (labels: CheckLabels): void => {
  const m = open();
  if (m) m.checks.push({ factory: labels.factory, workflow: labels.workflow, step: labels.step, agent: labels.agent });
};

/**
 * What the runtime reported of a call, added to the kind that made it — its bytes, reads and processes — with the time it spent observing
 * its harnesses and the processes those started moved from that kind to `observe` (`observed`, at most the call's own).
 */
export const addRuntime = (
  kind: Kind,
  io: { bytes: number; reads: number; spawned: number },
  observed: { ms: number; spawned: number; calls: number },
): void => {
  const m = open();
  if (!m) return;
  const t = m.kinds[kind];
  const o = m.kinds.observe;
  t.bytes += io.bytes;
  t.reads += io.reads;
  const ms = Math.min(Math.max(observed.ms, 0), t.ms);
  const spawned = Math.min(Math.max(observed.spawned, 0), io.spawned);
  t.ms -= ms;
  o.ms += ms;
  o.calls += observed.calls;
  t.spawned += io.spawned - spawned;
  o.spawned += spawned;
};

/**
 * `f`, counting done outside `within` — a runtime's report read, say — its time added to the overhead and charged to no kind: the time
 * before it is charged first, and the mark moved past it after. Outside a pass, `f` itself.
 */
export function aside<T>(f: () => T): T {
  const m = open();
  return m ? counting(m, f) : f();
}

/**
 * `program`, counted as `aside` counts a function: its time added to the overhead and charged to no kind, the mark moved past it after.
 * Outside a pass, `program` itself.
 */
export const asideEffect = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const m = open();
    if (!m) return program;
    const now = performance.now();
    charge(m, now);
    return Effect.ensuring(
      program,
      Effect.sync(() => {
        const after = performance.now();
        m.overheadMs += after - now;
        m.mark = after;
      }),
    );
  });

/** Whether a pass is being metered in this async context. */
export const metering = (): boolean => open() !== undefined;

/** A meter opened at `t0` with nothing counted. */
const opened = (t0: number): Meter => ({
  kinds: Object.fromEntries(PHASES.map((k) => [k, empty()])) as Record<Kind, Tally>,
  records: 0,
  rested: 0,
  seen: NOTHING_SEEN,
  checks: [],
  overheadMs: 0,
  stack: [],
  mark: t0,
});

/** What `m`, opened at `t0`, counted up to now: the pass's time in ms and its counts, the time since the last mark charged first. */
const counted = (m: Meter, t0: number): { ms: number; tallies: Tallies } => {
  const end = performance.now();
  charge(m, end);
  return {
    ms: end - t0,
    tallies: { kinds: m.kinds, records: m.records, rested: m.rested, seen: m.seen, checks: m.checks, overheadMs: m.overheadMs },
  };
};

/**
 * Run `f` as one metered pass, and answer with what it returned, its time in ms, and its counts: what `f` and the work it starts read.
 * A pass inside a pass is not metered again: it runs as part of the outer one and answers with no counts.
 */
export async function metered<T>(f: () => Promise<T>): Promise<{ value: T; ms: number; tallies?: Tallies }> {
  const t0 = performance.now();
  if (open()) return { value: await f(), ms: performance.now() - t0 };
  const m = opened(t0);
  const value = await passes.run(m, f);
  return { value, ...counted(m, t0) };
}

/**
 * `program` on a fiber of its own, started in `m`'s async context with the caller's services, which yields to no other fiber of the
 * process but where it waits: fails, dies and is interrupted with the caller.
 */
const inPass = <A, E, R>(m: Meter, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.context<R>(), (context) => {
    const fiber = passes.run(m, () => Effect.runForkWith(Context.add(context, References.PreventSchedulerYield, true))(program));
    return Effect.onInterrupt(Fiber.join(fiber), () => Fiber.interrupt(fiber));
  });

/**
 * `program` as one metered pass, as `metered` runs a Promise: what it succeeded with, its time in ms, and its counts; no counts inside a
 * pass already metered, which counts it as its own. Fails, dies and is interrupted as `program` is, and leaves no meter open in any case.
 */
export const meteredPass = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<{ value: A; ms: number; tallies?: Tallies }, E, R> =>
  Effect.suspend(() => {
    const t0 = performance.now();
    if (open()) return Effect.map(program, (value) => ({ value, ms: performance.now() - t0 }));
    const m = opened(t0);
    return Effect.map(inPass(m, program), (value) => ({ value, ...counted(m, t0) }));
  });

/** `fs.readFileSync(file, 'utf8')`, its bytes counted: throws as it does. */
export const readText = (file: string): string => {
  const buf = fs.readFileSync(file);
  countRead(buf.length);
  return buf.toString('utf8');
};
