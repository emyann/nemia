/**
 * What a pass costs, counted while it runs: the time spent in each kind of work, the calls, the bytes read and the processes started.
 *
 * Open only during a pass (`metered`), and empty outside one: a reader called by a verb, the api or a test between passes runs as it
 * would unmetered, at the price of one comparison. Inside a pass, `within(kind, f)` charges the time until `f` settles to `kind`, and
 * the time of a `within` nested in it to the inner kind instead — so a run record's approvals are asks, and a git call made to file a step
 * is git — and the time in no `within` at all to `assess`, the judgement and whatever else is not counted. So the kinds add up to the
 * pass's time by construction, and the pass's time is measured apart from them, so a test can hold the one against the other.
 *
 * A pass is sequential — `tick` awaits each run before the next — which is what makes a stack right here. Something else in the process
 * that reads through these readers while a pass is open (the api's own requests) is charged to the pass: the process is the unit.
 *
 * The bytes are the ones read through `readText` and `countRead`, a thin wrapper around the store's readers: not a syscall tracer, so
 * what a child process reads (git) is not in them, and neither is a read the store makes some other way. Nothing is carried between
 * passes: `metered` returns the counts, and the next pass starts from nothing.
 */
import fs from 'node:fs';
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { PHASES, type Phase, type PhaseCost } from './meter.ts';

/** The kinds of work a pass is counted in: its phases (`PHASES`). `assess` is the time in no other. */
type Kind = Phase;
type Tally = PhaseCost;

/**
 * A pass's counts: each kind's, the run records read, the runs at rest answered from the tick's memo (`rested`), and the time the counting
 * itself took (`overheadMs`).
 */
export type Tallies = { kinds: Record<Kind, Tally>; records: number; rested: number; overheadMs: number };

type Frame = { kind: Kind };
type Meter = Tallies & { stack: Frame[]; mark: number };

let meter: Meter | undefined;

const empty = (): Tally => ({ ms: 0, calls: 0, bytes: 0, reads: 0, spawned: 0 });
const top = (m: Meter): Kind => m.stack.at(-1)?.kind ?? 'assess';

/** The time since the last mark, charged to the kind on top — `assess` with none — and the time this took, to the overhead. */
const charge = (m: Meter, now: number) => {
  m.kinds[top(m)].ms += now - m.mark;
  m.mark = now;
};

const enter = (m: Meter, frame: Frame) => {
  const now = performance.now();
  charge(m, now);
  m.stack.push(frame);
  m.kinds[frame.kind].calls++;
  m.overheadMs += performance.now() - now;
  m.mark = performance.now();
};

const leave = (m: Meter, frame: Frame) => {
  const now = performance.now();
  charge(m, now);
  const at = m.stack.lastIndexOf(frame);
  if (at >= 0) m.stack.splice(at, 1);
  m.overheadMs += performance.now() - now;
  m.mark = performance.now();
};

/**
 * `f`, counted as `kind` while a pass is metered: its time until it returns, or until the promise it returns settles. Throws and rejects as
 * `f` does. Outside a pass, `f` itself.
 */
export function within<T>(kind: Kind, f: () => T): T {
  const m = meter;
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

/** A read of `bytes`, counted to the kind at work — `assess` in none — while a pass is metered. */
export const countRead = (bytes: number): void => {
  if (!meter) return;
  const t = meter.kinds[top(meter)];
  t.reads++;
  t.bytes += bytes;
};

/** A process started, counted to the kind at work while a pass is metered. */
export const countSpawn = (): void => {
  if (meter) meter.kinds[top(meter)].spawned++;
};

/** One run record read. */
export const countRecord = (): void => {
  if (meter) meter.records++;
};

/** One run at rest, answered from the tick's memo (`rest.ts`). */
export const countRested = (): void => {
  if (meter) meter.rested++;
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
  if (!meter) return;
  const t = meter.kinds[kind];
  const o = meter.kinds.observe;
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
  const m = meter;
  if (!m) return f();
  const t0 = performance.now();
  charge(m, t0);
  try {
    return f();
  } finally {
    const t1 = performance.now();
    m.overheadMs += t1 - t0;
    m.mark = t1;
  }
}

/** Whether a pass is being metered now. */
export const metering = (): boolean => meter !== undefined;

/**
 * Run `f` as one metered pass, and answer with what it returned, its time in ms, and its counts. A pass inside a pass is not metered again:
 * it runs as part of the outer one and answers with no counts.
 */
export async function metered<T>(f: () => Promise<T>): Promise<{ value: T; ms: number; tallies?: Tallies }> {
  if (meter) {
    const t0 = performance.now();
    return { value: await f(), ms: performance.now() - t0 };
  }
  const t0 = performance.now();
  const m: Meter = {
    kinds: Object.fromEntries(PHASES.map((k) => [k, empty()])) as Record<Kind, Tally>,
    records: 0,
    rested: 0,
    overheadMs: 0,
    stack: [],
    mark: t0,
  };
  meter = m;
  try {
    const value = await f();
    const end = performance.now();
    charge(m, end);
    return { value, ms: end - t0, tallies: { kinds: m.kinds, records: m.records, rested: m.rested, overheadMs: m.overheadMs } };
  } finally {
    meter = undefined;
  }
}

/** `fs.readFileSync(file, 'utf8')`, its bytes counted: throws as it does. */
export const readText = (file: string): string => {
  const buf = fs.readFileSync(file);
  countRead(buf.length);
  return buf.toString('utf8');
};

/** `execFileSync`, counted as a process started, and as `git` when the command is git: throws as it does. */
export function execCounted(cmd: string, args: readonly string[], options: ExecFileSyncOptions & { encoding: BufferEncoding }): string;
export function execCounted(cmd: string, args: readonly string[], options?: ExecFileSyncOptions): string | Buffer;
export function execCounted(cmd: string, args: readonly string[], options?: ExecFileSyncOptions): string | Buffer {
  const run = () => {
    countSpawn();
    return execFileSync(cmd, args, options);
  };
  return cmd === 'git' ? within('git', run) : run();
}
