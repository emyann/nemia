/**
 * Where a step stands (agent-orchestrator, src/status/status.ts): `standing`, the one place a step's status is decided,
 * which every call of it takes as this spec says (the gate's, `gate.contract.ts`). Its laws are proved whatever the
 * step's own status is (`ownStatus`, its closeout, its check, its session; taken as its spec below says) and whatever the
 * run has spent: the helpers that judge those are declared pure and nothing more, so each law holds of every value they
 * could give. What is read is how `standing` holds a step at its budget and at its gate.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, StepStatus, TaskPhase } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import { askedAgain, notHandedOn, overBudget, ownStatus, type SpendOf } from '../src/status/status.ts';
import { loopSpan } from '../src/workflow/validate.ts';
import { declaredOutput } from '../src/closeout/closeout.ts';
import { approved, gated } from './laws.ts';

/** Where a step stands, as `standing` takes and answers it: its own status, and the one a person reads. */
type Stands = (
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf?: (step: string) => Verdict | undefined,
) => { status: StepStatus; own: StepStatus };

export const overItsCap = assume(overBudget, { pure: true });
export const notYetHandedOn = assume(notHandedOn, { pure: true });
export const askedForARound = assume(askedAgain, { pure: true });
export const theLoopsSteps = assume(loopSpan, { pure: true });
export const whatItDeclared = assume(declaredOutput, { pure: true });

const standingSpec = spec<Stands>({
  /** The run holds a record of the step: `nemia start` writes one for each (start.verb.ts). */
  requires: ({ input: [step, run] }) => Object.hasOwn(run.steps, step.name),
  ensures: {
    awaitingOnlyAtAGate: {
      description: 'Awaiting approval covers both gates, and only a gate: after a step signs off, and before an ending is filed',
      condition: ({ input: [step, run], output }) => output.status !== 'awaiting approval' || gated(step, run),
    },
    awaitingIsUnapproved: {
      description: 'Nobody has approved the try that waits',
      condition: ({ input: [step, run], output }) => output.status !== 'awaiting approval' || !approved(run, step.name),
    },
    ownIsItsOwn: {
      description: "Its own status is the one ownStatus gives: standing reads a step's own work as ownStatus does, and holds it only above that",
      condition: ({ input: [step, run, p, c, a, steps, s], output }) => output.own === ownStatus(step, run, p, c, a, steps, s),
    },
    ownOrHeld: {
      description: 'Where a step stands but for its budget and its gate: its own status, or one of those two',
      condition: ({ output }) => output.status === output.own || output.status === 'over budget' || output.status === 'awaiting approval',
    },
    aCheckComesFirst: {
      description: 'Its check comes first: a gated step still checking is checking',
      condition: ({ output }) => output.own !== 'checking' || output.status === 'checking',
    },
    aGateHoldsASignedStep: {
      description:
        'A gated step that signed off on its own work awaits approval until the try it is on is approved, but where it asked for a round, is a later try of an ending approved before it was filed, or is held at its budget',
      condition: ({ input: [step, run, , c], output }) =>
        !gated(step, run) ||
        (output.own !== 'verified' && output.own !== 'unverified') ||
        approved(run, step.name) ||
        askedAgain(step, run, c) ||
        (step.workspace === 'base' && (run.steps[step.name]?.tries?.length ?? 0) > 0) ||
        output.status === 'awaiting approval' ||
        output.status === 'over budget',
    },
    aRoundIsNotHeldAtTheGate: {
      description: 'A looping step that asked for another round is not held at its gate: the gate is on what comes after it',
      condition: ({ input: [step, run, , c], output }) =>
        output.status !== 'awaiting approval' || output.own === 'pending' || !askedAgain(step, run, c),
    },
    overBudgetOnlyOnceFiled: {
      description: 'Over budget only where another session of it would be the way on: a step filed',
      condition: ({ input: [step, run], output }) => output.status !== 'over budget' || !!run.steps[step.name]?.taskId,
    },
    overBudgetOnlyOverACap: {
      description: 'Over budget only over its cap, or as a loop held by a step of it over its own',
      condition: ({ input: [step, run, , , , steps, s], output }) =>
        output.status !== 'over budget' || overBudget(step, run, s) !== undefined || steps.some((x) => x.name === step.name && !!x.loop),
    },
    overBudgetWhereATryIsTheWayOn: {
      description:
        'A filed step over its cap whose try ended unsigned, failed, stopped or denied reads over budget: another try of it is the way on, and nothing is left to spend on one',
      condition: ({ input: [step, run, , , , , s], output }) =>
        !run.steps[step.name]?.taskId ||
        overBudget(step, run, s) === undefined ||
        (output.own !== 'unsigned' && output.own !== 'failed' && output.own !== 'stopped' && output.own !== 'denied') ||
        output.status === 'over budget',
    },
    anEndingWaitsBeforeItIsFiled: {
      description: 'An ending approved before it is filed waits at its gate once every step before it has handed on',
      condition: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
        output.own !== 'pending' ||
        step.workspace !== 'base' ||
        !gated(step, run) ||
        !!run.cancelledAt ||
        !!run.steps[step.name]?.taskId ||
        approved(run, step.name) ||
        notHandedOn(step, run, p, c, a, steps, s, v ?? (() => undefined)).length > 0 ||
        output.status === 'awaiting approval',
    },
  },
});

/** `standing`'s type, which the code takes: it then imports nothing of tsverify. */
export type WhereAStepStands = Implementation<typeof standingSpec>;

/** `ownStatus` itself: what it says is a step's own status, never one `standing` holds it at. */
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
  ensures: {
    neverHeld: {
      description: 'A step on its own work is never at its budget or its gate, which standing alone says',
      condition: ({ output }) => output !== 'awaiting approval' && output !== 'over budget',
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type OwnStatus = Implementation<typeof ownStatusSpec>;
