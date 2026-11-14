/** Whether a condition can ever hold at a gate (`neverHolds`, `contracts/never-holds.contract.ts`). */
import type { NeverHolds } from '../../contracts/never-holds.contract.ts';

/**
 * Why `condition` can never hold at `site`, or null where it can: the agent recommending it and its check passing never hold at an
 * ending approved before it runs, and its check passing never holds at a step with no check. Pure.
 */
export const neverHolds: NeverHolds = (site, condition) => {
  if (site.approvedFirst && (condition === 'recommends' || condition === 'checked')) return 'approved-before-it-runs';
  if (!site.hasCheck && condition === 'checked') return 'no-check';
  return null;
};

