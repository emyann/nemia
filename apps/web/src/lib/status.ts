/**
 * A step's state, from the codes the api carries for it (`phase`, `reason`) — what the run established, not only what its task settled —
 * and how each state is drawn. The board never reads a state out of the sentence beside them (`message`), which is shown as it comes.
 * The words a person reads of a state are `words.ts`'s (`PERSON`): this chooses the state and its colour. `cancelled` is a fact about the
 * run rather than the step: a step to come on a run somebody called off never will, and a step the cancellation stopped is `Stopped`.
 *
 * `held` is a fact about the run too: a person holds it until other runs land (the CLI's `hold`), so a step not filed will not be until the
 * hold lifts, and a step at a human gate asks nothing of anyone while it stands — every verb that would answer it is refused. A step at
 * work, asking through its harness (`needs-human`), checking, or settled keeps its state: what is in flight runs on, and a verdict is a
 * verdict.
 */
import type { StepPhase, StepReason } from './api/reasons.ts';
import { container, dashed, filled, hairline, meaningOf, paint, ringed, type Hue } from './meaning.ts';

export type StepState =
  | 'working'
  | 'needs-human'
  | 'checking'
  | 'verified'
  | 'unverified'
  | 'blocked'
  | 'awaiting-approval'
  | 'exhausted'
  | 'over-budget'
  | 'budget-exhausted'
  | 'denied'
  | 'unsigned'
  | 'failed'
  | 'failed-check'
  | 'waiting'
  | 'waiting-for-slot'
  | 'held'
  | 'cancelled'
  | 'unreadable'
  | 'unknown';

/**
 * A step's state from its codes, whether the run was called off, and whether a person holds the run: `held` for a state a hold stops
 * (`HELD_BY_A_HOLD`) on a run not called off. `runHeld` has no default, so the compiler names every caller that has to say it: a caller
 * that forgot the hold would draw a held run's gate as asking a person.
 */
export function stepState(phase: StepPhase, reason: StepReason, runCancelled: boolean, runHeld: boolean): StepState {
  const state = codeState(phase, reason, runCancelled);
  return runHeld && !runCancelled && HELD_BY_A_HOLD.has(state) ? 'held' : state;
}

/** What a hold makes `held`: a step not filed yet, and one at a human gate (`isGate`), whose answer is refused while the hold stands. */
const HELD_BY_A_HOLD: ReadonlySet<StepState> = new Set([
  'waiting',
  'waiting-for-slot',
  'blocked',
  'awaiting-approval',
  'exhausted',
  'over-budget',
  'budget-exhausted',
]);

/**
 * The state each reason is drawn as. Total: a reason the api adds fails the typecheck here until it has a state. A step not filed — on
 * another step or run, the checkout, the pause, or nothing yet — is `waiting`, and one the cap on runs in flight holds `waiting-for-slot`;
 * a session that ended on its own word (`Succeeded`) is at most `unverified`; one an operator or a cancel stopped is drawn `cancelled`.
 */
export const STATE_OF: Record<StepReason, StepState> = {
  Running: 'working',
  NeedsHuman: 'needs-human',
  Checking: 'checking',
  CheckPassed: 'verified',
  Succeeded: 'unverified',
  Blocked: 'blocked',
  AwaitingApproval: 'awaiting-approval',
  RoundsExhausted: 'exhausted',
  OverBudget: 'over-budget',
  BudgetExhausted: 'budget-exhausted',
  CheckDenied: 'denied',
  Unsigned: 'unsigned',
  Failed: 'failed',
  CheckFailed: 'failed-check',
  Pending: 'waiting',
  Waiting: 'waiting',
  WaitingForCheckout: 'waiting',
  WaitingForPause: 'waiting',
  WaitingForSlot: 'waiting-for-slot',
  Stopped: 'cancelled',
  UnreadableCloseout: 'unreadable',
  Unknown: 'unknown',
};

/**
 * A step's state from its codes alone, and whether the run was called off: `STATE_OF`, but `unreadable` for a step whose record the api
 * could not judge (`Unknown` in phase `failed`), and `cancelled` for a step to come on a run called off.
 */
function codeState(phase: StepPhase, reason: StepReason, runCancelled: boolean): StepState {
  if (phase === 'failed' && reason === 'Unknown') return 'unreadable';
  if (phase === 'pending' && runCancelled) return 'cancelled';
  return STATE_OF[reason];
}

/** Final, and a follower may be filed on it — `satisfiesAfter` in agent-orchestrator: verified, or done on its own word. */
export const satisfiesAfter = (state: StepState): boolean => state === 'verified' || state === 'unverified';

/**
 * A human gate: final, and the run goes no further until a person decides — a step that signed off blocked, a step waiting at its gate for
 * an approval (the CLI's `approve`), a loop out of rounds (the CLI's `round`), or a step past its budget, over it or ended at it
 * (`--budget`), whose way on is a person's word to spend more. What the CLI's `decide` calls a blocked outcome, on the step's own word. Not
 * a refused check nor an unsigned step, which wait on you too but are work to try again (the CLI's `retry`). On a run somebody called off,
 * nobody is waiting for the answer any more.
 */
