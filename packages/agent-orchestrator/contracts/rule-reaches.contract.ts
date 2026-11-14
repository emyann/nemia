/**
 * Whether an agent's rule for `auto` could ever approve at a gate (agent-orchestrator, src/reach/rule-reaches.ts, `ruleReaches`), which
 * `suggestedFor`'s laws read (`reach.contract.ts`), leaning on what this spec proves of it; its own law leans on `neverHolds`'s
 * (`never-holds.contract.ts`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { GateRule as PolicyRule } from '../src/auto/auto.ts';
import { neverHolds } from '../src/reach/never-holds.ts';
import type { GateSite } from './never-holds.contract.ts';

/** Whether `rule` names `step` among those it covers, every step where it names none. */
const covers = (rule: PolicyRule, step: string): boolean => rule.steps === undefined || rule.steps.includes(step);

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
