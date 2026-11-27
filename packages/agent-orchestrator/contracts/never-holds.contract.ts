/**
 * Whether a condition of an agent's rules for `auto` can ever hold at a gate (agent-orchestrator, src/reach/never-holds.ts,
 * `neverHolds`), which the laws of `rule-reaches.contract.ts` and `reach.contract.ts` read, leaning on what this spec proves of it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Condition } from '../src/auto/auto.ts';

const neverHoldsSpec = spec<(site: GateSite, condition: Condition) => NeverWhy | null>({
  ensures: {
    noCheckNeverPassed: {
      description: 'At a gate on a step with no check, its check passing never holds: it has none',
      condition: ({ input: [site, c], output }) => !(!site.hasCheck && c === 'checked') || output === 'no-check',
    },
    theRestCanHold: {
      description:
        'Every other condition can hold at a gate: every reviewer accepting, staying within budget, nothing left open, the agent recommending, and the check passing at a step that has one',
      condition: ({ input: [site, c], output }) => (!site.hasCheck && c === 'checked') || output === null,
    },
  },
});

export type NeverHolds = Implementation<typeof neverHoldsSpec>;

/** A gate of a workflow, as reach reads it: the workflow and the step gated, and whether it has a check (`hasCheck`). */
export type GateSite = { workflow: string; step: string; hasCheck: boolean };

/** Why a condition can never hold at a gate: the step has no check to pass. */
export type NeverWhy = 'no-check';
