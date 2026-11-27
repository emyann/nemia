/** The steps at work from the longest to the shortest, the order a strip row and an agent's Working list keep. Pure. */
import type { AtWorkRow } from '../../contracts/agent-activity.contract.ts';

/**
 * `rows` from the longest at work to the shortest, those as long as each other in the order given (the sort is stable).
 * @param rows The steps at work.
 */
export const longestFirst = (rows: readonly AtWorkRow[]) => [...rows].sort((a, b) => b.minutes - a.minutes);
