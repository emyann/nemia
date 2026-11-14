/**
 * Whether a step's task, held open, waits for a person's word on this pass (agent-orchestrator, src/holds-open/holds-open.ts,
 * `holdsOpen`), which `approvalRefusal`'s laws read (`gate.contract.ts`), leaning on what this spec proves of it. The task turns on where
 * the step stands (`standing`, status.ts): the spec takes what `standing.contract.ts` proves of it, and nothing of its body.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../src/record/record.ts';
import type { StepSpec } from '../src/step/step.ts';
import { type SpendOf, standing } from '../src/status/status.ts';
import { gated } from './laws.ts';

const holdsOpenSpec = spec<
  (
    step: StepSpec,
    run: Run,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf: (step: string) => Closeout | undefined,
    askedCloseout: (taskId: string) => CloseoutAsked,
    steps: readonly StepSpec[],
    spendOf: SpendOf,
    verdictOf?: (step: string) => Verdict | undefined,
  ) => boolean
>({
  ensures: {
    notOnACancelledRun: {
      description: 'No step of a cancelled run is held open',
      condition: ({ input: [, run], output }) => !run.cancelledAt || !output,
    },
    notOnAPrunedRun: {
      description: 'No step of a pruned run is held open',
      condition: ({ input: [, run], output }) => !run.pruned || !output,
    },
    whileItSignedBlocked: {
      description: 'A step that signed off blocked is held open',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
        !!run.cancelledAt || !!run.pruned || standing(step, run, p, c, a, steps, s, v).own !== 'blocked' || output,
    },
    whileAGateChecks: {
      description: 'A gated step is held open while its check runs',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
        !!run.cancelledAt || !!run.pruned || !gated(step, run) || standing(step, run, p, c, a, steps, s, v).own !== 'checking' || output,
    },
    whileAGateWaits: {
      description: 'A gated step is held open while it awaits approval',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
        !!run.cancelledAt ||
        !!run.pruned ||
        !gated(step, run) ||
        standing(step, run, p, c, a, steps, s, v).status !== 'awaiting approval' ||
        output,
    },
    anUngatedStepOnlyBlocked: {
      description: 'An ungated step is held open only when it signed off blocked',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
        !output || gated(step, run) || standing(step, run, p, c, a, steps, s, v).own === 'blocked',
    },
    aGateHoldsOnlyWhileAPersonIsAsked: {
      description:
        'A gated step is held open only while it signed off blocked, its check runs, or it awaits approval: anything else closes it',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) => {
        if (!output || !gated(step, run)) return true;
        const stands = standing(step, run, p, c, a, steps, s, v);
        return stands.own === 'blocked' || stands.own === 'checking' || stands.status === 'awaiting approval';
      },
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type HoldsOpen = Implementation<typeof holdsOpenSpec>;
