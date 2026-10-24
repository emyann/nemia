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
