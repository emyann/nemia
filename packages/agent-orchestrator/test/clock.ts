/** Stepping this process's wall clock in a test, as a machine's clock is stepped under load. */
import type { TestContext } from 'node:test';

/**
 * Step this process's wall clock forward by `ms` at every reading until the test ends: each `Date.now()` and argless `new Date()` reads
 * `ms` later than the one before, so a deadline taken on the wall clock passes at its first look. The monotonic clocks
 * (`performance.now()`, `process.hrtime`) and a file's mtime, the kernel's, do not move with it.
 */
export const steppingClock = (t: TestContext, ms: number): void => {
  const Real = Date;
  let ahead = 0;
  const read = (): number => Real.now() + (ahead += ms);
  globalThis.Date = class extends Real {
    constructor(...args: ConstructorParameters<DateConstructor> | []) {
      if (args.length === 0) super(read());
      else super(...args);
    }
    static override now(): number {
      return read();
    }
  } as DateConstructor;
  t.after(() => {
    globalThis.Date = Real;
  });
};
