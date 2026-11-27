/** Whether a condition can ever hold at a gate (`neverHolds`, `contracts/never-holds.contract.ts`). */
import type { NeverHolds } from '../../contracts/never-holds.contract.ts';

/**
 * Why `condition` can never hold at `site`, or null where it can: its check passing never holds at a step with no check. Pure.
 * @param site The gate: whether its step has a check.
 * @param condition The condition a rule needs.
 */
export const neverHolds: NeverHolds = (site, condition) => {
  if (!site.hasCheck && condition === 'checked') return 'no-check';
  return null;
};
