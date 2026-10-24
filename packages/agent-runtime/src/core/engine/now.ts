/**
 * Reading the clocks a duration is measured on (`core/clock.ts`): the wall clock, and the machine's monotonic clock under the
 * id of the boot it belongs to.
 */
import fs from 'node:fs';
import type { Instant, Monotonic } from '../clock.ts';

/** Where Linux keeps the id of the running boot, a fresh one at each. */
const BOOT_ID_FILE = '/proc/sys/kernel/random/boot_id';

let boot: string | null | undefined;

/** The running boot's id, read once; `null` where the machine does not say, and no monotonic reading is taken. */
const bootId = (): string | null => {
  if (boot === undefined) {
    try {
      boot = fs.readFileSync(BOOT_ID_FILE, 'utf8').trim() || null;
    } catch {
      boot = null;
    }
  }
  return boot;
};

/**
 * The monotonic clock now, in whole milliseconds, under the boot's id; absent where the boot id cannot be read.
 *
 * Whole milliseconds, so a bound measured on it fires up to 1 ms before `performance.now()` says the delay is gone: a test's floor on
 * such a bound reads `elapsedMs` over `instantNow()` taken around the call, never `performance.now()`.
 */
export const monoNow = (): Monotonic | undefined => {
  const id = bootId();
  return id === null ? undefined : { boot: id, ms: Number(process.hrtime.bigint() / 1_000_000n) };
};

/** Now, on both clocks: the wall clock's `Date.now()`, and the monotonic reading where there is one. */
export const instantNow = (): Instant => {
  const mono = monoNow();
  return { at: Date.now(), ...(mono ? { mono } : {}) };
};
