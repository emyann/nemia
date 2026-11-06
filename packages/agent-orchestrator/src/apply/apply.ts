/**
 * What the pass does with an approved proposal (`contracts/proposal-apply.contract.ts`): wait on its run, drop it with a run called off,
 * mark it stale where its objects moved, send a lapsed agent's approval back to the person, or apply it. Pure.
 */
import type { ProposalApply, ProposingRun } from '../../contracts/proposal-apply.contract.ts';

export const proposalApply: ProposalApply = (f) => {
  if (f.at === 'run-end' && f.run === 'going') return 'wait';
  if (f.at === 'run-end' && f.run === 'ended') return 'drop';
  if (!f.current) return 'stale';
  if (f.approvedBy === 'rule' && !f.stillApproved) return 'back-to-person';
  return 'apply';
};

/** A run's status, as the tick's pass judges it (`Assessment['status']`), or `gone` where the store holds the run no more. */
export type RunState = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting approval' | 'waiting' | 'gone';

/**
 * The proposing run as `proposalApply` reads it: none where the proposal names no run (the person's, Nemia's); `succeeded` once it
 * succeeded; `ended` where it was called off, or is gone; `going` while it runs, waits, or sits failed, since a failed run can be retried,
 * and where its state was not read on this pass. Pure.
 */
export const proposingRunOf = (run: string | undefined, state: RunState | undefined): ProposingRun => {
  if (run === undefined) return 'none';
  if (state === 'succeeded') return 'succeeded';
  if (state === 'cancelled' || state === 'gone') return 'ended';
  return 'going';
};
