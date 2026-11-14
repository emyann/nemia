/**
 * Which codes a step, a try and a run may be served with together (objects, src/codes.ts: `stepCodesLegal`, `tryCodesLegal`,
 * `runCodesLegal`). A step is served as four fields — the `phase` it is in, the `reason` it stands there, what it waits `on`, and
 * where its answer is asked (`via`) — and a schema of four independent fields takes sixteen hundred sets of them, of which the
 * package makes twenty-four. These say which: a reason has its phase, a wait says what it waits on and nothing else does, and an
 * answer awaited says where it is asked. The schemas of the served objects refuse every other set, as they are encoded and as a
 * client decodes them.
 *
 * The groups below are the statement of which reason stands in which phase; the code keeps its own table (`STEP_PHASE_OF`,
 * `RUN_PHASE_OF`), and the proof is that the two agree.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { AnswerVia, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from '../src/words.ts';

/** A step's codes as served. */
export type StepCodes = {
  readonly phase: StepPhase;
  readonly reason: StepReason;
  readonly on: WaitOn | null;
  readonly via: AnswerVia | null;
};

/** A try's codes as served: it waits on nothing of its own. */
export type TryCodes = { readonly phase: StepPhase; readonly reason: StepReason };

/** A run's codes as served. */
export type RunCodes = {
  readonly phase: RunPhase;
  readonly reason: RunReason;
  readonly on: WaitOn | null;
  readonly via: AnswerVia | null;
};

/** Whether a step in `reason` is still to come: not filed, waiting on a step or a thing, or of a task the engine has no record of. */
const toCome = (reason: StepReason): boolean => reason === 'Pending' || reason === 'Waiting' || reason === 'Unknown';

/** Whether a step in `reason` is at work: its session, its check, or parked by the store's pause. */
const atWork = (reason: StepReason): boolean => reason === 'Running' || reason === 'Checking' || reason === 'Paused';

/** Whether `reason` is a wait on a person, of a step or of a run. */
const onAPerson = (reason: StepReason | RunReason): boolean =>
  reason === 'AwaitingApproval' ||
  reason === 'AwaitingAnswer' ||
  reason === 'AwaitingRound' ||
  reason === 'OverBudget' ||
  reason === 'BudgetExhausted' ||
  reason === 'Unsigned' ||
  reason === 'Denied';

/** Whether a step in `reason` is done: on its own word, on its check's, or its card sent. */
const done = (reason: StepReason): boolean => reason === 'Succeeded' || reason === 'CheckPassed' || reason === 'Sent';

/** Whether a step in `reason` broke: its task, its check, or a closeout that does not read. */
const broke = (reason: StepReason): boolean => reason === 'Failed' || reason === 'CheckFailed' || reason === 'UnreadableCloseout';

/** The phase a step that is neither to come nor at work stands in: waiting on a person, done, broken, or stopped. */
const restingPhase = (reason: StepReason): StepPhase => {
  if (onAPerson(reason)) return 'waiting';
  if (done(reason)) return 'succeeded';
  return broke(reason) ? 'failed' : 'stopped';
};

/** The phase a step in `reason` stands in. */
const stepPhase = (reason: StepReason): StepPhase => {
  if (toCome(reason)) return 'pending';
  return atWork(reason) ? 'running' : restingPhase(reason);
};

/**
 * Whether `phase` is one a step in `reason` is served in. One reason has two: `Unknown` is to come, as the engine folds a task it has no
 * record of, and `failed` for a step whose record does not read at all, which nothing judges.
 */
const stepPhaseFits = (phase: StepPhase, reason: StepReason): boolean =>
  phase === stepPhase(reason) || (reason === 'Unknown' && phase === 'failed');

/** Whether `phase` is the phase a run in `reason` stands in: a run a person holds is to come, and one stopped on a person waits. */
const runPhaseFits = (phase: RunPhase, reason: RunReason): boolean =>
  reason === 'Running'
    ? phase === 'running'
    : reason === 'Waiting'
      ? phase === 'pending'
      : reason === 'Succeeded'
        ? phase === 'succeeded'
        : reason === 'Failed'
          ? phase === 'failed'
          : reason === 'Cancelled'
            ? phase === 'cancelled'
            : phase === 'waiting';

const stepCodesLegalSpec = spec<(codes: StepCodes) => boolean>({
  ensures: {
    legalExactlyWhenEachCodeFitsItsReason: {
      description:
        'A step’s codes are legal exactly when its phase is its reason’s, it says what it waits on exactly when it is Waiting, and where its answer is asked exactly when it is AwaitingAnswer',
      condition: ({ input: [codes], output }) =>
        output ===
        (stepPhaseFits(codes.phase, codes.reason) &&
          (codes.on !== null) === (codes.reason === 'Waiting') &&
          (codes.via !== null) === (codes.reason === 'AwaitingAnswer')),
    },
  },
});
export type StepCodesLegal = Implementation<typeof stepCodesLegalSpec>;

const tryCodesLegalSpec = spec<(codes: TryCodes) => boolean>({
  ensures: {
    legalExactlyWhenThePhaseIsItsReasons: {
      description: 'A try’s codes are legal exactly when its phase is its reason’s',
      condition: ({ input: [codes], output }) => output === stepPhaseFits(codes.phase, codes.reason),
    },
  },
});
export type TryCodesLegal = Implementation<typeof tryCodesLegalSpec>;

const runCodesLegalSpec = spec<(codes: RunCodes) => boolean>({
  ensures: {
    legalExactlyWhenEachCodeFitsItsReason: {
      description:
        'A run’s codes are legal exactly when its phase is its reason’s, it says what it waits on exactly when it is Waiting, and it says where an answer is asked only when it is AwaitingAnswer',
      condition: ({ input: [codes], output }) =>
        output ===
        (runPhaseFits(codes.phase, codes.reason) &&
          (codes.on !== null) === (codes.reason === 'Waiting') &&
          (codes.via === null || codes.reason === 'AwaitingAnswer')),
    },
  },
});
export type RunCodesLegal = Implementation<typeof runCodesLegalSpec>;
