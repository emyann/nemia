/**
 * Where a step's check that waits on a condition stands, off the condition written for it (agent-orchestrator,
 * src/condition/condition.ts, `conditionStanding`): the judgement a pass makes on every pass of a check named in a step's `checks:`
 * with `condition:` in place of `run:`, once the pass has named it on the step's record. It stands as a check's task would
 * (`CheckStanding`, contracts/checks-due.contract.ts), so `checksDue` judges it beside the step's other checks unchanged.
 *
 * Kubernetes' readiness gate: a Pod lists the condition types it waits on, and a controller writes each on the Pod's status. Here the
 * condition is written for one try of the step (`try`), so a verdict written for an earlier try, or a recheck's, is never read as the
 * current try's: it reads as not written yet. `Unknown` is the writer's own "not yet". No deadline: a wait is said on the step, never
 * cut short by the pass, as no readiness gate is.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ConditionStatus } from 'objects';
import type { CheckStanding } from './checks-due.contract.ts';

/** A condition's status as a writer gives it: Kubernetes' three, `Unknown` the writer's word for "not decided yet". */
export type WrittenStatus = ConditionStatus | 'Unknown';

/** What the store holds of a condition written for a step: its status, and the try of the step it speaks of, from 1. */
export type WrittenCondition = { readonly status: WrittenStatus; readonly try: number };

/** Whether `written` speaks of the try `current` with the status `status`. */
const writtenFor = (written: WrittenCondition | null, current: number, status: WrittenStatus) =>
  written !== null && written.try === current && written.status === status;

const conditionStandingSpec = spec<(written: WrittenCondition | null, current: number) => CheckStanding>({
  /** A try is counted from 1, on the record and in what a writer gives. */
  requires: ({ input: [written, current] }) =>
    Number.isInteger(current) && current >= 1 && (written === null || (Number.isInteger(written.try) && written.try >= 1)),
  ensures: {
    passedExactlyWhenTrueForThisTry: {
      description: 'The check passes exactly when its condition is written True for the try the step is on',
      condition: ({ input: [written, current], output }) => (output === 'passed') === writtenFor(written, current, 'True'),
    },
    refusedExactlyWhenFalseForThisTry: {
      description: 'The check refuses exactly when its condition is written False for the try the step is on',
      condition: ({ input: [written, current], output }) => (output === 'refused') === writtenFor(written, current, 'False'),
    },
    runningUntilWrittenForThisTry: {
      description:
        'A condition not written, written Unknown, or written for another try leaves the check running: an old verdict is never the new try’s',
      condition: ({ input: [written, current], output }) =>
        (output === 'running') === !(writtenFor(written, current, 'True') || writtenFor(written, current, 'False')),
    },
  },
});

/** `conditionStanding`'s type, which `src/condition/condition.ts` takes. */
export type ConditionStanding = Implementation<typeof conditionStandingSpec>;
