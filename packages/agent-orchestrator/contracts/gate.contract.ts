/**
 * A gate, from a person's side (agent-orchestrator, src/gate/gate.ts): why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word (`holdsOpen`). Both turn on where
 * the step stands (`standing`, status.ts), which reads some forty functions of the run's record and closeouts: the gate
 * takes what its spec proves of it (`standing.contract.ts`), and nothing of its body. The send-back (`retryable`) and the
 * steps an ending waits on (`notHandedOn`) only shape what a refusal says: declared pure, and nothing more.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { holdsOpen } from '../src/gate/gate.ts';
import type { Verdict } from '../src/check/check.ts';
import type { Closeout } from '../src/closeout/index.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../src/record/record.ts';
import type { RetryAsk } from '../src/retry/index.ts';
import type { Workflow } from '../src/step/step.ts';
import { retryable } from '../src/retry/retry.ts';
import { type BranchStanding, notHandedOn, type SpendOf, standing } from '../src/status/status.ts';
import { gated, tryNow } from './laws.ts';

export const sendBack = assume(retryable, { pure: true });
export const unfinished = assume(notHandedOn, { pure: true });

/**
 * Whether a step is an ending not yet filed whose approval would take what is not there to take: a step it comes after is sent
 * back, or every result branch is already on the base.
 */
const anEndingNotToTake = (step: Workflow, run: Run, asks: readonly RetryAsk[], standings: readonly BranchStanding[]): boolean =>
  step.workspace === 'base' &&
  gated(step, run) &&
  !run.steps[step.name]?.taskId &&
  (asks.some((x) => step.after.includes(x.step)) || (standings.length > 0 && standings.every((b) => b.where === 'on')));

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
    emptyWords: {
      description: 'A message given blank is refused',
      condition: ({ input: [, , , message], output }) => message === undefined || message.trim() !== '' || output !== null,
    },
    aStepOfTheWorkflow: {
      description: 'A name that is no step of the workflow is refused',
      condition: ({ input: [steps, , name], output }) => steps.some((s) => s.name === name) || output !== null,
    },
    aCancelledRunFilesNothing: {
      description: 'Nothing is approved on a cancelled run',
      condition: ({ input: [, run], output }) => !run.cancelledAt || output !== null,
    },
    aPrunedRunFilesNothing: {
      description: 'Nothing is approved on a pruned run',
      condition: ({ input: [, run], output }) => !run.pruned || output !== null,
    },
    aHeldRunFilesNothing: {
      description: 'Nothing is approved on a held run',
      condition: ({ input: [, run], output }) => !run.hold || output !== null,
    },
    onlyAGate: {
      description: 'Only a gated step is approved',
      condition: ({ input: [steps, run, name], output }) => {
        const step = steps.find((s) => s.name === name);
        return output !== null || (step !== undefined && gated(step, run));
      },
    },
    onceATry: {
      description: 'A try is approved once',
      condition: ({ input: [, run, name], output }) =>
        output !== null || !(run.approvals ?? []).some((x) => x.step === name && x.try === tryNow(run, name)),
    },
    notWhileASendBackIsAsked: {
      description: 'Nothing is approved while the step is sent back for another try',
      condition: ({ input: [, run, name, , , , , , asks], output }) =>
        output !== null || !(asks ?? []).some((x) => x.step === name && x.try === tryNow(run, name) + 1),
    },
    onlyWhereItWaits: {
      description: 'Only a step that awaits approval is approved',
      condition: ({ input: [steps, run, name, , p, c, a, v, , s], output }) => {
        const step = steps.find((x) => x.name === name);
        return (
          output !== null ||
          (step !== undefined &&
            standing(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v).status ===
              'awaiting approval')
        );
      },
    },
    takenAtItsGate: {
      description:
        'An approval of a step waiting at its gate, on a run neither cancelled nor pruned, is taken: but where its words are blank, the run is held, the try after it is asked for, or it is an ending not yet filed whose work is sent back or already on the base',
      condition: ({ input: [steps, run, name, message, p, c, a, v, asks, s, standings], output }) => {
        const step = steps.find((x) => x.name === name);
        if (step === undefined || run.cancelledAt || run.pruned) return true;
        if (message !== undefined && message.trim() === '') return true;
        if (run.hold) return true;
        const asked = asks ?? [];
        if (asked.some((x) => x.step === name && x.try === tryNow(run, name) + 1)) return true;
        if (anEndingNotToTake(step, run, asked, standings ?? [])) return true;
        const waits =
          standing(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v).status ===
          'awaiting approval';
        return !waits || output === null;
      },
    },
    heldOpenForIt: {
      description: "What nemia approve accepts, the step's task is held open for: the approval reaches the session that waits",
      condition: ({ input: [steps, run, name, , p, c, a, v, , s], output }) => {
        const step = steps.find((x) => x.name === name);
        return (
          output !== null ||
          (step !== undefined && holdsOpen(step, run, p, c ?? (() => undefined), a ?? (() => false), steps, s ?? (() => undefined), v))
        );
      },
    },
    anEndingAlreadyLanded: {
      description: "An ending not yet filed is refused once every result branch is on the base: git has already taken the run's result",
      condition: ({ input: [steps, run, name, , , , , , , , standings], output }) => {
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
    },
    anEndingWhileItsWorkIsSentBack: {
      description: 'An ending not yet filed is refused while a step it comes after is sent back',
      condition: ({ input: [steps, run, name, , , , , , asks], output }) => {
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
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovalRefusal = Implementation<typeof approvalRefusalSpec>;

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
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type HoldsOpen = Implementation<typeof holdsOpenSpec>;
