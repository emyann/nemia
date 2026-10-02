/**
 * How the runtime measures a duration it decides on: on the machine's monotonic clock, which only goes forward, when both
 * readings were taken in one boot; on the wall clock otherwise. A stepped wall clock never ends a lease, a grace or a deadline
 * early within a boot; a reading from another boot, or one written without a monotonic stamp, is judged on the wall clock.
 */

/**
 * A reading of the machine's monotonic clock (the kernel's, through `process.hrtime`), in whole milliseconds: shared by
 * every process of the boot `boot` names, and started again at the next boot.
 */
export type Monotonic = { boot: string; ms: number };

/** A moment as the runtime stamps it: its wall-clock time `at`, in epoch milliseconds, and its monotonic reading when it had one. */
export type Instant = { at: number; mono?: Monotonic };

/**
 * How many milliseconds passed from `from` to `to`: the monotonic difference when both carry a reading of the same boot, the
 * wall-clock difference otherwise — a reading missing on either side, or the two from different boots.
 */
export const elapsedMs = (from: Instant, to: Instant): number =>
  from.mono && to.mono && from.mono.boot === to.mono.boot ? to.mono.ms - from.mono.ms : to.at - from.at;
