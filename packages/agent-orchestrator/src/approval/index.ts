/**
 * The face of the approval's deciders: whether a caller may propose, whether its approval goes on and what a grant covers
 * (`approval.ts`), and what a rule for auto reaches past its agent's delegation (`rule.ts`), re-exported by name.
 */
export { covers, mayPropose, proposalApproval } from './approval.ts';
export { proposalRuleReach } from './rule.ts';
