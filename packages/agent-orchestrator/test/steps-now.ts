/**
 * A run's steps read now, for a test (`stepsOf`, `src/steps/steps.verb.ts`, run at once), at the store's root `root`: the test's own,
 * or by default the throwaway `test/ambient.ts` names. Throws the refusal itself.
 */
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { StoreRoot } from '../src/config/root.store.ts';
import { stepsOf } from '../src/steps/steps.verb.ts';
import type { Run } from '../src/record/record.ts';
import type { StepSpec } from '../src/workflow.ts';

export const stepsNow = (run: Run, root: string | undefined = process.env.WF_ROOT): StepSpec[] => {
  assert.ok(root, 'the test names its store: hand stepsNow its root, or load test/ambient.ts, which sets WF_ROOT');
  return Effect.runSync(Effect.provideService(stepsOf(run), StoreRoot, root));
};
