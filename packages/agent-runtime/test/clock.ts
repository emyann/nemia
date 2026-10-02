/** Stepping this process's wall clock in a test, as a machine's clock is stepped under load. */
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
