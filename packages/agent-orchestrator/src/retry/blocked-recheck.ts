/**
 * Whether a step that signed off `blocked` may have the failed check of the try before it run again (`nemia retry <run> <step> --recheck`),
 * and why not: the judgement (`blockedRecheck`) and its read off the record (`blockedRecheckRead`). Pure; its laws are
 * `contracts/blocked-recheck.contract.ts`'s. `retryable`, `retriesDue` and `retryRefusal` read it alike, so they cannot disagree.
 */
import type { BlockedRecheckRead, BlockedRechecked } from '../../contracts/blocked-recheck.contract.ts';
import { SETTLED, type StepRecord, type TaskPhase } from '../record/record.ts';

export type { BlockedRecheck, BlockedRecheckRead, BlockedRecheckWhy } from '../../contracts/blocked-recheck.contract.ts';

/** Where a step's branch is now, as its caller read it: undefined where it did not, and on a folder run, which has no branch. */
export type TipOf = (branch: string) => string | undefined;

/** The check may run again, or why not: see the contract for each `why`. */
export const blockedRecheck: BlockedRechecked = (i) => {
  if (!i.blocked) return { recheck: false, why: 'not blocked' };
  if (!i.settled) return { recheck: false, why: 'unsettled' };
  const behind = i.behind;
  if (behind === null || behind.sameTask || (behind.checkPhase !== 'failed' && behind.checkPhase !== 'stopped'))
    return { recheck: false, why: 'no failed check' };
  if (!i.handedOff) return { recheck: false, why: 'not handed off' };
  if (behind.tip === null) return { recheck: false, why: 'unrecorded' };
  if (i.tipNow === null) return { recheck: false, why: 'unread' };
  if (i.tipNow !== behind.tip) return { recheck: false, why: 'moved', was: behind.tip, now: i.tipNow };
  return { recheck: true };
};

/**
 * What `blockedRecheck` is handed for a step, off its record as it is: `blocked`, whether it stands blocked on its own work (`ownStatus`,
 * the caller's reading); the try just behind the current one and its check; and where its branch is now (`tipOf`; left out, unread).
 */
export const blockedRecheckRead = (
  record: StepRecord | undefined,
  blocked: boolean,
  phaseOf: (taskId: string) => TaskPhase,
  tipOf: TipOf | undefined,
): BlockedRecheckRead => {
  const taskId = record?.taskId;
  const last = record?.tries?.at(-1);
  const check = last?.check;
  const now = record?.branch && tipOf ? tipOf(record.branch) : undefined;
  return {
    blocked,
    settled: Boolean(taskId && SETTLED.has(phaseOf(taskId))),
    handedOff: Boolean(taskId && record?.handedOff === taskId),
    behind: last && check ? { sameTask: last.taskId === taskId, checkPhase: phaseOf(check.taskId), tip: check.tip ?? null } : null,
    tipNow: now ?? null,
  };
};
