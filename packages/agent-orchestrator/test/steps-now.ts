/**
 * A run's steps read now, for a test (`stepsOf`, `src/record/steps.verb.ts`, run at once): at the store's root the process's `WF_ROOT`
 * names, read when it is called, so a file that sets its own root before it imports this reads that one. Throws the refusal itself.
 * Imported with `await import`, after the file sets its environment, as the record's store is.
 */
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { StoreRoot } from '../src/config/root.store.ts';
import { stepsOf } from '../src/record/steps.verb.ts';
import type { Run } from '../src/record/record.ts';
import type { Workflow } from '../src/workflow.ts';

export const stepsNow = (run: Run): Workflow[] => {
  const root = process.env.WF_ROOT;
  assert.ok(root, 'the test process names its store: set WF_ROOT, as test/ambient.ts does');
  return Effect.runSync(Effect.provideService(stepsOf(run), StoreRoot, root));
};
