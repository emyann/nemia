/**
 * How a step is drawn on a run's graph (`StepGraph`): its mark, from its state and whether it waits on something now (`stepMark`,
 * proved by `contracts/step-mark.contract.ts`), that rule of waiting (`waitsNow`), and the mark of the step a run is on (`nowMark`). Pure.
 */
import type { WaitOn } from 'objects';
import type { StepMark, StepMarkOf } from '../../contracts/step-mark.contract.ts';
import type { StepState } from './status.ts';
import { nowOf, railStates } from './runWords.ts';

export type { StepMark } from '../../contracts/step-mark.contract.ts';

/** The states of a step not started. */
const NOT_STARTED: ReadonlySet<StepState> = new Set(['waiting', 'waiting-for-slot', 'held']);

/** Each state's mark where it does not hang on whether the step waits now. */
const MARK: Record<Exclude<StepState, 'waiting' | 'waiting-for-slot' | 'held'>, StepMark> = {
  working: 'alive',
  checking: 'alive',
  'asks-in-session': 'yours',
  blocked: 'yours',
  'awaiting-approval': 'yours',
  exhausted: 'yours',
  'over-budget': 'yours',
  'budget-exhausted': 'yours',
  unsigned: 'yours',
  denied: 'yours',
  failed: 'failure',
  'failed-check': 'failure',
  unreadable: 'failure',
  verified: 'done',
  unverified: 'done',
  sent: 'done',
  skipped: 'off',
  paused: 'rest',
  cancelled: 'rest',
  unknown: 'rest',
};

/**
 * A step's mark on the graph: alive at work or checked, yours where it waits on a person, failure, done, off where its route passed it
 * by, at rest paused, called off or unknown; and a step not started — held among them — by its corners where it waits on something
 * now, else hollow.
 * @param state The step's state.
 * @param waits Whether it waits on something now (`waitsNow`), not only its turn.
 */
export const stepMark: StepMarkOf = (state, waits) =>
  state === 'waiting' || state === 'waiting-for-slot' || state === 'held' ? (waits ? 'waits' : 'todo') : MARK[state];

/**
 * Whether the step of `drawn` at `at` waits on something now, not only its turn: a run slot or a hold by its state, a thing it names
 * (`on`), or, on a held run, the first step not started, which the hold stops.
 * @param drawn The run's steps, each with its state and what it waits on.
 * @param at The index of the step asked about.
 * @param held Whether a person holds the run.
 */
export function waitsNow(drawn: ReadonlyArray<{ state: StepState; on: WaitOn | null }>, at: number, held: boolean) {
  const { state, on } = drawn[at];
  if (state !== 'waiting') return NOT_STARTED.has(state);
  return on !== null || (held && drawn.findIndex((step) => NOT_STARTED.has(step.state)) === at);
}

/**
 * The mark of the step a run is on (`nowOf`), as its graph draws that step (`stepMark`, `waitsNow`), so a run named by its mark and its
 * graph's node never disagree; `done` for a run whose every step is done.
 * @param run The run: its steps with their codes, spec and try, its calling off, its hold and its waits.
 */
export function nowMark(run: Parameters<typeof nowOf>[0]) {
  const now = nowOf(run);
  if (!now) return 'done';
  const held = run.holding != null;
  const drawn = railStates(run.steps, Boolean(run.cancelledAt), held);
  const at = drawn.findIndex((step) => step.name === now.step);
  return stepMark(drawn[at].state, waitsNow(drawn, at, held));
}
