/**
 * Which codes a step, a try and a run are served with together: the phase each reason stands in (`STEP_PHASE_OF`, `RUN_PHASE_OF`), and
 * whether a set of codes is one the package makes (`stepCodesLegal`, `tryCodesLegal`, `runCodesLegal`,
 * contracts/codes.contract.ts). The served objects' schemas ask them (`run.ts`), so a set nothing makes is refused where an object is
 * encoded and where a client decodes it; the package that makes the codes takes its phases from these tables. Total over the words
 * (`words.ts`), so a reason added there with no phase here fails the typecheck. Pure.
 */
import type { RunCodesLegal, StepCodesLegal, TryCodesLegal } from '../contracts/codes.contract.ts';
import type { RunPhase, RunReason, StepPhase, StepReason } from './words.ts';

export type { RunCodes, StepCodes, TryCodes } from '../contracts/codes.contract.ts';

/**
 * The phase each step reason stands in. `waiting` is a wait on a person, and nothing else: a step not filed — waiting on a step
 * (`Pending`), or on a thing (`Waiting`: a run, the limit, the base or the pause) — is `pending`, to come. `Unknown`, a task the engine
 * has no record of, is `pending` too, as the engine folds it; a step whose record does not read at all is `failed` with `Unknown`
 * (`stepCodesLegal` takes both).
 */
export const STEP_PHASE_OF = {
  Pending: 'pending',
  Waiting: 'pending',
  Unknown: 'pending',
  Running: 'running',
  Checking: 'running',
  Paused: 'running',
  AwaitingApproval: 'waiting',
  AwaitingAnswer: 'waiting',
  AwaitingRound: 'waiting',
  OverBudget: 'waiting',
  BudgetExhausted: 'waiting',
  Unsigned: 'waiting',
  Denied: 'waiting',
  Succeeded: 'succeeded',
  CheckPassed: 'succeeded',
  Failed: 'failed',
  CheckFailed: 'failed',
  UnreadableCloseout: 'failed',
  Stopped: 'stopped',
  Skipped: 'stopped',
  Sent: 'succeeded',
} as const satisfies Readonly<Record<StepReason, StepPhase>>;

/** The phase each run reason stands in: a run a person stops is `waiting`, and a held one `pending`, as a step waiting on a thing is. */
export const RUN_PHASE_OF = {
  Running: 'running',
  Waiting: 'pending',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Cancelled: 'cancelled',
  AwaitingApproval: 'waiting',
  AwaitingAnswer: 'waiting',
  AwaitingRound: 'waiting',
  OverBudget: 'waiting',
  BudgetExhausted: 'waiting',
  Unsigned: 'waiting',
  Denied: 'waiting',
} as const satisfies Readonly<Record<RunReason, RunPhase>>;

/**
 * Whether `phase` is one a step or a try in `reason` is served in:
 * its reason's, or `failed` for an `Unknown` whose record does not read.
 */
const stepPhaseFits = (phase: StepPhase, reason: StepReason): boolean =>
  phase === STEP_PHASE_OF[reason] || (reason === 'Unknown' && phase === 'failed');

/** Whether a step's codes are a set the package makes. */
export const stepCodesLegal: StepCodesLegal = (codes) =>
  stepPhaseFits(codes.phase, codes.reason) &&
  (codes.on !== null) === (codes.reason === 'Waiting') &&
  (codes.via !== null) === (codes.reason === 'AwaitingAnswer');

/** Whether a try's codes are a set the package makes. */
export const tryCodesLegal: TryCodesLegal = (codes) => stepPhaseFits(codes.phase, codes.reason);

/** Whether a run's codes are a set the package makes: a run may await an answer and say no `via`, where no step of it does. */
export const runCodesLegal: RunCodesLegal = (codes) =>
  codes.phase === RUN_PHASE_OF[codes.reason] &&
  (codes.on !== null) === (codes.reason === 'Waiting') &&
  (codes.via === null || codes.reason === 'AwaitingAnswer');
