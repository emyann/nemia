/**
 * The closed words the objects carry: each list a field of an object is one of, said once here and read by the Schemas beside it
 * (`run.ts`). Plain tuples of strings, importing nothing. The orchestrator holds its own unions and its pure files' tuples equal to these
 * at compile time, both ways (`packages/agent-orchestrator/src/object/run.model.ts`): a word added on one side alone fails the typecheck.
 *
 * `nemia/v1` is additions only: a word is never renamed or dropped under it, and a word added is one an older reader refuses, so it is a
 * change of the version (`packages/objects/CLAUDE.md`).
 */

/**
 * Where a step is in its life: not yet at work (`pending`), at work or its check running (`running`), waiting on a person (`waiting`),
 * done (`succeeded`), broken (`failed`), or stopped by an operator or a cancel (`stopped`).
 */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;

/** One of `STEP_PHASES`. */
export type StepPhase = (typeof STEP_PHASES)[number];

/** Where a run is in its life: a step's phases, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const;

/** One of `RUN_PHASES`. */
export type RunPhase = (typeof RUN_PHASES)[number];

/**
 * What a step or a run waits on when the wait is a thing's, not a person's (reason `Waiting`): other runs (`run`), the limit on runs in
 * flight (`limit`), the base branch the run lands on, while another run lands there (`base`), or the store's pause (`pause`).
 */
export const WAIT_ON = ['run', 'limit', 'base', 'pause'] as const;

/** One of `WAIT_ON`. */
export type WaitOn = (typeof WAIT_ON)[number];

/** Where a person is asked for an answer (reason `AwaitingAnswer`): by the session itself (`session`), or by the closeout (`closeout`). */
export const ANSWER_VIA = ['session', 'closeout'] as const;

/** One of `ANSWER_VIA`. */
export type AnswerVia = (typeof ANSWER_VIA)[number];

/** The reasons a step can stand in: the feed's codes of a step that are a word it keeps. */
export const STEP_REASONS = [
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
  'Unknown',
] as const;

/** One of `STEP_REASONS`. */
export type StepReason = (typeof STEP_REASONS)[number];

/** The reasons a run can stand in. */
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

/** One of `RUN_REASONS`. */
export type RunReason = (typeof RUN_REASONS)[number];

/** What a check's verdict can be: `passed`, `failed`, `unfinished` (no verdict on the work), `running`, or `unknown`. */
export const CHECK_RESULTS = ['passed', 'failed', 'unfinished', 'running', 'unknown'] as const;

/** One of `CHECK_RESULTS`. */
export type CheckResult = (typeof CHECK_RESULTS)[number];

/** The kinds of place a run's steps work in, as a step's `place:` says them: a repository (`git`), or a folder. */
export const PLACE_KINDS = ['git', 'folder'] as const;

/** One of `PLACE_KINDS`. */
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Why a try was moved behind the one that replaced it: the run's word, a person's mode, a round, a merge, a sending back. */
export const TRY_CAUSES = ['retries', 'signoff', 'continue', 'fresh', 'recheck', 'round', 'merge', 'back'] as const;

/** One of `TRY_CAUSES`. */
export type TryCause = (typeof TRY_CAUSES)[number];

/** The kinds a run resolves and a revision is kept for: its workflow folder, each step's agent, each skill, and the factory's rules. */
export const REVISION_KINDS = ['workflow', 'agent', 'skill', 'rules'] as const;

/** One of `REVISION_KINDS`. */
export type RevisionKind = (typeof REVISION_KINDS)[number];

/** A run's word, as `nemia ls` says it. */
export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled', 'awaiting approval', 'waiting'] as const;

/** A step's word, as `nemia ls` says it. */
export const STEP_STATUSES = [
  'pending',
  'running',
  'blocked',
  'unsigned',
  'checking',
  'verified',
  'unverified',
  'awaiting approval',
  'exhausted',
  'over budget',
  'budget exhausted',
  'denied',
  'failed (check)',
  'failed',
  'stopped',
] as const;

/** How a try is taken: continuing the session, in a fresh one, or running the check again. */
export const RETRY_MODES = ['continue', 'fresh', 'recheck'] as const;

/** Where a task stands on the clock. */
export const SPAN_AT = ['unknown', 'queued', 'starting', 'running', 'ended', 'unspawned'] as const;

/** How a raise of a step's cap is asked for: with a try, or with a round. */
export const RAISE_BY = ['retry', 'round'] as const;

/** How a step signed off, in its closeout. */
export const OUTCOMES = ['done', 'blocked'] as const;

/** How an attempt ended. */
export const ENGINE_OUTCOMES = ['succeeded', 'failed', 'stopped'] as const;

/** Why an attempt ended. */
export const ATTEMPT_ENDS = ['harness', 'lost', 'unstartable', 'operator', 'deadline', 'budget', 'unsigned'] as const;

/** The last event of a session before a person's words went to it, by its kind. */
export const SAID_AFTER = ['text', 'thinking', 'tool_use', 'tool_result', 'system'] as const;

/** Where a session's peak stands against its step's cap. */
export const PEAK_MARKS = ['cap', 'large'] as const;

/** Where the way a try's session runs came from: what it was filed with, the default, or its tools. */
export const RUNS_IN_BY = ['filed', 'default', 'tools'] as const;

/** What the board does with a file a closeout named: shows it as an image, as text, or links it. */
export const ARTIFACT_KINDS = ['image', 'text', 'other'] as const;

/** How a step was handed a run's section of its task: waited for, or read. */
export const HANDED_HOW = ['waited', 'read'] as const;

/** Where a step's told layers were given: its prompt, or its brief. */
export const TOLD_VIA = ['prompt', 'brief'] as const;

/** Where a gate's budgets come from: the gated step's proposal, before the approval; the approval's caps, after it. */
export const GATE_BUDGETS_FROM = ['proposed', 'approved'] as const;
