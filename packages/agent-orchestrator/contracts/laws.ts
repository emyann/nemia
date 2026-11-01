/**
 * What the gate takes of where a step stands (`standing`, status.ts), written once: assumed by the gate's spec
 * (`gate.contract.ts`) and proved of the function itself by `standing.contract.ts`. Each speaks of a step the run
 * keeps a record of, which the proof requires (`nemia start` writes one for each step); of a step with none it says
 * nothing.
 */
import type { LawOf } from '@emyann/tsverify';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, StepStatus, TaskPhase } from '../src/record/record.ts';
import type { SpendOf } from '../src/status/status.ts';
import type { Workflow } from '../src/step/step.ts';

/** Where a step stands, as `standing` takes and answers it: its own status, and the one a person reads. */
export type StandingOf = (
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf?: (step: string) => Verdict | undefined,
) => { status: StepStatus; own: StepStatus };

type Law = LawOf<StandingOf>;

/** Whether a step is gated: by its workflow, or by the run (`--gate`). */
export const gated = (step: Workflow, run: Run): boolean => step.gate === true || (run.gates ?? []).includes(step.name);
/** The try a step is on, from 1: one past the tries its record keeps. */
export const tryNow = (run: Run, name: string): number => {
  const tries = run.steps[name]?.tries;
  return tries === undefined ? 1 : tries.length + 1;
};
/** Whether a person approved the try a step is on. */
export const approved = (run: Run, name: string): boolean =>
  (run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name));

/** `awaiting approval` covers both gates, and only a gate: after a step signs off, and before an ending is filed. */
export const awaitingOnlyAtAGate: Law = ({ input: [step, run], output }) =>
  !Object.hasOwn(run.steps, step.name) || output.status !== 'awaiting approval' || gated(step, run);
/** Nobody has approved the try that waits. */
export const awaitingIsUnapproved: Law = ({ input: [step, run], output }) =>
  !Object.hasOwn(run.steps, step.name) || output.status !== 'awaiting approval' || !approved(run, step.name);
/** Where it stands but for its budget and its gate: its own status, or one of those two. */
export const ownOrHeld: Law = ({ input: [step, run], output }) =>
  !Object.hasOwn(run.steps, step.name) ||
  output.status === output.own ||
  output.status === 'over budget' ||
  output.status === 'awaiting approval';
