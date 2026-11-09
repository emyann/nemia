/**
 * Where a step or a run stands, and what a check said, as the codes the api carries beside each sentence (`phase`, `reason`, `verdict`):
 * each a union of `objects`, and its list kept here as a tuple, since every file of the mirror imports this one and it loads no value but
 * effect's and `decodes` (`test/api-files.test.ts`): each schema's `decodes` holds the tuple to its union both ways. The board groups,
 * colours and decides by these codes alone, and shows the sentence (`message`) as it comes. A code this board does not know is refused at
 * the decode, as an answer of an api built apart from it.
 */
import { Schema } from 'effect';
import type { AnswerVia, CheckResult, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from 'objects';
import { decodes } from './decodes.ts';

/** The phases a step stands in: to come, at work, waiting on a person, done, failed, stopped. */
const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const satisfies readonly StepPhase[];

/** `objects`' `StepPhase`: one of `STEP_PHASES`. */
export type { StepPhase } from 'objects';

/** `objects`' `RunPhase`: a step's phase, or `cancelled` for a run a person called off. */
export type { RunPhase } from 'objects';

/**
 * What a wait on a thing waits on (reason `Waiting`, phase `pending`): other runs (`run`), the limit on runs in flight (`limit`), the
 * base branch's checkout (`base`), the store's pause (`pause`), or a person's hold that names no run (`hold`).
 */
const WAIT_ON = ['run', 'limit', 'base', 'pause', 'hold'] as const satisfies readonly WaitOn[];

/** `objects`' `WaitOn`: one of `WAIT_ON`. */
export type { WaitOn } from 'objects';

/** Where a person is asked for an answer (reason `AwaitingAnswer`): by the session, which stopped to ask, or by its closeout. */
const ANSWER_VIA = ['session', 'closeout'] as const satisfies readonly AnswerVia[];

/** `objects`' `AnswerVia`: one of `ANSWER_VIA`. */
export type { AnswerVia } from 'objects';

/**
 * The reasons a step stands in, the feed's codes: a wait on a person is an `Awaiting*` code or a stop beside them (phase `waiting`), a
 * wait on a thing is `Waiting` with what it waits on (`on`), a step waiting on the steps before it is `Pending`, and a session the store's
 * pause parked between two tool calls is `Paused` (phase `running`).
 */
const STEP_REASONS = [
  'Pending',
  'Waiting',
  'Running',
  'Checking',
  'Paused',
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
  'Skipped',
  'Sent',
  'Unknown',
] as const satisfies readonly StepReason[];

/** `objects`' `StepReason`: one of `STEP_REASONS`. */
export type { StepReason } from 'objects';

/**
 * `objects`' `RunReason`: `assess`'s statuses, `Waiting` (on `run`) for a running run a person holds, and for a run a person's word
 * stops, the reason of its first step that waits on them.
 */
export type { RunReason } from 'objects';

/** What a check's verdict can be: passed, failed, unfinished (no verdict on the work), running, or unknown. */
const CHECK_RESULTS = ['passed', 'failed', 'unfinished', 'running', 'unknown'] as const satisfies readonly CheckResult[];

/** `objects`' `CheckResult`: one of `CHECK_RESULTS`. */
export type { CheckResult } from 'objects';

/**
 * Mirrors `CheckVerdict` in agent-orchestrator's check/check.ts: a check's `result`, and the code it exited with — `0` once it passed,
 * the code it failed with, null where it has none.
 */
export type CheckVerdict = { result: CheckResult; exit: number | null };

/** Decodes a `StepPhase`. */
const StepPhaseSchema = decodes<StepPhase>()(Schema.Literals(STEP_PHASES));

/** Decodes a `StepReason`. */
const StepReasonSchema = decodes<StepReason>()(Schema.Literals(STEP_REASONS));

/** Decodes a `WaitOn`. */
const WaitOnSchema = decodes<WaitOn>()(Schema.Literals(WAIT_ON));

/** Decodes an `AnswerVia`. */
const AnswerViaSchema = decodes<AnswerVia>()(Schema.Literals(ANSWER_VIA));

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
