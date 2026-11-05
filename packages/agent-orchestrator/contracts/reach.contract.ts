/**
 * Which gates a person's rules for `auto` can reach (agent-orchestrator, src/auto/reach.ts): read off a gate's step as its workflow
 * declares it, never off a run, so it says whether a rule could ever approve that gate, not whether it does now. A condition admission
 * reads on the gated step itself (`factsOf`, src/auto/facts.ts) never holds at some gates: an ending approved before it is filed
 * (`approvedFirst`) has no closeout and no verdict when it is approved, so the agent cannot recommend it and no check has passed; a step
 * with no `check:` never has a check that passed (`verdict === 0`). `neverHolds` says which and why, `ruleReaches` whether a rule could
 * approve a gate, `suggestedFor` the rule that reaches a gate asking all that can hold there, and `unmetNow` what keeps a rule from a gate
 * in a run's facts at the call. The words a person reads, and the read that gathers a factory's gates, are the code's, held by tests.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Condition, Facts, PolicyRule } from '../src/auto/auto.ts';
import { type GateSite, type NeverWhy, neverHolds, ruleReaches, type Unmet } from '../src/auto/reach.ts';

/** The conditions a rule may need, in `CONDITIONS`' order (src/auto/auto.ts): written here, since a law reads none of the code's lists. */
const ALL: readonly Condition[] = ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'];

/** The two conditions read off the step's own closeout and check, which an approved-first ending has neither of at its gate. */
const ownWork = (c: Condition): boolean => c === 'recommends' || c === 'checked';

/** Whether `rule` names `step` among those it covers, every step where it names none. */
const covers = (rule: PolicyRule, step: string): boolean => rule.steps === undefined || rule.steps.includes(step);

const neverHoldsSpec = spec<(site: GateSite, condition: Condition) => NeverWhy | null>({
  ensures: {
    approvedFirstHasNoOwnWork: {
      description: 'At an ending approved before it runs, the agent recommending it and its check passing never hold: it has not run',
      condition: ({ input: [site, c], output }) => !(site.approvedFirst && ownWork(c)) || output === 'approved-before-it-runs',
    },
    noCheckNeverPassed: {
      description: 'At a gate on a step with no check, run before it is approved, its check passing never holds: it has none',
      condition: ({ input: [site, c], output }) => !(!site.approvedFirst && !site.hasCheck && c === 'checked') || output === 'no-check',
    },
    theRestCanHold: {
      description:
        'Every other condition can hold at a gate: every reviewer accepting, staying within budget, nothing left open, and the agent recommending and the check passing at a step that runs before its gate',
      condition: ({ input: [site, c], output }) =>
        (site.approvedFirst && ownWork(c)) || (!site.approvedFirst && !site.hasCheck && c === 'checked') || output === null,
    },
  },
});
export type NeverHolds = Implementation<typeof neverHoldsSpec>;

/** Whether every condition `rule` needs can hold at `site`. */
const eachCanHold = (rule: PolicyRule, site: GateSite): boolean => rule.when.every((c) => neverHolds(site, c) === null);

const ruleReachesSpec = spec<(rule: PolicyRule, site: GateSite) => boolean>({
  ensures: {
    reachesExactlyWhenItCouldApprove: {
      description: 'A rule can reach a gate exactly when it approves, covers the gated step, and needs no condition that never holds there',
      condition: ({ input: [rule, site], output }) =>
        output === (rule.answer === 'approve' && covers(rule, site.step) && eachCanHold(rule, site)),
    },
  },
});
export type RuleReaches = Implementation<typeof ruleReachesSpec>;

const suggestedForSpec = spec<(site: GateSite) => PolicyRule>({
  ensures: {
    reachesItsGate: {
      description: 'A rule suggested for a gate is one that can reach it',
      condition: ({ input: [site], output }) => ruleReaches(output, site),
    },
    approvesThatStepAlone: {
      description: 'It approves, and covers the gated step and no other',
      condition: ({ input: [site], output }) =>
        output.answer === 'approve' && output.steps !== undefined && output.steps.length === 1 && output.steps.at(0) === site.step,
    },
    asksAllThatCanHold: {
      description: 'It needs every condition that can hold at the gate, so it lets through no more than the default would where it could',
      condition: ({ input: [site], output }) => ALL.every((c) => neverHolds(site, c) !== null || output.when.includes(c)),
    },
    namesEachConditionOnce: {
      description: 'It names each condition once',
      condition: ({ output }) => ALL.every((c) => output.when.filter((w) => w === c).length <= 1),
    },
    noDollarLine: {
      description: 'It sets no dollar line, which is the person’s to add',
      condition: ({ output }) => output.under === undefined,
    },
    comesFromNoOne: {
      description: 'It says nowhere it came from: it is neither the builtin rule nor one an agent proposed and the person confirmed',
      condition: ({ output }) => output.from === undefined,
    },
  },
});
export type SuggestedFor = Implementation<typeof suggestedForSpec>;

const unmetNowSpec = spec<(rule: PolicyRule, facts: Facts) => Unmet>({
  ensures: {
    namesEachConditionThatFails: {
      description: 'Each condition the rule needs that does not hold now is named',
      condition: ({ input: [rule, facts], output }) => rule.when.every((c) => facts[c] || output.conditions.includes(c)),
    },
    namesNoOther: {
      description: 'No condition is named that the rule does not need, or that holds now',
      condition: ({ input: [rule, facts], output }) => output.conditions.every((c) => rule.when.includes(c) && !facts[c]),
    },
    overLineExactlyWhenSpentPastIt: {
      description: 'The dollar line is named exactly where the rule has one and the run has cost as much or more',
      condition: ({ input: [rule, facts], output }) => output.overLine === (rule.under !== undefined && facts.spend >= rule.under),
    },
  },
});
export type UnmetNow = Implementation<typeof unmetNowSpec>;
