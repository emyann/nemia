/**
 * Whether a caller may propose in a factory, and whether its approval of a proposal goes on (`contracts/proposal-approval.contract.ts`):
 * the person approves anything still waiting; an agent only at auto, within its delegation, under a confirmed rule that takes the
 * proposal, and never its own agent's. Pure.
 */
import type {
  Caller,
  Change,
  Grant,
  MayPropose,
  ProposalApproval,
  ProposalFacts,
  ProposalRule,
} from '../../contracts/proposal-approval.contract.ts';

/** Whether `caller` acts in `factory`: the person anywhere, a factory's session in its own, a store-wide session (Nemia's) in any. */
const actsIn = (caller: Caller, factory: string): boolean =>
  caller.kind === 'person' || caller.factory === null || caller.factory === factory;

export const mayPropose: MayPropose = (caller, factory) => actsIn(caller, factory);

/** Whether `grant` covers `change`: its resource, its name (every name where the grant names none), and its verb. */
export const covers = (grant: Grant, change: Change): boolean =>
  grant.resources.includes(change.resource) &&
  (grant.resourceNames.length === 0 || grant.resourceNames.includes(change.name)) &&
  grant.verbs.includes(change.verb);

/** Whether `rule` takes the proposal: every change covered, its proposer among those it names, and a widening said outright. */
const ruleTakes = (rule: ProposalRule, p: ProposalFacts): boolean =>
  p.changes.every((change) => covers(rule, change)) &&
  (rule.proposedBy.length === 0 || (p.proposedBy !== null && rule.proposedBy.includes(p.proposedBy))) &&
  (!p.widens || rule.widens);

export const proposalApproval: ProposalApproval = (caller, p, standing) => {
  if (!p.waiting) return { kind: 'refused', reason: 'not-waiting' };
  if (caller.kind === 'person') return { kind: 'approved', by: 'person' };
  if (!actsIn(caller, p.factory)) return { kind: 'refused', reason: 'other-factory' };
  if (p.proposedBy === caller.agent) return { kind: 'refused', reason: 'own-agent' };
  if (standing.level !== 'auto') return { kind: 'refused', reason: 'not-auto' };
  if (!p.changes.every((change) => standing.grants.some((grant) => covers(grant, change))))
    return { kind: 'refused', reason: 'not-delegated' };
  const rule = standing.rules.find((r) => ruleTakes(r, p));
  return rule === undefined ? { kind: 'refused', reason: 'no-rule' } : { kind: 'approved', by: 'rule', rule: rule.id };
};
