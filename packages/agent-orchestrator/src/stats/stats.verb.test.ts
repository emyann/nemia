/**
 * What one run gives the stats (`factsRead`, `stats.verb.ts`) where its unfrozen workflow folder does not load: nothing, and why, said
 * as a record that does not read is said. Over a store of its own at `ROOT`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import type { Run } from '../record/record.ts';
import type { StoreRoot as StoreRootNeeded } from '../config/root.store.ts';
import { factsRead } from './stats.verb.ts';
import { stepsOrWhy } from '../steps/steps.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { aRun } from '../../test/run-walks.ts';
import { engineOf } from '../runtime-client.ts';

const ROOT = scratch('wf-stats-facts-');

const engine = eachTest(testEngine);

test("a run whose unfrozen folder does not load gives the stats nothing, and says why in the folder's own words", () => {
  const run: Run = { ...aRun('r-unloaded'), workflowDir: path.join(ROOT, 'workflows', 'gone') };
  delete run.workflow;
  const rooted = <A, E>(program: Effect.Effect<A, E, StoreRootNeeded>): A =>
    Effect.runSync(Effect.provideService(program, StoreRoot, ROOT));
  const why = rooted(stepsOrWhy(run));
  assert.ok('unloaded' in why);
  const said: string[] = [];
  assert.equal(rooted(factsRead(engineOf(engine().layer), run, (line) => said.push(line))), null);
  assert.equal(said.length, 1, said.join('\n'));
  assert.ok(said[0]?.includes('r-unloaded'), said[0]);
  assert.ok(said[0]?.includes(why.unloaded), said[0]);
});
