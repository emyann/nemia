/**
 * Where a step or a run stands, and what a check said, as the codes the api carries beside each sentence (`phase`, `reason`, `verdict`):
 * the board's copies of agent-orchestrator's tables (`feed/phase.ts`, `check/check.ts`), which it never imports, held equal to them by
 * `test/wire.test.ts`. The board groups, colours and decides by these codes alone, and shows the sentence (`message`) as it comes. A code
 * this board does not know is refused at the decode, as an answer of an api built apart from it.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';

/** The phases a step stands in: to come, at work, waiting on a person, done, failed, stopped. */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;

/** Mirrors `StepPhase` in agent-orchestrator's feed/phase.ts: one of `STEP_PHASES`. */
export type StepPhase = (typeof STEP_PHASES)[number];

/** The phases a run stands in: a step's, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const;

/** Mirrors `RunPhase` in agent-orchestrator's feed/phase.ts: one of `RUN_PHASES`. */
export type RunPhase = (typeof RUN_PHASES)[number];

/** The reasons a step stands in, the feed's codes. */
export const STEP_REASONS = [
  'Pending',
  'Waiting',
  'WaitingForSlot',
  'WaitingForCheckout',
  'WaitingForPause',
  'Running',
  'Checking',
  'NeedsHuman',
  'AwaitingApproval',
  'Blocked',
  'RoundsExhausted',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'CheckDenied',
  'Succeeded',
  'CheckPassed',
  'Failed',
  'CheckFailed',
  'UnreadableCloseout',
  'Stopped',
  'Unknown',
] as const;

/** Mirrors `StepReason` in agent-orchestrator's feed/phase.ts: one of `STEP_REASONS`. */
export type StepReason = (typeof STEP_REASONS)[number];

/** The reasons a run stands in: `assess`'s statuses, and `Held` for a running run a person holds. */
export const RUN_REASONS = ['Running', 'Held', 'Succeeded', 'Failed', 'Cancelled', 'AwaitingApproval', 'Blocked'] as const;

/** Mirrors `RunReason` in agent-orchestrator's feed/phase.ts: one of `RUN_REASONS`. */
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

/** Decodes a `CheckVerdict`. */
export const CheckVerdictSchema = decodes<CheckVerdict>()(
  Schema.Struct({ result: Schema.Literals(CHECK_RESULTS), exit: Schema.NullOr(Schema.Number) }),
);

/** The fields a step's row carries at every door: its codes, and the sentence a person reads, never compared. */
export const StepCodesFields = { phase: StepPhaseSchema, reason: StepReasonSchema, message: Schema.String } as const;
