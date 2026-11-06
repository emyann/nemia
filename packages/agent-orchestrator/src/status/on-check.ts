import type { StepRecord, TaskPhase } from '../record/record.ts';
import { endsOnBase, type Workflow } from '../step/step.ts';

/**
 * Where a step with a `check:` stands on it, its closeout aside (`ownStatus`): `verified` once its check passed, `failed (check)` once
 * it refused or did not finish, `checking` until then. An ending that lands on its check (`landsOnCheck`) stands where the run's landing of
 * its merge left it (`landingDue`), never on the check alone: `verified` once the run has committed the merge, and `checking` until it has
 * committed or aborted it. Read of a signed step, and of one whose session was ended at its budget once a recheck filed its check. Pure.
 */
export const onItsCheck = (
  step: Workflow,
  record: StepRecord,
  phaseOf: (taskId: string) => TaskPhase,
): 'verified' | 'failed (check)' | 'failed' | 'checking' => {
  const check = record.check ? phaseOf(record.check.taskId) : undefined;
  if (endsOnBase(step)) {
    if (!record.landed) return 'checking';
    if ('commit' in record.landed) return 'verified';
    return check === 'failed' || check === 'stopped' || check === 'unknown' ? 'failed (check)' : 'failed';
  }
  return check === 'succeeded' ? 'verified' : check === 'failed' || check === 'stopped' ? 'failed (check)' : 'checking';
};
