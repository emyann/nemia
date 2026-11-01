/**
 * A gate, from a person's side (agent-orchestrator, src/gate/gate.ts): why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word (`holdsOpen`). Both turn on where
 * the step stands (`standing`, status.ts), which reads some forty functions of the run's record and closeouts: what
 * the gate takes of it is declared below, every law proved of the function itself (`standing.contract.ts`). The send-back
 * (`retryable`) and the steps an ending waits on (`notHandedOn`) only shape what a refusal says: declared pure, and
 * nothing more.
 */
import { assume, contract } from '@emyann/tsverify';
import { approvalRefusal, holdsOpen } from '../src/gate/gate.ts';
import { retryable } from '../src/retry/retry.ts';
import { notHandedOn, standing } from '../src/status/status.ts';
import { awaitingIsUnapproved, awaitingOnlyAtAGate, gated, ownOrHeld, tryNow } from './laws.ts';

/** What the gate takes of where a step stands: its status's doc comment, proved of `standing` (`standing.contract.ts`). */
export const standingOf = assume(standing, {
  pure: true,
  ensures: { awaitingOnlyAtAGate, awaitingIsUnapproved, ownOrHeld },
});
export const sendBack = assume(retryable, { pure: true });
export const unfinished = assume(notHandedOn, { pure: true });

export const approved = contract(approvalRefusal, {
  /** A run holds a record of each of its steps: `nemia start` writes one for each (start.verb.ts). */
  requires: (steps, run) => steps.every((s) => Object.hasOwn(run.steps, s.name)),
  ensures: {
    emptyWords: (_steps, _run, _name, message, _p, _c, _a, _v, _asks, _s, _st, out) =>
      message === undefined || message.trim() !== '' || out !== null,
    aStepOfTheWorkflow: (steps, _run, name, _m, _p, _c, _a, _v, _asks, _s, _st, out) => steps.some((s) => s.name === name) || out !== null,
    aCancelledRunFilesNothing: (_steps, run, _name, _m, _p, _c, _a, _v, _asks, _s, _st, out) => !run.cancelledAt || out !== null,
    aPrunedRunFilesNothing: (_steps, run, _name, _m, _p, _c, _a, _v, _asks, _s, _st, out) => !run.pruned || out !== null,
    aHeldRunFilesNothing: (_steps, run, _name, _m, _p, _c, _a, _v, _asks, _s, _st, out) => !run.hold || out !== null,
    onlyAGate: (steps, run, name, _m, _p, _c, _a, _v, _asks, _s, _st, out) => {
      const step = steps.find((s) => s.name === name);
      return out !== null || (step !== undefined && gated(step, run));
    },
    onceATry: (_steps, run, name, _m, _p, _c, _a, _v, _asks, _s, _st, out) =>
      out !== null || !(run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name)),
    notWhileASendBackIsAsked: (_steps, run, name, _m, _p, _c, _a, _v, asks, _s, _st, out) =>
      out !== null || !(asks ?? []).some((x) => x.step === name && x.try === tryNow(run, name) + 1),
    onlyWhereItWaits: (steps, run, name, _m, p, c, a, v, _asks, s, _st, out) => {
      const step = steps.find((x) => x.name === name);
      return (
        out !== null ||
        (step !== undefined &&
          standing(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v).status ===
            'awaiting approval')
      );
    },
    /** What `nemia approve` accepts, the step's task is held open for: the approval reaches the session that waits. */
    heldOpenForIt: (steps, run, name, _m, p, c, a, v, _asks, s, _st, out) => {
      const step = steps.find((x) => x.name === name);
      return (
        out !== null ||
        (step !== undefined && holdsOpen(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v))
      );
    },
    anEndingAlreadyLanded: (steps, run, name, _m, _p, _c, _a, _v, _asks, _s, standings, out) => {
      const step = steps.find((x) => x.name === name);
      const on = standings ?? [];
      return (
        out !== null ||
        step === undefined ||
        step.workspace !== 'main' ||
        !gated(step, run) ||
        !!run.steps[name]?.taskId ||
        on.length === 0 ||
        !on.every((b) => b.where === 'on')
      );
    },
    anEndingWhileItsWorkIsSentBack: (steps, run, name, _m, _p, _c, _a, _v, asks, _s, _st, out) => {
      const step = steps.find((x) => x.name === name);
      return (
        out !== null ||
        step === undefined ||
        step.workspace !== 'main' ||
        !gated(step, run) ||
        !!run.steps[name]?.taskId ||
        !(asks ?? []).some((x) => step.after.includes(x.step))
      );
    },
  },
});

export const held = contract(holdsOpen, {
  ensures: {
    notOnACancelledRun: (_step, run, _p, _c, _a, _steps, _s, _v, out) => !run.cancelledAt || !out,
    notOnAPrunedRun: (_step, run, _p, _c, _a, _steps, _s, _v, out) => !run.pruned || !out,
    whileItSignedBlocked: (step, run, p, c, a, steps, s, v, out) =>
      !!run.cancelledAt || !!run.pruned || standing(step, run, p, c, a, steps, s, v).own !== 'blocked' || out,
    whileAGateChecks: (step, run, p, c, a, steps, s, v, out) =>
      !!run.cancelledAt || !!run.pruned || !gated(step, run) || standing(step, run, p, c, a, steps, s, v).own !== 'checking' || out,
    whileAGateWaits: (step, run, p, c, a, steps, s, v, out) =>
      !!run.cancelledAt ||
      !!run.pruned ||
      !gated(step, run) ||
      standing(step, run, p, c, a, steps, s, v).status !== 'awaiting approval' ||
      out,
    anUngatedStepOnlyBlocked: (step, run, p, c, a, steps, s, v, out) =>
      !out || gated(step, run) || standing(step, run, p, c, a, steps, s, v).own === 'blocked',
  },
});
