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
import { type CloseoutAsked, type Run, type StepStatus, type TaskPhase, TRIED_FROM } from '../src/record/record.ts';
import type { StepSpec } from '../src/step/step.ts';
import { askedAgain, notHandedOn, overBudget, ownStatus, type SpendOf } from '../src/status/status.ts';
import { loopSpan } from '../src/workflow/validate.ts';
import { declaredOutput } from '../src/closeout/closeout.ts';
import { closeoutRefusals } from '../src/question/question.ts';
import { checksPhase } from '../src/check/checks-due.ts';
import { approved, gated } from './laws.ts';

/** Where a step stands, as `standing` takes and answers it: its own status, and the one a person reads. */
type Stands = (
  step: StepSpec,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly StepSpec[],
  spendOf: SpendOf,
  verdictOf?: (step: string) => Verdict | undefined,
) => { status: StepStatus; own: StepStatus };

/**
 * Whether a step is judged by an exit the run reads for itself: its `check:` line, a `checks:` list that holds one check at least,
 * or, for a command node, its own `run:` line.
 */
const judgedByAnExit = (step: StepSpec) => !!step.check || (step.checks?.length ?? 0) > 0 || step.run !== undefined;

/**
 * Whether a step is a wait node (`waitsFor:`): it runs no session and no command, and stands on its condition checks alone, which the
 * loader lays as its `checks:` (one per name, waiting on nothing), as Kubernetes' readinessGates name the conditions a Pod waits on.
 */
const waits = (step: StepSpec) => step.waitsFor !== undefined;

/**
 * Whether anything of a step is filed for the try it is on: its task, or, for a wait node, which files no task, its checks laid on its
 * record.
 */
const filed = (step: StepSpec, run: Run) => !!run.steps[step.name]?.taskId || (waits(step) && !!run.steps[step.name]?.check);

/** The words a wait node stands in on its own work: unfiled, then on its checks, and nothing a session or a command ends as. */
const WAIT_WORDS: ReadonlySet<StepStatus> = new Set<StepStatus>(['pending', 'checking', 'verified', 'failed (check)']);

export const overItsCap = assume(overBudget, { pure: true });
export const notYetHandedOn = assume(notHandedOn, { pure: true });
export const askedForARound = assume(askedAgain, { pure: true });
export const theLoopsSteps = assume(loopSpan, { pure: true });
export const whatItDeclared = assume(declaredOutput, { pure: true });
export const whatItRefuses = assume(closeoutRefusals, { pure: true });
export const whereItsChecksStand = assume(checksPhase, { pure: true });

