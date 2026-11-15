/** Whether a rule could ever approve at a gate (`ruleReaches`, `contracts/rule-reaches.contract.ts`). */
import type { RuleReaches } from '../../contracts/rule-reaches.contract.ts';
import { neverHolds } from './never-holds.ts';

/**
 * Whether `rule` could ever approve at `site`: it approves, covers the gated step, and needs no condition that never holds there. Pure.
 * @param rule The rule judged.
 * @param site The gate, and the step it gates.
 */
export const ruleReaches: RuleReaches = (rule, site) =>
  rule.answer === 'approve' &&
  (rule.steps === undefined || rule.steps.includes(site.step)) &&
  rule.when.every((c) => neverHolds(site, c) === null);