export const isGate = (state: StepState, runCancelled: boolean): boolean =>
  (state === 'blocked' ||
    state === 'awaiting-approval' ||
    state === 'exhausted' ||
    state === 'over-budget' ||
    state === 'budget-exhausted') &&
  !runCancelled;

/** How a state is drawn: the hue that says its meaning, the form the hue takes, and what marks it beside its colour. */
export interface Drawn {
  readonly hue: Hue;
  readonly form: 'filled' | 'container' | 'ringed' | 'dashed' | 'hairline';
  readonly mark?: string;
}

const GATE: Drawn = { hue: 'yours', form: 'filled', mark: 'font-semibold' };

/**
 * Each state's meaning, of the look's five, and its form. `yours`, filled and bold, for a state that waits on a person's word (`isGate`),
 * the only filled accent; `yours` for a session asking, and ringed for work to try again, not a question (`unsigned`, `denied`). `alive`
 * for a session at work. `failure` for a failure and nothing else. The rest is at rest or done: sage for a check that runs, a step that is
 * done (ringed when only its own word says so, and `StatusChip` marks it too) and a step to come, a hairline; grey for a step a person
 * holds, one called off, and one the engine does not know. No state is `money`: amber is an amount, drawn beside the chip.
 */
export const stateDrawn: Record<StepState, Drawn> = {
  working: { hue: 'alive', form: 'container' },
  'needs-human': { hue: 'yours', form: 'container' },
  checking: { hue: 'sage', form: 'container', mark: 'ring-1 ring-sage ring-inset' },
  verified: { hue: 'sage', form: 'filled' },
  unverified: { hue: 'sage', form: 'ringed' },
  blocked: GATE,
  'awaiting-approval': GATE,
  exhausted: GATE,
  'over-budget': GATE,
  'budget-exhausted': GATE,
  unsigned: { hue: 'yours', form: 'ringed' },
  denied: { hue: 'yours', form: 'ringed' },
  failed: { hue: 'failure', form: 'container' },
  'failed-check': { hue: 'failure', form: 'container', mark: 'font-semibold ring-1 ring-failure ring-inset' },
  waiting: { hue: 'sage', form: 'hairline' },
  'waiting-for-slot': { hue: 'sage', form: 'hairline' },
  held: { hue: 'grey', form: 'filled' },
  cancelled: { hue: 'grey', form: 'container', mark: 'line-through' },
  unreadable: { hue: 'failure', form: 'dashed' },
  unknown: { hue: 'grey', form: 'dashed' },
};

const FORMS = { filled, container, ringed, dashed } as const;

/** The classes of one drawing: its form in its hue, then its mark. */
export const classOf = ({ hue, form, mark }: Drawn): string =>
  [form === 'hairline' ? hairline : FORMS[form][hue], mark].filter(Boolean).join(' ');

/**
 * The states of `table` that break the look's rule, each with why; none for a table that keeps it. A state that waits on a person
 * (`isGate`, a session asking, work to try again) is `yours`; a failure is `failure`, and no other state is; no state is `money`.
 */
export function brokenMeanings(table: Record<StepState, Drawn>): string[] {
  const states = Object.keys(table) as StepState[];
  return states.flatMap((state) => {
    const meaning = meaningOf(table[state].hue);
    if (meaning === 'money') return [`${state} is money: amber is an amount, never a state`];
    if (WAITS_ON_A_PERSON.has(state)) return meaning === 'yours' ? [] : [`${state} waits on a person and is ${meaning}, not yours`];
    if (FAILURES.has(state)) return meaning === 'failure' ? [] : [`${state} is a failure and is ${meaning}`];
    if (meaning === 'yours') return [`${state} waits on nobody and is yours`];
    return meaning === 'failure' ? [`${state} is no failure and is drawn as one`] : [];
  });
}

const WAITS_ON_A_PERSON: ReadonlySet<StepState> = new Set([
  'needs-human',
  'blocked',
  'awaiting-approval',
  'exhausted',
  'over-budget',
  'budget-exhausted',
  'unsigned',
  'denied',
]);

const FAILURES: ReadonlySet<StepState> = new Set(['failed', 'failed-check', 'unreadable']);

const each = (table: Record<StepState, Drawn>, of: (drawn: Drawn) => string): Record<StepState, string> => {
  const entries = (Object.keys(table) as StepState[]).map((state) => [state, of(table[state])] as const);
  return Object.fromEntries(entries) as Record<StepState, string>;
};

/** The chip's classes for each state, from `stateDrawn`. */
export const stateClass: Record<StepState, string> = each(stateDrawn, classOf);

/** Each state's colour outside Tailwind, its meaning's: what the minimap fills a step with. */
export const statePaint: Record<StepState, string> = each(stateDrawn, (drawn) => paint[drawn.hue]);
