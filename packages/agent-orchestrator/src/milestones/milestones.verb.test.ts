/**
 * The store's milestones read now (`milestonesNow`), each off what the store holds, the needs' readings planted in this process's memory
 * (`NeedsMemory`) and the runs on the Run door's memory: an empty store has the harness next and the rest later; a harness installed and
 * signed in, a factory filed, a volume that is there and no mount refuses, and a run whose step landed a commit each make theirs done;
 * a volume a mount would refuse does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { aRun } from '../../test/run-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { testPlace } from '../../place/memory/index.ts';
import { createFactoryAt } from '../factory/factory.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory } from '../needs/needs.verb.ts';
import type { Run } from '../record/record.ts';
import { milestonesNow } from './milestones.verb.ts';

/** The milestones of the store `root`, its harness's needs read `harness`, its runs `runs`, each milestone's state by its name. */
const statesOf = (root: string, harness: 'met' | 'missing', runs: readonly Run[] = []) => {
  const memo = needsMemo(root);
  for (const need of memo.harnessNeeds) memo.readings.set(checkKey(harnessCheckOf(need)), harness);
  const program = Effect.gen(function* () {
    for (const run of runs) yield* (yield* RunDoor).runs.create(run);
    return yield* milestonesNow();
  });
  const read = Effect.runSync(
    Effect.provide(
      Effect.provideService(Effect.provideService(program, StoreRoot, root), NeedsMemory, memo),
      Layer.mergeAll(runDoorMemory(), PlaceService.layer(testPlace().place)),
    ),
  );
  return Object.fromEntries(read.milestones.map((m) => [m.name, m.state]));
};

test('a store meets its milestones in order, each read from what it holds now', async (t) => {
  await t.test('an empty store has the harness next, the rest later', () => {
    assert.deepEqual(statesOf(scratch('wf-milestones-'), 'missing'), {
      harness: 'next',
      factory: 'later',
      volume: 'later',
      landed: 'later',
    });
  });
  await t.test('a harness signed in, a factory filed, a volume mounted and a run landed are each done', () => {
    const root = scratch('wf-milestones-');
    assert.equal(statesOf(root, 'met').harness, 'done');
    assert.equal(statesOf(root, 'met').factory, 'next');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    createFactoryAt(root, { name: 'acme', repos: [repo], workflows: [], hires: {}, schedules: {} });
    assert.deepEqual(statesOf(root, 'met'), { harness: 'done', factory: 'done', volume: 'next', landed: 'later' });
    const shelf = scratch('wf-milestones-volume-');
    createFactoryAt(root, {
      name: 'shelved',
      repos: [repo],
      workflows: [],
      hires: {},
      schedules: {},
      volumes: [{ path: shelf, readOnly: true }],
    });
    assert.equal(statesOf(root, 'met').volume, 'done');
    const run = aRun('r-landed');
    const landed: Run = { ...run, steps: { ...run.steps, implement: { taskId: 'r-landed-implement', landed: { commit: 'abc' } } } };
    assert.deepEqual(statesOf(root, 'met', [landed]), { harness: 'done', factory: 'done', volume: 'done', landed: 'done' });
  });
  await t.test('REFUSED: a volume a mount would refuse is no milestone', () => {
    const root = scratch('wf-milestones-');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    createFactoryAt(root, {
      name: 'acme',
      repos: [repo],
      workflows: [],
      hires: {},
      schedules: {},
      volumes: [{ path: repo, readOnly: true }],
    });
    assert.equal(statesOf(root, 'met').volume, 'next');
  });
});
