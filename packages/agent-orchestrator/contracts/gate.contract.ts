/**
 * A gate, from a person's side (agent-orchestrator, src/gate/gate.ts): why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word (`holdsOpen`). Both turn on where
 * the step stands (`standing`, status.ts), which reads some forty functions of the run's record and closeouts: what
 * the gate takes of it is declared below, every law proved of the function itself (`standing.contract.ts`). The send-back
 * (`retryable`) and the steps an ending waits on (`notHandedOn`) only shape what a refusal says: declared pure, and
 * nothing more.
 */
import { assume, spec } from '@emyann/tsverify';
import { holdsOpen } from '../src/gate/gate.ts';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../src/record/record.ts';
import type { RetryAsk } from '../src/retry/index.ts';
import type { Workflow } from '../src/step/step.ts';
import { retryable } from '../src/retry/retry.ts';
import { type BranchStanding, notHandedOn, type SpendOf, standing } from '../src/status/status.ts';
import { awaitingIsUnapproved, awaitingOnlyAtAGate, gated, ownOrHeld, tryNow } from './laws.ts';

/** What the gate takes of where a step stands: its status's doc comment, proved of `standing` (`standing.contract.ts`). */
export const standingOf = assume(standing, {
  pure: true,
  ensures: { awaitingOnlyAtAGate, awaitingIsUnapproved, ownOrHeld },
});
export const sendBack = assume(retryable, { pure: true });
export const unfinished = assume(notHandedOn, { pure: true });

const approvalRefusalSpec = spec<
  (
    steps: readonly Workflow[],
    run: Run,
    name: string,
    message: string | undefined,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf?: (step: string) => Closeout | undefined,
    askedCloseout?: (taskId: string) => CloseoutAsked,
    verdictOf?: (step: string) => Verdict | undefined,
    asks?: readonly RetryAsk[],
    spendOf?: SpendOf,
    standings?: readonly BranchStanding[],
  ) => string | null
>({
  /** A run holds a record of each of its steps: `nemia start` writes one for each (start.verb.ts). */
  requires: ({ input: [steps, run] }) => steps.every((s) => Object.hasOwn(run.steps, s.name)),
  ensures: {
    emptyWords: ({ input: [, , , message], output }) => message === undefined || message.trim() !== '' || output !== null,
    aStepOfTheWorkflow: ({ input: [steps, , name], output }) => steps.some((s) => s.name === name) || output !== null,
    aCancelledRunFilesNothing: ({ input: [, run], output }) => !run.cancelledAt || output !== null,
    aPrunedRunFilesNothing: ({ input: [, run], output }) => !run.pruned || output !== null,
    aHeldRunFilesNothing: ({ input: [, run], output }) => !run.hold || output !== null,
    onlyAGate: ({ input: [steps, run, name], output }) => {
      const step = steps.find((s) => s.name === name);
      return output !== null || (step !== undefined && gated(step, run));
    },
    onceATry: ({ input: [, run, name], output }) =>
      output !== null || !(run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name)),
    notWhileASendBackIsAsked: ({ input: [, run, name, , , , , , asks], output }) =>
      output !== null || !(asks ?? []).some((x) => x.step === name && x.try === tryNow(run, name) + 1),
    onlyWhereItWaits: ({ input: [steps, run, name, , p, c, a, v, , s], output }) => {
      const step = steps.find((x) => x.name === name);
      return (
        output !== null ||
        (step !== undefined &&
          standing(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v).status ===
            'awaiting approval')
      );
    },
    /** What `nemia approve` accepts, the step's task is held open for: the approval reaches the session that waits. */
    heldOpenForIt: ({ input: [steps, run, name, , p, c, a, v, , s], output }) => {
      const step = steps.find((x) => x.name === name);
      return (
        output !== null ||
        (step !== undefined && holdsOpen(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v))
      );
    },
    anEndingAlreadyLanded: ({ input: [steps, run, name, , , , , , , , standings], output }) => {
      const step = steps.find((x) => x.name === name);
      const on = standings ?? [];
      return (
        output !== null ||
        step === undefined ||
        step.workspace !== 'base' ||
        !gated(step, run) ||
        !!run.steps[name]?.taskId ||
        on.length === 0 ||
        !on.every((b) => b.where === 'on')
      );
    },
    anEndingWhileItsWorkIsSentBack: ({ input: [steps, run, name, , , , , , asks], output }) => {
      const step = steps.find((x) => x.name === name);
      return (
        output !== null ||
        step === undefined ||
        step.workspace !== 'base' ||
        !gated(step, run) ||
        !!run.steps[name]?.taskId ||
        !(asks ?? []).some((x) => step.after.includes(x.step))
      );
    },
  },
});

export type ApprovalRefusalSpec = typeof approvalRefusalSpec;

const holdsOpenSpec = spec<
  (
    step: Workflow,
    run: Run,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf: (step: string) => Closeout | undefined,
    askedCloseout: (taskId: string) => CloseoutAsked,
    steps: readonly Workflow[],
    spendOf: SpendOf,
    verdictOf?: (step: string) => Verdict | undefined,
  ) => boolean
>({
  ensures: {
    notOnACancelledRun: ({ input: [, run], output }) => !run.cancelledAt || !output,
    notOnAPrunedRun: ({ input: [, run], output }) => !run.pruned || !output,
    whileItSignedBlocked: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
      !!run.cancelledAt || !!run.pruned || standing(step, run, p, c, a, steps, s, v).own !== 'blocked' || output,
    whileAGateChecks: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
      !!run.cancelledAt || !!run.pruned || !gated(step, run) || standing(step, run, p, c, a, steps, s, v).own !== 'checking' || output,
    whileAGateWaits: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
      !!run.cancelledAt ||
      !!run.pruned ||
      !gated(step, run) ||
      standing(step, run, p, c, a, steps, s, v).status !== 'awaiting approval' ||
      output,
    anUngatedStepOnlyBlocked: ({ input: [step, run, p, c, a, steps, s, v], output }) =>
      !output || gated(step, run) || standing(step, run, p, c, a, steps, s, v).own === 'blocked',
  },
});
export type HoldsOpenSpec = typeof holdsOpenSpec;
