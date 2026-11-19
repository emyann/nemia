/**
 * What the pass does with an approved proposal (`contracts/proposal-apply.contract.ts`): wait on its run, drop it with a run called off,
 * mark it stale where its objects moved, send a lapsed agent's approval back to the person, or apply it. Pure.
 */
import type { ProposalApply } from '../../contracts/proposal-apply.contract.ts';
import type { RunStatusWord } from 'objects';
import { runOver } from '../run-ending/run-ending.ts';

/**
 * What the pass does with an approved proposal: wait while its run goes on, drop it once the run ended, mark it stale where its
 * objects moved, send a rule's approval that no longer holds back to the person, or apply it.
 * @param f The proposal as the pass reads it: when it applies, its proposing run, whether its objects are current, who approved it and
 *   whether a rule's approval still holds.
 */
export const proposalApply: ProposalApply = (f) => {
  if (f.at === 'run-end' && f.run === 'going') return 'wait';
  if (f.at === 'run-end' && f.run === 'ended') return 'drop';
  if (!f.current) return 'stale';
  if (f.approvedBy === 'rule' && !f.stillApproved) return 'back-to-person';
  return 'apply';
};

/** A run's status, as the tick's pass judges it (`Assessment['status']`), or `gone` where the store holds the run no more. */
export type RunState = RunStatusWord | 'gone';

/**
 * The proposing run as `proposalApply` reads it: none where the proposal names no run (the person's, Nemia's); `succeeded` once it
 * succeeded; `ended` where it was called off, or is gone; `going` while it runs, waits, or sits failed, since a failed run can be retried,
 * and where its state was not read on this pass. Pure.
 * @param run The id of the proposing run; undefined where the proposal names none.
 * @param state The run's state as the pass read it; undefined where it was not read on this pass.
 */
export const proposingRunOf = (run: string | undefined, state: RunState | undefined) => {
  if (run === undefined) return 'none';
  if (state === undefined) return 'going';
  if (state === 'gone') return 'ended';
  if (!runOver(state)) return 'going';
  return state === 'succeeded' ? 'succeeded' : 'ended';
};
