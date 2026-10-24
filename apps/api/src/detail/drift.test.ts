/**
 * The folder's drift the run page shows: how the workflow folder has moved away from the steps the run started with (`driftOf`). The
 * kinds a run is behind the files on are the orchestrator's (`driftNow`), held in its own `test/revisions.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { driftOf } from './tries.ts';

/** A run of one step `build`. */
const runWith = (): Run => ({
  id: 'r-1',
  workspace: '/w',
  brief: 'do it',
  workflowDir: '/w/workflows/team',
  createdAt: '2026-10-15T00:00:00.000Z',
  place: { kind: 'folder' },
  steps: { build: { taskId: 'r-1-build' } },
});

test('driftOf: the folder’s own drift is a name-level warning, and none where the names agree', async (t) => {
  const steps = (...names: string[]): Workflow[] => names.map((name) => ({ name, after: [], body: '' }));
  await t.test('the same names: no warning', () => {
    assert.equal(driftOf(runWith(), steps('build')), null);
  });
  await t.test('a step the folder gained is named', () => {
    assert.match(driftOf(runWith(), steps('build', 'review'))!, /it has review, which the run did not start with/);
  });
  await t.test('a step the folder lost is named', () => {
    assert.match(driftOf(runWith(), steps('review'))!, /it no longer has build/);
  });
});
