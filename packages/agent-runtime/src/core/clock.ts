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

/**
 * How much of a budget of `ms`, taken at `from`, is left at `now`: never below zero, so a budget already spent cuts at once rather
 * than granting its length again. What shares one bound across the waits of a sequence that must end within it, instead of giving
 * each wait the whole bound and the sequence their sum.
 */
export const leftOf = (from: Instant, ms: number, now: Instant): number => Math.max(0, ms - elapsedMs(from, now));

/** One budget's hand to the waits that share it: `take` what is left, and `given`, what every take so far answered. */
export type Purse = { readonly take: (share?: number) => number; readonly given: readonly number[] };

/**
 * One budget of `ms` milliseconds, taken at `now()` and shared by the waits of a sequence that must end within it: each `take`
 * answers what the budget has left (`leftOf`), at most `share` of the whole and at most what the purse has not given yet, and
 * `given` is what every take answered. So the waits of one sequence add up to no more than the budget, where a bound of `ms` on
 * each would let the sequence take their sum; and a caller can show that they do, by what was given rather than by the clock.
 *
 * What was given bounds a take as the clock does, because the two disagree: a wait given 800 that returns a hair early, or a
 * monotonic reading truncated to the millisecond, leaves the clock saying 201 of 1000 are left after 800 were handed out. The sum
 * is the one a caller can show, so it is the one held.
 *
 * @param ms the whole budget
 * @param now the clock it is spent on, read when the budget is taken and at each `take`
 */
export const purseOf = (ms: number, now: () => Instant): Purse => {
  const from = now();
  const given: number[] = [];
  return {
    take: (share = 1) => {
      const spent = given.reduce((a, b) => a + b, 0);
      const left = Math.min(leftOf(from, ms, now()), Math.floor(ms * share), Math.max(0, ms - spent));
      given.push(left);
      return left;
    },
    given,
  };
};
