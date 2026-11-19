/**
 * The pairs of resource and verb a proposal rule reaches past its agent's delegation (`contracts/proposal-rule.contract.ts`): each pair
 * the rule covers that no grant covers for every name the rule names. Empty: the rule may be confirmed. Pure.
 */
import type { ChangeVerb, Grant, ProposalRule } from '../../contracts/proposal-approval.contract.ts';
import type { ProposalRuleReach } from '../../contracts/proposal-rule.contract.ts';

/** Whether `grants` cover `resource` with `verb` for every name `rule` names (a grant naming none where the rule names none). */
const coveredFor = (grants: readonly Grant[], rule: ProposalRule, resource: string, verb: ChangeVerb) =>
  grants.some(
    (g) =>
      g.resources.includes(resource) &&
      g.verbs.includes(verb) &&
      (g.resourceNames.length === 0 || (rule.resourceNames.length > 0 && rule.resourceNames.every((n) => g.resourceNames.includes(n)))),
  );

/**
 * The pairs of resource and verb `rule` reaches past its agent's delegation: each pair it covers that no grant of `grants` covers
 * for every name it names. Empty: the rule may be confirmed.
 * @param rule The proposal rule asked to be confirmed: its resources, names and verbs.
 * @param grants The grants of its agent's delegation.
 */
export const proposalRuleReach: ProposalRuleReach = (rule, grants) =>
  rule.resources
    .flatMap((resource) => rule.verbs.map((verb) => ({ resource, verb })))
    .filter((pair) => !coveredFor(grants, rule, pair.resource, pair.verb));
