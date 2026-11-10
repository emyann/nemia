/**
 * Where result branches stand, read live (`standingNow`, `standing.verb.ts`): a repository run whose unfrozen workflow folder does not
 * load names no branch to ask, and a reader over the reading says why of each branch of it (`unloaded`, `UnloadedFolder`'s own words),
 * never that it was not asked; the pass goes on for every other run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { aRun } from '../../test/run-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { UnloadedFolder } from '../steps/steps.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { standingNow, standingReader } from './standing.verb.ts';

const stand = eachTest(testPlace);

test('a run whose unfrozen folder does not load asks no branch, and its branches read unread in its folder’s words', () => {
  const root = scratch('wf-standing-unloaded-');
  const base = aRun('r-unloaded');
  assert.ok(isRepositoryRun(base));
  const run: Run = { ...base, workflowDir: path.join(root, 'workflows', 'gone') };
  delete run.workflow;
  const standing = Effect.runSync(Effect.provide(Effect.provideService(standingNow([run]), StoreRoot, root), stand().layer));
  assert.ok(isRepositoryRun(run));
  const exit = Effect.runSync(Effect.exit(Effect.provideService(stepsOf(run), StoreRoot, root)));
  assert.ok(Exit.isFailure(exit), 'the folder does not load');
  const refusal = exit.cause.reasons[0] && 'error' in exit.cause.reasons[0] ? exit.cause.reasons[0].error : undefined;
  assert.ok(refusal instanceof UnloadedFolder);
  assert.equal(standing.unloaded?.get(run.id), refusal.why, "the reason is the refusal's own");
  assert.equal(standingReader(standing).unread(run, 'wf/r-unloaded/implement'), refusal.why, 'a branch of it says why it was not read');
});
