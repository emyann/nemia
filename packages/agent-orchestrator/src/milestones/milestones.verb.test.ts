/**
 * The store's milestones read now (`milestonesNow`), each off what the store holds, the needs' readings planted in this process's memory
 * (`NeedsMemory`) and the runs on the Run door's memory: an empty store has the harness next and the rest later; a harness installed and
 * signed in, a factory filed, a writable volume that is there, no mount refuses and every harness trusts, and a run whose step landed a
 * commit each make theirs done; a read-only volume, an untrusted one and one a mount would refuse do not.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { scratch } from 'test-kit/scratch';
import { aRun } from '../../test/run-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { testPlace } from '../../place/memory/index.ts';
import { createFactoryAt } from '../../testing.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory } from '../needs/needs.verb.ts';
import type { Run } from '../record/record.ts';
import { trustPlaces } from '../trust/trust.verb.ts';
import { volumeWaitsOnTrust } from './milestones.ts';
import { milestonesNow } from './milestones.verb.ts';

/** The milestones of the store `root`, its harness's needs read `harness`, its runs `runs`, as the read answers them. */
const milestonesOf = (root: string, harness: 'met' | 'missing', runs: readonly Run[] = []) => {
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
  return read.milestones;
};

/** Each milestone's state by its name, as `milestonesOf` reads them. */
const statesOf = (root: string, harness: 'met' | 'missing', runs: readonly Run[] = []) =>
  Object.fromEntries(milestonesOf(root, harness, runs).map((m) => [m.name, m.state]));

describe('a store meets its milestones in order, each read from what it holds now', () => {
  test('an empty store has the harness next, the rest later', () => {
    assert.deepEqual(statesOf(scratch('wf-milestones-'), 'missing'), {
      harness: 'next',
      factory: 'later',
      volume: 'later',
      landed: 'later',
    });
  });
  test('a harness signed in, a factory filed, a writable volume mounted and trusted, and a run landed are each done', () => {
    const root = scratch('wf-milestones-');
    assert.equal(statesOf(root, 'met').harness, 'done');
    assert.equal(statesOf(root, 'met').factory, 'next');
    createFactoryAt(root, { name: 'acme', volumes: [], workflows: [], hires: {}, schedules: {} });
    assert.deepEqual(statesOf(root, 'met'), { harness: 'done', factory: 'done', volume: 'next', landed: 'later' });
    const shelf = scratch('wf-milestones-volume-');
    createFactoryAt(root, {
      name: 'shelved',
      workflows: [],
      hires: {},
      schedules: {},
      volumes: [{ path: shelf, readOnly: true }],
    });
    assert.equal(statesOf(root, 'met').volume, 'next');
    const work = scratch('wf-milestones-work-');
    createFactoryAt(root, { name: 'worked', workflows: [], hires: {}, schedules: {}, volumes: [{ path: work, readOnly: false }] });
    const waiting = milestonesOf(root, 'met').find((m) => m.name === 'volume');
    assert.deepEqual([waiting?.state, waiting?.message], ['next', volumeWaitsOnTrust('worked')]);
    Effect.runSync(trustPlaces([work]).pipe(Effect.provide(PlaceService.layer(testPlace().place))));
    assert.equal(statesOf(root, 'met').volume, 'done');
    const run = aRun('r-landed');
    const landed: Run = { ...run, steps: { ...run.steps, implement: { taskId: 'r-landed-implement', landed: { commit: 'abc' } } } };
    assert.deepEqual(statesOf(root, 'met', [landed]), { harness: 'done', factory: 'done', volume: 'done', landed: 'done' });
  });
  test('REFUSED: a volume a mount would refuse is no milestone', () => {
    const root = scratch('wf-milestones-');
    const inStore = path.join(root, 'kept');
    fs.mkdirSync(inStore);
    createFactoryAt(root, {
      name: 'acme',
      workflows: [],
      hires: {},
      schedules: {},
      volumes: [{ path: inStore, readOnly: true }],
    });
    assert.equal(statesOf(root, 'met').volume, 'next');
  });
});
