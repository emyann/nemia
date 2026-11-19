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
const actsIn = (caller: Caller, factory: string) => caller.kind === 'person' || caller.factory === null || caller.factory === factory;

/**
 * Whether `caller` may propose in `factory`: the person anywhere, a factory's session in its own, a store-wide session in any.
 * @param caller Who proposes: the person, or an agent with the factory it works in, null where it is store-wide.
 * @param factory The name of the factory the proposal is made in.
 */
export const mayPropose: MayPropose = (caller, factory) => actsIn(caller, factory);

/**
 * Whether `grant` covers `change`: its resource, its name (every name where the grant names none), and its verb.
 * @param grant A grant of a delegation, or a rule: its resources, its names and its verbs.
 * @param change One change of a proposal: its resource, its name and its verb.
 */
export const covers = (grant: Grant, change: Change) =>
  grant.resources.includes(change.resource) &&
  (grant.resourceNames.length === 0 || grant.resourceNames.includes(change.name)) &&
  grant.verbs.includes(change.verb);

/** Whether `rule` takes the proposal: every change covered, its proposer among those it names, and a widening said outright. */
const ruleTakes = (rule: ProposalRule, p: ProposalFacts) =>
  p.changes.every((change) => covers(rule, change)) &&
  (rule.proposedBy.length === 0 || (p.proposedBy !== null && rule.proposedBy.includes(p.proposedBy))) &&
  (!p.widens || rule.widens);

/**
 * Whether `caller`'s approval of the proposal `p` goes on, and by whom, or why it is refused: the person approves anything still
 * waiting; an agent only in its own factory, never its own agent's proposal, at auto, within its delegation's grants, and under a
 * confirmed rule that takes the proposal.
 * @param caller Who approves: the person, or an agent with the factory it works in.
 * @param p The proposal as approval reads it: whether it waits, its factory, its proposer, its changes and whether it widens.
 * @param standing What the calling agent stands on in the proposal's factory: the level, its grants and its confirmed rules.
 */
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
