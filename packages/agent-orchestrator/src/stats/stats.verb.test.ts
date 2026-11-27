/**
 * What one run gives the stats (`factsRead`, `stats.verb.ts`) where its unfrozen workflow folder does not load: nothing, and why, said
 * as a record that does not read is said. Over a store of its own at `ROOT`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import type { Run } from '../record/record.ts';
import type { StoreRoot as StoreRootNeeded } from '../config/root.store.ts';
import { factsRead, mergedRun } from './stats.verb.ts';
import { stepsOrWhy } from '../steps/steps.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { aRun } from '../../test/run-walks.ts';
import { engineOf } from '../runtime-client.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import type { StepSpec } from '../workflow.ts';

const ROOT = scratch('wf-stats-facts-');

const engine = eachTest(testEngine);

test("a run whose unfrozen folder does not load gives the stats nothing, and says why in the folder's own words", () => {
  const run: Run = { ...aRun('r-unloaded'), workflowDir: path.join(ROOT, 'workflows', 'gone') };
  delete run.workflow;
  const rooted = <A, E>(program: Effect.Effect<A, E, StoreRootNeeded>) => Effect.runSync(Effect.provideService(program, StoreRoot, ROOT));
  const why = rooted(stepsOrWhy(run));
  assert.ok('unloaded' in why);
  const said: string[] = [];
  assert.equal(rooted(factsRead(engineOf(engine().layer), run, (line) => said.push(line))), null);
  assert.equal(said.length, 1, said.join('\n'));
  assert.ok(said[0]?.includes('r-unloaded'), said[0]);
  assert.ok(said[0]?.includes(why.unloaded), said[0]);
});

const reading = (over: Partial<BranchReader>) =>
  ({
    merged: () => false,
    has: () => true,
    ahead: () => 0,
    heads: () => new Map(),
    unread: () => undefined,
    ...over,
  }) satisfies BranchReader;

const withBranch = () => {
  const base = aRun('r-merged');
  return { ...base, steps: { ...base.steps, review: { taskId: 'r-merged-review', branch: 'wf/r-merged/run' } } } as Run;
};

test('a run is merged when every result branch is on its base, as the standing the tick read says', () => {
  const run = withBranch();
  const steps = run.workflow as StepSpec[];
  assert.equal(mergedRun(run, steps, reading({ merged: () => true })), true, 'on the base');
  assert.equal(mergedRun(run, steps, reading({ ahead: () => 2 })), false, 'ahead of it');
  assert.equal(mergedRun(run, steps, reading({ has: () => false })), false, 'gone');
});

test('a run whose branches were not read, or that has none, is neither merged nor unmerged', () => {
  const run = withBranch();
  const steps = run.workflow as StepSpec[];
  assert.equal(mergedRun(run, steps, reading({ unread: () => 'no pass has read it' })), null);
  const folder = { ...run, place: { kind: 'folder' }, repo: undefined, baseRef: undefined, branch: undefined } as unknown as Run;
  assert.equal(mergedRun(folder, steps, reading({ merged: () => true })), null);
});
