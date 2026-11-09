/**
 * The collisions an ending's decision reads live (`collisionsAt`): no other run's steps are read unless ours has a branch ahead of its
 * base, so a run beside ours whose folder no longer loads does not fail a decision that asks nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { collisionsAt } from './collisions.verb.ts';
import { HOME, writeRun } from '../record/record.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { UnloadedFolder } from '../steps/steps.ts';
import type { RepositoryRun } from '../record/record.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import type { Place } from '../place/place.store.ts';
import type { BranchStanding } from '../status/status.ts';

const repo = scratch('collisions-repo');

/** An isolated repository run `id` on `repo`'s main, in flight, with `more` over it. */
const aRun = (id: string, more: Partial<RepositoryRun> = {}): RepositoryRun => ({
  id,
  workspace: repo,
  brief: 'b',
  workflowDir: path.join(repo, 'workflows', 'gone'),
  createdAt: '2026-11-02T00:00:00.000Z',
  repo,
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  gates: [],
  steps: {},
  ...more,
});

const ours = aRun(`ours-${process.pid}`, {
  workflow: [{ name: 'implement', after: [], body: 'Build it.' }],
});
/** In flight beside ours, froze no steps, and its folder is gone: its steps fail `UnloadedFolder` when read. */
const theirs = aRun(`theirs-${process.pid}`);
writeRun(ours);
writeRun(theirs);

/** Never asked: a read of either fails the test. */
const git = new Proxy({}, { get: () => assert.fail('git was read') }) as BranchReader;
const place = new Proxy({}, { get: () => assert.fail('the place was asked') }) as Place;

const at = (standings: readonly BranchStanding[]) =>
  Effect.runSyncExit(Effect.provideService(collisionsAt(ours, 'implement', standings, git, place), StoreRoot, HOME));

test("a run with no branch ahead reads no other run's steps, and asks nothing", () => {
  const exit = at([{ branch: 'wf/ours/implement', where: 'on' }]);
  assert.ok(Exit.isSuccess(exit), 'an unloaded folder beside ours does not fail a decision that asks nothing');
  assert.equal(exit.value, undefined);
});

test("a run with a branch ahead reads the others' steps: one whose folder does not load still fails", () => {
  const ahead = collisionsAt(ours, 'implement', [{ branch: 'wf/ours/implement', where: 'ahead', commits: 1 }], git, place);
  const refused = Effect.runSync(Effect.flip(Effect.provideService(ahead, StoreRoot, HOME)));
  assert.ok(refused instanceof UnloadedFolder, 'the read is moved, not dropped');
});
