/** Rows of work in the order a strip row and an agent's Working list keep them. Pure. */

/** The part of a step at work that the order and its contract read: whose it is, which step of which run, and for how long. */
type Timed = { readonly agent: string; readonly run: string; readonly step: string; readonly minutes: number };

/**
 * `rows` from the longest at work to the shortest, those as long as each other in the order given (the sort is stable).
 * @param rows The steps at work, each with how many whole minutes its session has been at work.
 */
export const longestFirst = <R extends Timed>(rows: readonly R[]) => [...rows].sort((a, b) => b.minutes - a.minutes);
