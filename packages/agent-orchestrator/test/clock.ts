/** Stepping this process's wall clock in a test, as a machine's clock is stepped under load. */
import type { TestContext } from 'vitest';

/**
 * Step this process's wall clock forward by `ms` at every reading until the test ends: each `Date.now()` and argless `new Date()` reads
 * `ms` later than the one before, so a deadline taken on the wall clock passes at its first look. The monotonic clocks
 * (`performance.now()`, `process.hrtime`) and a file's mtime, the kernel's, do not move with it.
 */
export const steppingClock = (t: TestContext, ms: number) => {
  const Real = Date;
  let ahead = 0;
  const read = () => Real.now() + (ahead += ms);
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- the stepped clock, the package's seam for a wall time
  globalThis.Date = class extends Real {
    constructor(...args: ConstructorParameters<DateConstructor> | []) {
      if (args.length === 0) super(read());
      else super(...args);
    }
    static override now() {
      return read();
    }
  } as DateConstructor;
  t.onTestFinished(() => {
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- puts the real clock back
    globalThis.Date = Real;
  });
};
