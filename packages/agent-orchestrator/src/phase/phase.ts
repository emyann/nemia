/**
 * Where a step or a run stands, as codes every door carries: its `phase`, a small closed set a screen groups by, and its `reason`, the
 * feed's code (`REASONS`) that says why. The sentence a person reads beside them (`nemia ls`'s word) is free to be reworded; these are
 * not, and nothing parses that sentence back into either.
 *
 * Each table is total over the type it is keyed by, so a status, a reason or an engine word added elsewhere fails the typecheck here
 * until it has its code. Pure data, with type imports alone: `list.ts` reads these, and the feed (`reason.ts`) reads `list.ts`, so a value
 * import of the feed from here would close a cycle. A folder of its own for that reason: `list.ts` reads it here, never through the
 * feed's face; the feed re-exports it.
 *
 * Each of `STEP_PHASES`, `RUN_PHASES`, `WAIT_ON`, `ANSWER_VIA`, `STEP_REASONS` and `RUN_REASONS` is `objects`' list word for word
 * (`packages/objects/src/words.ts`), held equal by `wordsHeld` (`object/run.model.ts`): a pure entry loads no Effect but `effect/Data`,
 * so it keeps its own copy rather than `objects`' door.
 */
import type { Reason } from '../feed/index.ts';
import type { StepStatus } from '../record/record.ts';
import type { ListedPhase } from '../list/list.ts';
import type { Assessment } from '../tick/assess.ts';
import type { AnswerVia, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from 'objects';

/**
 * Where a step is in its life: not yet at work (`pending`, a wait on another step, a run, a slot, the base or the pause among it), at
 * work or its check running (`running`), waiting on a person (`waiting`: a gate, a question, a budget, a refused or unsigned try), done
 * (`succeeded`), broken (`failed`), or stopped by an operator or a cancel (`stopped`).
 */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const satisfies readonly StepPhase[];

/** One of `STEP_PHASES`. */
export type { StepPhase };

/** Where a run is in its life: a step's phases, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const satisfies readonly RunPhase[];

/** One of `RUN_PHASES`. */
export type { RunPhase };

/**
 * What a step or a run waits on when the wait is a thing's, not a person's (reason `Waiting`, phase `pending`): other runs it is filed
 * `--after` or held until (`run`), the limit on runs in flight (`limit`), the base branch the run lands on, while another run lands there
 * (`base`), the store's pause (`pause`), or a person's hold that names no run, lifted by a person alone (`hold`). A field beside the
 * reason, never part of it, so a selector names it as a key (`on=limit`).
 */
export const WAIT_ON = ['run', 'limit', 'base', 'pause', 'hold'] as const satisfies readonly WaitOn[];

/** One of `WAIT_ON`. */
export type { WaitOn };

/**
 * Where a person is asked for an answer (reason `AwaitingAnswer`, phase `waiting`): by the session itself, which stopped to ask
 * (`session`, the engine's `needs-human`), or by the closeout, which signed off blocked (`closeout`).
 */
export const ANSWER_VIA = ['session', 'closeout'] as const satisfies readonly AnswerVia[];

/** One of `ANSWER_VIA`. */
export type { AnswerVia };

/**
 * The reasons a step can stand in: the feed's codes of a step that are a word it keeps, not a one-shot (`once`) written beside it. What
 * a step's `reason` is at every door. A wait on a person is said by the `Awaiting*` codes and the stops beside them (phase `waiting`);
 * a wait on a thing is `Waiting`, with what it waits on (`WAIT_ON`); a step that waits on the steps before it is `Pending`.
 */
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
  'Skipped',
  'Sent',
  'Unknown',
] as const satisfies readonly (StepReason & Reason)[];

/** One of `STEP_REASONS`. */
export type { StepReason };

/**
 * The reasons a run can stand in: `assess`'s statuses, `Waiting` (on `run`) for a running run a person holds until other runs land, and
 * for a run a person stops, the reason of the first step that waits on them (`runCodes`).
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
] as const satisfies readonly (RunReason & Reason)[];

/** One of `RUN_REASONS`. */
export type { RunReason };

/**
 * A reason with what it is qualified by: `Waiting` always says what it waits on (`on`), `AwaitingAnswer` always where the answer is
 * asked (`via`), and no other reason carries either. A row that says `Waiting` with no `on` fails the typecheck, so no test is written
 * for one.
 */
export type QualifiedStep =
  | { reason: 'Waiting'; on: WaitOn; via?: undefined }
  | { reason: 'AwaitingAnswer'; via: AnswerVia; on?: undefined }
  | { reason: Exclude<StepReason, 'Waiting' | 'AwaitingAnswer'>; on?: undefined; via?: undefined };