const standingSpec = spec<Stands>({
  /** The run holds a record of the step: `nemia start` writes one for each (start.verb.ts). */
  requires: ({ input: [step, run] }) => Object.hasOwn(run.steps, step.name),
  /**
   * Whether a step is held is left to the code where it turns on what `phaseOf`, `closeoutOf`, `askedCloseout`, `spendOf` and
   * `verdictOf` say: a blocked step whose session has settled, a check that refused, a looping step's round, an ending not
   * yet filed. The verifier reads each callback as answering anew on each call, so a law that asks one cannot say what the
   * code was told; held by `test/assess-retries.test.ts` and `test/assess-rounds.test.ts` (over budget) and
   * `test/assess-gates.test.ts` and `test/assess-endings.test.ts` (awaiting approval) until a callback can be declared pure
   * (tsverify's `docs/roadmap.md`, "A function the code is given, declared pure where a spec says so").
   */
  open: ['output.status'],
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
      description:
        "Its own status is the one ownStatus gives: standing reads a step's own work as ownStatus does, and holds it only above that",
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
    aWaitIsNeverOverBudget: {
      description: 'A wait node spends nothing, since it runs no session: no budget holds it',
      condition: ({ input: [step], output }) => !waits(step) || output.status !== 'over budget',
    },
    overBudgetOnlyOverACap: {
      description: 'Over budget only over its cap, or as a loop held by a step of it over its own',
      condition: ({ input: [step, run, , , , steps, s], output }) =>
        output.status !== 'over budget' || overBudget(step, run, s) !== undefined || steps.some((x) => x.name === step.name && !!x.loop),
    },
    /**
     * A filed step over its cap whose try ended unsigned, failed, stopped or denied reads over budget: another try of it is the way on,
     * and nothing is left to spend on one. Said once per way a try ends, the laws together being the one sentence: tsverify 0.7.0
     * runs out of work on the four in one law (`bounded`), where 0.5.1 proved it and proves each alone. The failed try's law, last,
     * after the denied one: tsverify 0.8.0 ran out of work on it whole and proved it in two halves, split by whether the step has a
     * check; 0.9.0 proves it whole again.
     */
    overBudgetWhereATryUnsignedIsTheWayOn: {
      description:
        'A filed step over its cap whose try ended unsigned reads over budget: another try of it is the way on, and nothing is left to spend on one',
      condition: ({ input: [step, run, , , , , s], output }) =>
        !run.steps[step.name]?.taskId ||
        overBudget(step, run, s) === undefined ||
        output.own !== 'unsigned' ||
        output.status === 'over budget',
    },
    overBudgetWhereATryStoppedIsTheWayOn: {
      description:
        'A filed step over its cap whose try ended stopped reads over budget: another try of it is the way on, and nothing is left to spend on one',
      condition: ({ input: [step, run, , , , , s], output }) =>
        !run.steps[step.name]?.taskId ||
        overBudget(step, run, s) === undefined ||
        output.own !== 'stopped' ||
        output.status === 'over budget',
    },
    overBudgetWhereATryDeniedIsTheWayOn: {
      description:
        'A filed step over its cap whose try ended denied reads over budget: another try of it is the way on, and nothing is left to spend on one',
      condition: ({ input: [step, run, , , , , s], output }) =>
        !run.steps[step.name]?.taskId ||
        overBudget(step, run, s) === undefined ||
        output.own !== 'denied' ||
        output.status === 'over budget',
    },
    overBudgetWhereATryFailedIsTheWayOn: {
      description:
        'A filed step over its cap whose try ended failed reads over budget: another try of it is the way on, and nothing is left to spend on one',
      condition: ({ input: [step, run, , , , , s], output }) =>
        !run.steps[step.name]?.taskId ||
        overBudget(step, run, s) === undefined ||
        output.own !== 'failed' ||
        output.status === 'over budget',
    },
    noTryNoHold: {
      description:
        'A step still running, cut off at its cap by its harness, or out of rounds reads its own status: no other session of it is the way on, so neither its budget nor its gate holds it',
      condition: ({ output }) =>
        (output.own !== 'running' && output.own !== 'budget exhausted' && output.own !== 'exhausted') || output.status === output.own,
    },
    aTryHeldOnlyOverItsOwnCap: {
      description:
        'A step whose way on is a try of it (unsigned, failed, stopped, blocked, denied, or its check refused) is held only over its own cap, whatever its loop spends',
      condition: ({ input: [step, run, , , , , s], output }) =>
        output.status !== 'over budget' || !TRIED_FROM.has(output.own) || overBudget(step, run, s) !== undefined,
    },
    aGateHoldsOnlyASignedOrUnfiledStep: {
      description: 'A gate holds a step that signed off on its own work, or an ending not yet filed: nothing else awaits approval',
      condition: ({ output }) =>
        output.status !== 'awaiting approval' || output.own === 'verified' || output.own === 'unverified' || output.own === 'pending',
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
    step: StepSpec,
    run: Run,
    phaseOf: (taskId: string) => TaskPhase,
    closeoutOf: (step: string) => Closeout | undefined,
    askedCloseout: (taskId: string) => CloseoutAsked,
    steps: readonly StepSpec[],
    spendOf: SpendOf,
  ) => StepStatus
>({
  requires: ({ input: [step, run] }) => Object.hasOwn(run.steps, step.name),
  /**
   * Every status but pending turns on what `phaseOf`, `closeoutOf`, `askedCloseout` and `spendOf` say of its task, which the
   * verifier reads as answering anew on each call, so a law that asks one cannot say what the code was told; held by
   * `test/assess-lifecycle.test.ts`, `test/assess-closeouts.test.ts`, `test/assess-retries.test.ts` and
   * `test/assess-rounds.test.ts` until a callback can be declared pure (tsverify's `docs/roadmap.md`, "A function the code is
   * given, declared pure where a spec says so").
   */
  open: true,
  ensures: {
    neverHeld: {
      description: 'A step on its own work is never at its budget or its gate, which standing alone says',
      condition: ({ output }) => output !== 'awaiting approval' && output !== 'over budget',
    },
    neverRouted: {
      description:
        'A step on its own work is never sent nor skipped: those are its routing’s words, which routedWords lays over it from the other nodes',
      condition: ({ output }) => output !== 'sent' && output !== 'skipped',
    },
    pendingExactlyUnfiled: {
      description:
        'A step is pending exactly while nothing of it is filed: no task, and for a wait node, which files none, no checks laid on its record',
      condition: ({ input: [step, run], output }) => (output === 'pending') === !filed(step, run),
    },
    aWaitStandsOnlyOnItsConditions: {
      description:
        'A wait node runs no session and no command, so it is never running, unsigned, blocked, failed, stopped, denied, cut off at a budget nor out of rounds: it is pending, checking, verified, or refused at its check',
      condition: ({ input: [step], output }) => !waits(step) || WAIT_WORDS.has(output),
    },
    aWaitIsJudgedByItsChecks: {
      description: 'A wait node is never unverified: its conditions are checks, and only their verdict passes it',
      condition: ({ input: [step], output }) => !waits(step) || output !== 'unverified',
    },
    unverifiedOnlyWithNoCheck: {
      description: 'Unverified only of a step with no check nor command: a step with one is verified, checking, or its check failed',
      condition: ({ input: [step], output }) => output !== 'unverified' || !judgedByAnExit(step),
    },
    aCheckIsReadOnlyOfAStepWithOne: {
      description: 'Verified, checking, or failed at its check only of a step that has a check, or of a command node',
      condition: ({ input: [step], output }) =>
        (output !== 'verified' && output !== 'checking' && output !== 'failed (check)') || judgedByAnExit(step),
    },
    deniedOnlyUnderDenialsFail: {
      description: 'Denied only of a step whose denials fail it',
      condition: ({ input: [step], output }) => output !== 'denied' || step.denials === 'fail',
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type OwnStatus = Implementation<typeof ownStatusSpec>;
