/**
 * Where a step or a run stands, as codes every door carries: its `phase`, a small closed set a screen groups by, and its `reason`, the
 * feed's code (`REASONS`) that says why. The sentence a person reads beside them (`nemia ls`'s word) is free to be reworded; these are
 * not, and nothing parses that sentence back into either.
 *
 * Each table is total over the type it is keyed by, so a status, a reason or an engine word added elsewhere fails the typecheck here
 * until it has its code. Pure data, with type imports alone: `list.ts` reads these, and the feed (`reason.ts`) reads `list.ts`, so a value
 * import of the feed from here would close a cycle. A folder of its own for that reason: `list.ts` reads it here, never through the
 * feed's face; the feed re-exports it.
 */
import type { Reason } from '../feed/index.ts';
import type { StepStatus } from '../record/record.ts';
import type { ListedPhase } from '../list/list.ts';
import type { Assessment } from '../tick/assess.ts';

/**
 * Where a step is in its life: not yet at work (`pending`, a wait on another step, a run, a slot, the checkout or the pause among it), at
 * work or its check running (`running`), waiting on a person (`waiting`: a gate, a question, a budget, a refused or unsigned try), done
 * (`succeeded`), broken (`failed`), or stopped by an operator or a cancel (`stopped`).
 */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;

/** One of `STEP_PHASES`. */
export type StepPhase = (typeof STEP_PHASES)[number];

/** Where a run is in its life: a step's phases, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const;

/** One of `RUN_PHASES`. */
export type RunPhase = (typeof RUN_PHASES)[number];

/**
 * The reasons a step can stand in: the feed's codes of a step that are a word it keeps, not a one-shot (`once`) written beside it. What
 * a step's `reason` is at every door.
 */
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
] as const satisfies readonly Reason[];

/** One of `STEP_REASONS`. */
export type StepReason = (typeof STEP_REASONS)[number];

/** The reasons a run can stand in: `assess`'s six statuses, and `Held` for a running run a person holds. */
export const RUN_REASONS = [
  'Running',
  'Held',
  'Succeeded',
  'Failed',
  'Cancelled',
  'AwaitingApproval',
  'Blocked',
] as const satisfies readonly Reason[];

/** One of `RUN_REASONS`. */
export type RunReason = (typeof RUN_REASONS)[number];

/**
 * The reason each of the record's statuses names before the listing narrows it (`lineOf`, `list.ts`): `failed (check)` is a check that
 * failed, `checking` a check at work, and `unverified` a step done on its own word. Where the listing knows more — the wait a step not
 * filed is in, the engine's word for a task at work, a closeout that signed off blocked — the row's reason is the narrower one. Total:
 * a status added to `StepStatus` fails the typecheck here until it has a reason.
 */
export const REASON_OF: Record<StepStatus, StepReason> = {
  waiting: 'Waiting',
  running: 'Running',
  blocked: 'Blocked',
  unsigned: 'Unsigned',
  checking: 'Checking',
  verified: 'CheckPassed',
  unverified: 'Succeeded',
  'awaiting approval': 'AwaitingApproval',
  exhausted: 'RoundsExhausted',
  'over budget': 'OverBudget',
  'budget exhausted': 'BudgetExhausted',
  denied: 'CheckDenied',
  'failed (check)': 'CheckFailed',
  failed: 'Failed',
  stopped: 'Stopped',
};

/**
 * The reason the engine's word for a step's task names, as the feed has always classified it: a session at work is `Running`, whatever
 * live word the engine says it in (`feedPhase`), and a word the feed never named — `input-required`, `idle`, `restarting` — is `Unknown`,
 * so a line written from this table says what `reasonOf` read off the same word.
 */
export const ENGINE_REASON: Record<ListedPhase, StepReason> = {
  pending: 'Pending',
  starting: 'Running',
  working: 'Running',
  quiescent: 'Running',
  running: 'Running',
  'needs-human': 'NeedsHuman',
  'input-required': 'Unknown',
  idle: 'Unknown',
  restarting: 'Unknown',
  'between-attempts': 'Running',
  ending: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  stopped: 'Stopped',
  unknown: 'Unknown',
};

/**
 * The phase each step reason stands in. `waiting` is a wait on a person, and nothing else: a step not filed — waiting on a step, a run, a
 * slot, the checkout or the pause — is `pending`, to come. `Unknown`, a task the engine has no record of, is `pending` too, as the engine
 * folds it; a step whose record does not read at all is `failed` with `Unknown`, set where it is answered (`unjudged`).
 */
export const PHASE_OF: Record<StepReason, StepPhase> = {
  Pending: 'pending',
  Waiting: 'pending',
  WaitingForSlot: 'pending',
  WaitingForCheckout: 'pending',
  WaitingForPause: 'pending',
  Unknown: 'pending',
  Running: 'running',
  Checking: 'running',
  NeedsHuman: 'waiting',
  AwaitingApproval: 'waiting',
  Blocked: 'waiting',
  RoundsExhausted: 'waiting',
  OverBudget: 'waiting',
  BudgetExhausted: 'waiting',
  Unsigned: 'waiting',
  CheckDenied: 'waiting',
  Succeeded: 'succeeded',
  CheckPassed: 'succeeded',
  Failed: 'failed',
  CheckFailed: 'failed',
  UnreadableCloseout: 'failed',
  Stopped: 'stopped',
};

/** Where a run stands, as `assess` decides it. */
type RunStatus = Assessment['status'];

/** The reason each of `assess`'s statuses names; a running run a person holds is `Held`, which the caller knows and this does not. */
export const RUN_REASON_OF: Record<RunStatus, RunReason> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  'awaiting approval': 'AwaitingApproval',
  blocked: 'Blocked',
};

/** The phase each run reason stands in: a run a person stops is `waiting`, and a held one still `running`, as its status says. */
export const RUN_PHASE_OF: Record<RunReason, RunPhase> = {
  Running: 'running',
  Held: 'running',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Cancelled: 'cancelled',
  AwaitingApproval: 'waiting',
  Blocked: 'waiting',
};

/** A run's codes: `RUN_REASON_OF` of its status, `Held` for a running run a person holds, and the phase of that reason. Pure. */
export function runCodes(status: RunStatus, held: boolean): { phase: RunPhase; reason: RunReason } {
  const reason: RunReason = status === 'running' && held ? 'Held' : RUN_REASON_OF[status];
  return { phase: RUN_PHASE_OF[reason], reason };
}
