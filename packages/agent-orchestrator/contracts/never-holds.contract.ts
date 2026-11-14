/**
 * Whether a condition of an agent's rules for `auto` can ever hold at a gate (agent-orchestrator, src/reach/never-holds.ts,
 * `neverHolds`), which the laws of `rule-reaches.contract.ts` and `reach.contract.ts` read, leaning on what this spec proves of it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Condition } from '../src/auto/auto.ts';

/** The two conditions read off the step's own closeout and check, which an approved-first ending has neither of at its gate. */
const ownWork = (c: Condition): boolean => c === 'recommends' || c === 'checked';

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

/**
 * A gate of a workflow, as reach reads it: the workflow and the step gated, whether the step is approved before it is filed, an ending
 * on the base branch with a gate (`approvedFirst`), and whether it has a check (`hasCheck`).
 */
export type GateSite = { workflow: string; step: string; approvedFirst: boolean; hasCheck: boolean };

/** Why a condition can never hold at a gate: the step is approved before it runs, or it has no check to pass. */
export type NeverWhy = 'approved-before-it-runs' | 'no-check';
