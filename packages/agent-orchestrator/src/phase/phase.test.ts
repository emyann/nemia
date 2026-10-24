/**
 * The code tables' predicates (`phase.ts`): which step statuses hold a run until someone acts (`holdsTheRun`), read off the codes a
 * line waits on a person by (`PERSON_WAITS`), so it cannot drift from them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdsTheRun, REASON_OF } from './phase.ts';
import type { StepStatus } from '../record/record.ts';

/** Every step status, in `REASON_OF`'s order. */
const STATUSES = Object.keys(REASON_OF) as StepStatus[];

test('holdsTheRun', async (t) => {
  await t.test('what holds a run is what waits on the person and a step stopped on what it was asked', () => {
    assert.deepEqual(STATUSES.filter(holdsTheRun), [
      'blocked',
      'unsigned',
      'awaiting approval',
      'exhausted',
      'over budget',
      'budget exhausted',
      'denied',
      'failed (check)',
    ]);
  });
  await t.test('a step the engine ended on its own holds no run: failed, stopped', () => {
    assert.deepEqual([holdsTheRun('failed'), holdsTheRun('stopped')], [false, false]);
  });
});
