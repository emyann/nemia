/**
 * Where a step stands (agent-orchestrator, src/status/status.ts): `standing`, the one place a step's status is decided,
 * whose laws the gate's spec assumes (`gate.contract.ts`). Its laws are proved whatever the step's own status is
 * (`ownStatus`, its closeout, its check, its session) and whatever the run has spent: the helpers that judge those are
 * declared pure and nothing more, so each law holds of every value they could give. What is read is how `standing`
 * holds a step at its budget and at its gate.
 */
import { assume, spec } from '@emyann/tsverify';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, StepStatus, TaskPhase } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import { askedAgain, notHandedOn, overBudget, ownStatus, type SpendOf } from '../src/status/status.ts';
import { loopSpan } from '../src/workflow/validate.ts';
import { declaredOutput } from '../src/closeout/closeout.ts';
import { approved, awaitingIsUnapproved, awaitingOnlyAtAGate, gated, ownOrHeld, type StandingOf } from './laws.ts';

/** Never at its budget or its gate, which `standing` alone says: `ownStatus`'s law, proved below and assumed of it. */
const neverHeld = ({ output }: { readonly output: StepStatus }): boolean => output !== 'awaiting approval' && output !== 'over budget';

/** Where a step stands on its own work, as its spec below proves it. */
export const itsOwnStatus = assume(ownStatus, { pure: true, ensures: { neverHeld } });
export const overItsCap = assume(overBudget, { pure: true });
export const notYetHandedOn = assume(notHandedOn, { pure: true });
export const askedForARound = assume(askedAgain, { pure: true });
export const theLoopsSteps = assume(loopSpan, { pure: true });
export const whatItDeclared = assume(declaredOutput, { pure: true });

const standingSpec = spec<StandingOf>({
  /** The run holds a record of the step: `nemia start` writes one for each (start.verb.ts). */
  requires: ({ input: [step, run] }) => Object.hasOwn(run.steps, step.name),
  ensures: {
    /** What the gate's spec assumes of it (laws.ts). */
    awaitingOnlyAtAGate,
    awaitingIsUnapproved,
    ownOrHeld,
    /** Its check comes first: a gated step still checking is checking. */
    aCheckComesFirst: ({ output }) => output.own !== 'checking' || output.status === 'checking',
    /**
     * A gated step that signed off on its own work reads `awaiting approval` until the try it is on is approved, but
     * where it asked for a round, is a later try of an ending approved before it was filed, or is held at its budget.
     */
    aGateHoldsASignedStep: ({ input: [step, run, , c], output }) =>
      !gated(step, run) ||
      (output.own !== 'verified' && output.own !== 'unverified') ||
      approved(run, step.name) ||
      askedAgain(step, run, c) ||
      (step.workspace === 'base' && (run.steps[step.name]?.tries?.length ?? 0) > 0) ||
      output.status === 'awaiting approval' ||
      output.status === 'over budget',
    /** A looping step that asked for another round is not held at its gate: the gate is on what comes after it. */
    aRoundIsNotHeldAtTheGate: ({ input: [step, run, , c], output }) =>
      output.status !== 'awaiting approval' || output.own === 'pending' || !askedAgain(step, run, c),
    /** Over budget only where another session of it would be the way on: a step filed. */
    overBudgetOnlyOnceFiled: ({ input: [step, run], output }) => output.status !== 'over budget' || !!run.steps[step.name]?.taskId,
    /** And only over its cap, or as a loop held by a step of it over its own. */
    overBudgetOnlyOverACap: ({ input: [step, run, , , , steps, s], output }) =>
      output.status !== 'over budget' || overBudget(step, run, s) !== undefined || steps.some((x) => x.name === step.name && !!x.loop),
    /** An ending approved before it is filed waits at its gate once every step before it has handed on. */
    anEndingWaitsBeforeItIsFiled: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
      output.own !== 'pending' ||
      step.workspace !== 'base' ||
      !gated(step, run) ||
      !!run.cancelledAt ||
      !!run.steps[step.name]?.taskId ||
      approved(run, step.name) ||
      notHandedOn(step, run, p, c, a, steps, s, v ?? (() => undefined)).length > 0 ||
      output.status === 'awaiting approval',
  },
});

/** `ownStatus` itself: what it says is a step's own status, never one `standing` holds it at. */
export type StandingSpec = typeof standingSpec;

const ownStatusSpec = spec<
  (
    step: Workflow,
    run: Run,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf: (step: string) => Closeout | undefined,
    askedCloseout: (taskId: string) => CloseoutAsked,
    steps: readonly Workflow[],
    spendOf: SpendOf,
  ) => StepStatus
>({
  requires: ({ input: [step, run] }) => Object.hasOwn(run.steps, step.name),
  ensures: { neverHeld },
});
export type OwnStatusSpec = typeof ownStatusSpec;
