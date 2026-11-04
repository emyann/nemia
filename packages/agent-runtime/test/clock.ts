/**
 * Stepping this process's wall clock in a test, as a machine's clock is stepped under load.
 *
 * A test stamps the times the runtime compares from the journal's attempt start (`begun` in `test/release.test.ts`), so a stepped clock
 * drops nothing. A runner that cannot be handed another attempt's statement (the detached spawn clears the last one's), or that tells
 * it from its parent's (`--bg`: the parent's last call id, `harness/claude/parent.ts`), reports it with no time: its test steps the
 * clock here instead.
 */
import type { TestContext } from 'node:test';

/**
 * Step this process's wall clock by `ms` until the test ends: `Date.now()` and an argless `new Date()` read `ms` later, or
 * earlier when `ms` is negative. A file's mtime is the kernel's and does not move with it.
 */
export const stepClock = (t: TestContext, ms: number): void => {
  const Real = Date;
  globalThis.Date = class extends Real {
    constructor(...args: ConstructorParameters<DateConstructor> | []) {
      if (args.length === 0) super(Real.now() + ms);
      else super(...args);
    }
    static override now(): number {
      return Real.now() + ms;
    }
  } as DateConstructor;
  t.after(() => {
    globalThis.Date = Real;
  });
};

/**
 * Step this process's monotonic clock by `ms` — `process.hrtime.bigint()`, which `instantNow` reads (`core/engine/now.ts`) — until the
 * step is taken back: the answer is that undo, and the test's end takes it back too. A bound measured on the monotonic clock (a
 * long-lived task's back-off, a worker's lease) is passed by this, as one on the wall clock is by `stepClock`. Another process's
 * clock does not move with it: a worker beating now reads as beaten `ms` ago, so a step is taken back once the pass that reads past
 * the bound has run.
 */
export const stepMono = (t: TestContext, ms: number): (() => void) => {
  const real = Object.getOwnPropertyDescriptor(process.hrtime, 'bigint');
  const read = process.hrtime.bigint.bind(process.hrtime);
  const by = BigInt(ms) * 1_000_000n;
  process.hrtime.bigint = () => read() + by;
  const undo = () => {
    if (real) Object.defineProperty(process.hrtime, 'bigint', real);
  };
  t.after(undo);
  return undo;
};
