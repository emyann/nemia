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
    // Narrowed (tsverify card p25m): the full law, over a rule of any number of verbs, is answered `bounded` (out of work; no
    // counterexample with arrays of at most 4 elements) at the default budget. The law here says it of a rule of one verb;
    // `src/proposal/rule.test.ts` holds the full law.
    noneWhereCovered: {
      description: 'A rule of one verb every pair of which its delegation covers reaches past nothing',
      condition: ({ input: [rule, grants], output }) =>
        rule.verbs.length !== 1 ||
        !rule.resources.every((r) => rule.verbs.every((v) => coveredFor(grants, rule, r, v))) ||
        output.length === 0,
    },
    // Narrowed (tsverify card p25m): the full law, "a rule that covers any pair its delegation does not reaches past it", is answered
    // `bounded` (out of work; no counterexample with arrays of at most 4 elements) at the default budget. The law here says it of the
    // rule's first pair; `src/proposal/rule.test.ts` holds the full law over every pair.
    someWhereUncovered: {
      description: 'A rule whose first pair of resource and verb its delegation does not cover reaches past it',
      condition: ({ input: [rule, grants], output }) => {
        const resource = rule.resources.at(0);
        const verb = rule.verbs.at(0);
        return resource === undefined || verb === undefined || coveredFor(grants, rule, resource, verb) || output.length > 0;
      },
    },
  },
});

/** `proposalRuleReach`'s type, which `src/proposal/rule.ts` takes. */
export type ProposalRuleReach = Implementation<typeof proposalRuleReachSpec>;