/** A step's codes: its reason and what qualifies it (`QualifiedStep`), and the phase that reason stands in (`PHASE_OF`). */
export type CodedStep = QualifiedStep & { phase: StepPhase };

/**
 * A run's reason with what it is qualified by: as a step's, but an `AwaitingAnswer` run may say no `via`, which is what a former run
 * `Blocked` line reads as, and a run stopped with no step that waits (`runCodes`).
 */
export type QualifiedRun =
  | { reason: 'Waiting'; on: WaitOn; via?: undefined }
  | { reason: 'AwaitingAnswer'; via?: AnswerVia; on?: undefined }
  | { reason: Exclude<RunReason, 'Waiting' | 'AwaitingAnswer'>; on?: undefined; via?: undefined };

/** A run's codes: its reason, what qualifies it, and its phase (`RUN_PHASE_OF`). */
export type CodedRun = QualifiedRun & { phase: RunPhase };

/**
 * The reason each of the record's statuses names before the listing narrows it (`lineOf`, `list.ts`): `failed (check)` is a check that
 * failed, `checking` a check at work, and `unverified` a step done on its own word. Where the listing knows more — the wait a step not
 * filed is in, the engine's word for a task at work, a closeout that signed off blocked — the row's reason is the narrower one. A step
 * the record says `waiting` is `Pending` here: the listing says `Waiting` where what it waits on is a thing (`unfiled`). A node a route
 * passed by (`skipped`) is settled having done nothing (`Skipped`, phase `stopped`, as a step that will not run is); a workflow node
 * that filed its card (`sent`) is done, its card handed on (`Sent`, phase `succeeded`). Total: a status added to `StepStatus` fails
 * the typecheck here until it has a reason.
 */
export const REASON_OF: Record<StepStatus, QualifiedStep> = {
  pending: { reason: 'Pending' },
  running: { reason: 'Running' },
  blocked: { reason: 'AwaitingAnswer', via: 'closeout' },
  unsigned: { reason: 'Unsigned' },
  checking: { reason: 'Checking' },
  verified: { reason: 'CheckPassed' },
  unverified: { reason: 'Succeeded' },
  'awaiting approval': { reason: 'AwaitingApproval' },
  exhausted: { reason: 'AwaitingRound' },
  'over budget': { reason: 'OverBudget' },
  'budget exhausted': { reason: 'BudgetExhausted' },
  denied: { reason: 'Denied' },
  'failed (check)': { reason: 'CheckFailed' },
  failed: { reason: 'Failed' },
  stopped: { reason: 'Stopped' },
  skipped: { reason: 'Skipped' },
  sent: { reason: 'Sent' },
};

/**
 * The reason the engine's word for a step's task names, as the feed has always classified it: a session at work is `Running`, whatever
 * live word the engine says it in (`feedPhase`), a session that stopped to ask is `AwaitingAnswer` by the session, and a word the feed
 * never named — `input-required`, `idle`, `restarting` — is `Unknown`, so a line written from this table says what `reasonOf` read off
 * the same word.
 */
export const ENGINE_REASON: Record<ListedPhase, QualifiedStep> = {
  pending: { reason: 'Pending' },
  starting: { reason: 'Running' },
  working: { reason: 'Running' },
  quiescent: { reason: 'Running' },
  running: { reason: 'Running' },
  'needs-human': { reason: 'AwaitingAnswer', via: 'session' },
  'input-required': { reason: 'Unknown' },
  idle: { reason: 'Unknown' },
  restarting: { reason: 'Unknown' },
  'between-attempts': { reason: 'Running' },
  ending: { reason: 'Running' },
  succeeded: { reason: 'Succeeded' },
  failed: { reason: 'Failed' },
  stopped: { reason: 'Stopped' },
  unknown: { reason: 'Unknown' },
};

/**
 * The phase each step reason stands in. `waiting` is a wait on a person, and nothing else: a step not filed — waiting on a step
 * (`Pending`), or on a thing (`Waiting`: a run, the limit, the base or the pause) — is `pending`, to come. `Unknown`, a task the
 * engine has no record of, is `pending` too, as the engine folds it; a step whose record does not read at all is `failed` with `Unknown`,
 * set where it is answered (`unjudged`).
 */
export const PHASE_OF: Record<StepReason, StepPhase> = {
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
};

/** A step's codes from its qualified reason: the phase is the reason's (`PHASE_OF`). Pure. */
export const codedStep = (q: QualifiedStep): CodedStep => ({ ...q, phase: PHASE_OF[q.reason] });

/** Where a run stands, as `assess` decides it. */
type RunStatus = Assessment['status'];

/**
 * The reason each of `assess`'s statuses names. A running run a person holds is `Waiting` on `run`, and a `waiting` run takes its first
 * waiting step's reason, which the caller knows and this does not (`runCodes`).
 */
