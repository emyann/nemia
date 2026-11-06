/**
 * Whether a rule an agent proposed for approving proposals at auto may be confirmed (agent-orchestrator, src/proposal/rule.ts,
 * `proposalRuleReach`): two layers, as Kubernetes keeps a Role apart from what a controller does under it — the delegation says what the
 * agent may ever approve, the rule when it approves unasked — so a rule that reaches past the agent's delegation in the rule's factory is
 * refused when the person confirms it, naming each pair of resource and verb it reaches past. A rule within it goes on. A delegation taken
 * back later leaves the rule confirmed but reaching nothing: `proposalApproval` reads the delegation at every approval. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ChangeVerb, Grant, ProposalRule } from './proposal-approval.contract.ts';

/** A pair of resource and verb a rule reaches past its delegation by. */
export type Past = { readonly resource: string; readonly verb: ChangeVerb };

/**
 * Whether `grants` cover what `rule` covers for `resource` and `verb`: some grant names the resource and the verb, and every name the rule
 * covers (every name where the rule names none, so a grant that names none).
 */
const coveredFor = (grants: readonly Grant[], rule: ProposalRule, resource: string, verb: ChangeVerb): boolean =>
  grants.some(
    (g) =>
      g.resources.includes(resource) &&
      g.verbs.includes(verb) &&
      (g.resourceNames.length === 0 || (rule.resourceNames.length > 0 && rule.resourceNames.every((n) => g.resourceNames.includes(n)))),
  );

/** Whether `rule` covers `resource` with `verb`. */
const ruleNames = (rule: ProposalRule, resource: string, verb: ChangeVerb): boolean =>
  rule.resources.includes(resource) && rule.verbs.includes(verb);

const proposalRuleReachSpec = spec<(rule: ProposalRule, grants: readonly Grant[]) => readonly Past[]>({
  ensures: {
    eachPastIsTheRules: {
      description: 'Each pair named past the delegation is one the rule covers',
      condition: ({ input: [rule], output }) => output.every((p) => ruleNames(rule, p.resource, p.verb)),
    },
    eachPastIsUncovered: {
      description: 'Each pair named past the delegation is one no grant covers for every name the rule covers',
      condition: ({ input: [rule, grants], output }) => output.every((p) => !coveredFor(grants, rule, p.resource, p.verb)),
    },
    noneWhereCovered: {
      description: 'A rule every pair of which its delegation covers reaches past nothing',
      condition: ({ input: [rule, grants], output }) =>
        !rule.resources.every((r) => rule.verbs.every((v) => coveredFor(grants, rule, r, v))) || output.length === 0,
    },
    someWhereUncovered: {
      description: 'A rule that covers a pair its delegation does not reaches past it',
      condition: ({ input: [rule, grants], output }) =>
        rule.resources.every((r) => rule.verbs.every((v) => coveredFor(grants, rule, r, v))) || output.length > 0,
    },
  },
});

/** `proposalRuleReach`'s type, which `src/proposal/rule.ts` takes. */
export type ProposalRuleReach = Implementation<typeof proposalRuleReachSpec>;
