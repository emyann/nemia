/**
 * Where a step or a run stands, and what a check said, as the codes the api carries beside each sentence (`phase`, `reason`, `verdict`):
 * the board's copies of agent-orchestrator's tables (`phase/phase.ts`, `check/check.ts`), which it never imports, held equal to them by
 * `test/wire.test.ts`. The board groups, colours and decides by these codes alone, and shows the sentence (`message`) as it comes. A code
 * this board does not know is refused at the decode, as an answer of an api built apart from it.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';

/** The phases a step stands in: to come, at work, waiting on a person, done, failed, stopped. */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;

/** Mirrors `StepPhase` in agent-orchestrator's phase/phase.ts: one of `STEP_PHASES`. */
export type StepPhase = (typeof STEP_PHASES)[number];

/** The phases a run stands in: a step's, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const;

/** Mirrors `RunPhase` in agent-orchestrator's phase/phase.ts: one of `RUN_PHASES`. */
export type RunPhase = (typeof RUN_PHASES)[number];

/**
 * What a wait on a thing waits on (reason `Waiting`, phase `pending`): other runs (`run`), the limit on runs in flight (`limit`), the
 * repository's checkout (`checkout`), or the store's pause (`pause`).
 */
export const WAIT_ON = ['run', 'limit', 'checkout', 'pause'] as const;

/** Mirrors `WaitOn` in agent-orchestrator's phase/phase.ts: one of `WAIT_ON`. */
export type WaitOn = (typeof WAIT_ON)[number];

/** Where a person is asked for an answer (reason `AwaitingAnswer`): by the session, which stopped to ask, or by its closeout. */
export const ANSWER_VIA = ['session', 'closeout'] as const;

/** Mirrors `AnswerVia` in agent-orchestrator's phase/phase.ts: one of `ANSWER_VIA`. */
export type AnswerVia = (typeof ANSWER_VIA)[number];

/**
 * The reasons a step stands in, the feed's codes: a wait on a person is an `Awaiting*` code or a stop beside them (phase `waiting`), a
 * wait on a thing is `Waiting` with what it waits on (`on`), and a step waiting on the steps before it is `Pending`.
 */
export const STEP_REASONS = [
  'Pending',
  'Waiting',
  'Running',
  'Checking',
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'Denied',
  'Succeeded',
  'CheckPassed',
  'Failed',
  'CheckFailed',
  'UnreadableCloseout',
  'Stopped',
  'Unknown',
] as const;

/** Mirrors `StepReason` in agent-orchestrator's phase/phase.ts: one of `STEP_REASONS`. */
export type StepReason = (typeof STEP_REASONS)[number];

/**
 * The reasons a run stands in: `assess`'s statuses, `Waiting` (on `run`) for a running run a person holds, and for a run a person's
 * word stops, the reason of its first step that waits on them.
 */
export const RUN_REASONS = [
  'Running',
  'Waiting',
  'Succeeded',
  'Failed',
  'Cancelled',
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'Denied',
] as const;

/** Mirrors `RunReason` in agent-orchestrator's phase/phase.ts: one of `RUN_REASONS`. */
export type RunReason = (typeof RUN_REASONS)[number];

/** What a check's verdict can be: passed, failed, unfinished (no verdict on the work), running, or unknown. */
export const CHECK_RESULTS = ['passed', 'failed', 'unfinished', 'running', 'unknown'] as const;

/** Mirrors `CheckResult` in agent-orchestrator's check/check.ts: one of `CHECK_RESULTS`. */
export type CheckResult = (typeof CHECK_RESULTS)[number];

/**
 * Mirrors `CheckVerdict` in agent-orchestrator's check/check.ts: a check's `result`, and the code it exited with — `0` once it passed,
 * the code it failed with, null where it has none.
 */
export type CheckVerdict = { result: CheckResult; exit: number | null };

/** Decodes a `StepPhase`. */
export const StepPhaseSchema = decodes<StepPhase>()(Schema.Literals(STEP_PHASES));

/** Decodes a `RunPhase`. */
export const RunPhaseSchema = decodes<RunPhase>()(Schema.Literals(RUN_PHASES));

/** Decodes a `StepReason`. */
export const StepReasonSchema = decodes<StepReason>()(Schema.Literals(STEP_REASONS));

/** Decodes a `RunReason`. */
export const RunReasonSchema = decodes<RunReason>()(Schema.Literals(RUN_REASONS));

/** Decodes a `WaitOn`. */
export const WaitOnSchema = decodes<WaitOn>()(Schema.Literals(WAIT_ON));

/** Decodes an `AnswerVia`. */
export const AnswerViaSchema = decodes<AnswerVia>()(Schema.Literals(ANSWER_VIA));

/** Decodes a `CheckVerdict`. */
export const CheckVerdictSchema = decodes<CheckVerdict>()(
  Schema.Struct({ result: Schema.Literals(CHECK_RESULTS), exit: Schema.NullOr(Schema.Number) }),
);

/**
 * A step's codes: its phase, its reason, what a `Waiting` waits on (`on`) and where an `AwaitingAnswer` is asked (`via`), each null on
 * any other reason. What the board reads a step's state from (`stepState`).
 */
export interface StepCodes {
  readonly phase: StepPhase;
  readonly reason: StepReason;
  readonly on: WaitOn | null;
  readonly via: AnswerVia | null;
}

/** A run's codes: its phase, its reason, and what qualifies that reason, as a step's (`StepCodes`). */
export interface RunCodes {
  readonly phase: RunPhase;
  readonly reason: RunReason;
  readonly on: WaitOn | null;
  readonly via: AnswerVia | null;
}

/** The fields of a run's codes (`RunCodes`), at every door that carries a run. */
export const RunCodesFields = {
  phase: RunPhaseSchema,
  reason: RunReasonSchema,
  on: Schema.NullOr(WaitOnSchema),
  via: Schema.NullOr(AnswerViaSchema),
} as const;

/**
 * The fields a step's row carries at every door: its codes, what qualifies its reason, and the sentence a person reads, never compared.
 */
export const StepCodesFields = {
  phase: StepPhaseSchema,
  reason: StepReasonSchema,
  on: Schema.NullOr(WaitOnSchema),
  via: Schema.NullOr(AnswerViaSchema),
  message: Schema.String,
} as const;
