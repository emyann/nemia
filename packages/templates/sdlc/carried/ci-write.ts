/**
 * What `ci-watch.ts` writes for one condition of one step's try, decided from what it read: whether the step has reached the condition
 * (`conditionDue`), what is done for the condition `ci`, CI at the head of the run's pull request (`headWrite`), and for `base-ci`, CI at
 * the merge commit on the base branch (`mergeWrite`). Pure, reading no process and calling nothing; the laws are proved by
 * `contracts/ci-write.contract.ts`, beside the template. It imports only that contract's types, by a whole `import type`, which the run's
 * type stripping erases, so the frozen copy, where no `contracts/` sits, loads nothing of it.
 */
import type {
  Act,
  Ci,
  ConditionDue,
  HeadRead,
  HeadWrite,
  MergeRead,
  MergeWrite,
  Pull,
  Red,
  ServedCheck,
} from '../../contracts/ci-write.contract.ts';

export type { Act, Ci, HeadRead, MergeRead, Pull, Red, ServedCheck };

/**
 * Whether the step has reached `condition`: it is checking its try, a check of it waits on the condition, and every check listed before
 * the first such check passed on this try.
 * @param checking Whether the step's status is `checking`.
 * @param checks The step's checks of the current try, in its order.
 * @param condition The condition's name.
 */
export const conditionDue: ConditionDue = (checking, checks, condition) => {
  const at = checks.findIndex((c) => c.condition === condition);
  return checking && at >= 0 && checks.slice(0, at).every((c) => c.passed);
};

/**
 * What is done for the condition `ci` of a step's try.
 * @param r What was read of the pull request and its context.
 */
export const headWrite: HeadWrite = (r) => {
  if (!r.due || r.decided) return 'nothing';
  if (r.pull === 'merged') return 'pass';
  if (r.pull === 'none') return 'wait';
  if (!r.ours) return 'nothing';
  if (r.pull === 'conflicting') return 'refuse';
  if (r.ci === 'passed' || r.ci === 'undeclared') return 'pass';
  if (r.ci === 'failed') return r.red === 'rerun' ? 'rerun' : 'refuse';
  if (r.ci === 'absent' && r.stuck) return 'dispatch';
  return 'wait';
};

/**
 * What is done for the condition `base-ci` of a step's try.
 * @param r What was read of the merge and its context.
 */
export const mergeWrite: MergeWrite = (r) => {
  if (!r.due || r.decided) return 'nothing';
  if (!r.waits) return 'pass';
  if (!r.merged) return 'wait';
  if (r.sameTree || r.ci === 'undeclared' || r.ci === 'passed') return 'pass';
  if ((r.ci === 'failed' || r.ci === 'superseded') && r.tip === 'passed') return 'pass';
  if (r.ci === 'failed') return r.red === 'rerun' ? 'rerun' : 'refuse';
  if (r.ci === 'superseded' && r.tip === 'failed') return 'refuse';
  return 'wait';
};