export const RUN_REASON_OF: Record<RunStatus, QualifiedRun> = {
  running: { reason: 'Running' },
  succeeded: { reason: 'Succeeded' },
  failed: { reason: 'Failed' },
  cancelled: { reason: 'Cancelled' },
  'awaiting approval': { reason: 'AwaitingApproval' },
  waiting: { reason: 'AwaitingAnswer' },
};

/** The phase each run reason stands in: a run a person stops is `waiting`, and a held one `pending`, as a step waiting on a thing is. */
export const RUN_PHASE_OF: Record<RunReason, RunPhase> = {
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
};

/**
 * The reasons a line waits on a person by (`waits=person`): every reason whose phase is `waiting`, of a step or a run, and the two of a
 * step that broke, `Failed` and `CheckFailed`, which a person must look at before anything after them runs. Derived from `PHASE_OF` and
 * `RUN_PHASE_OF`, so the feed's `waits` cannot drift from the phases: the feed's table reads it (`reason.ts`).
 */
export const PERSON_WAITS: ReadonlySet<Reason> = new Set<Reason>([
  ...(Object.keys(PHASE_OF) as StepReason[]).filter((r) => PHASE_OF[r] === 'waiting'),
  ...(Object.keys(RUN_PHASE_OF) as RunReason[]).filter((r) => RUN_PHASE_OF[r] === 'waiting'),
  'Failed',
  'CheckFailed',
]);

/**
 * Whether a step in `status` holds its run until someone acts, the person or Nemia: its reason waits on a person (`PERSON_WAITS`) and is
 * no `Failed`, the engine ending a step on its own. So a step at its gate, on its question, out of rounds, at its cap, unsigned, denied a
 * call under `denials: fail`, or on a check that refused or did not finish holds its run; `failed` and `stopped` do not. `nemia ls` says
 * such a step waits on you (`listing`), and a run with nothing in flight and such a step is not finished to `nemia cancel` (`cancelPlan`).
 * A try or a round the run has due moves such a step on, and its readers read that first. Pure.
 */
export const holdsTheRun = (status: StepStatus): boolean => {
  const { reason } = REASON_OF[status];
  return reason !== 'Failed' && PERSON_WAITS.has(reason);
};

/** What a run stopped on `step` says: the step's reason, and its `via` where it is an answer's. */
const stoppedOn = (step: CodedStep): QualifiedRun =>
  step.reason === 'AwaitingAnswer'
    ? { reason: 'AwaitingAnswer', via: step.via }
    : { reason: step.reason as Exclude<RunReason, 'Waiting' | 'AwaitingAnswer'> };

/**
 * A run's codes. A running run a person holds (`holding`, the runs the hold waits for, null when nobody holds it) is `Waiting` on `run`
 * while the hold names a run, and on `hold` while it names none, so a person alone lifts it. A `waiting` run carries the reason (and
 * `via`) of its first step, in the order `steps` gives them (the workflow's), whose phase is `waiting` and that is no gate — a run is
 * `waiting` when some stop is not a gate, so a gate before it does not say why; every such reason is a run's too; `AwaitingAnswer` with
 * no `via` where none is. Every other status is `RUN_REASON_OF`'s. Pure.
 */
export function runCodes(status: RunStatus, holding: readonly unknown[] | null, steps: readonly CodedStep[] = []): CodedRun {
  const stop = status === 'waiting' ? steps.find((s) => s.phase === 'waiting' && s.reason !== 'AwaitingApproval') : undefined;
  const q: QualifiedRun =
    status === 'running' && holding !== null
      ? { reason: 'Waiting', on: holding.length ? 'run' : 'hold' }
      : stop
        ? stoppedOn(stop)
        : RUN_REASON_OF[status];
  return { ...q, phase: RUN_PHASE_OF[q.reason] };
}

/** What a run says of who it waits on: the steps a person has to act on, the runs its roots wait on, and the hold on it. */
export type OnYou = {
  readonly cancelledAt: string | null | undefined;
  readonly waitingOnYou: readonly string[];
  readonly waiting: { readonly waitingOnYou: boolean } | null;
  readonly holding: { readonly waitingOnYou: boolean } | null;
};

/**
 * Whether a run waits on a person — the one decider of it: nobody called it off, and a step of it waits on one, or a run it waits on never
 * lands without one, or a hold on it only a person lifts. What the list's state reads (`kindOf` in runlist.ts). Pure.
 */
export const waitsOnYou = (run: OnYou): boolean =>
  !run.cancelledAt && (run.waitingOnYou.length > 0 || Boolean(run.waiting?.waitingOnYou) || Boolean(run.holding?.waitingOnYou));
