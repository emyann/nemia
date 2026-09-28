import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstChoice, nobodyMerged, pruneOffer, pruneQuestion } from '../src/lib/prune.ts';
import type { RunDetail } from '../src/lib/api.ts';

type Prunable = Parameters<typeof pruneOffer>[0];

/** A git run that succeeded and shipped: nothing left to decide, nothing moving, its worktree and its files still on disk. */
const shipped: Prunable = {
  id: 'r-1', place: 'git', status: 'succeeded', moving: false, cancelledAt: null, toDecide: null,
  onDisk: { worktrees: true, files: true }, isolate: true, branch: 'main',
};
const toMerge: RunDetail['toDecide'] = { kind: 'git', branches: ['wf/r-1/implement'], said: 'merge it', command: 'git merge wf/r-1/implement' };
const keys = (run: Prunable) => pruneOffer(run)?.choices.map((c) => [c.key, c.label, c.how]);

test('a shipped run is offered its worktrees, or its files too, and nothing about merging', () => {
  const offer = pruneOffer(shipped)!;
  assert.deepEqual(offer.choices.map((c) => [c.key, c.how, c.unavailable]), [
    ['worktrees', { artifacts: false, unmerged: false }, null],
    ['files', { artifacts: true, unmerged: false }, null],
  ]);
  assert.equal(offer.warning, null);
  assert.equal(firstChoice(offer).key, 'worktrees');
  assert.equal(pruneQuestion('r-1', firstChoice(offer), offer), 'Prune r-1: its worktrees? This cannot be undone.');
});

test('a run nobody merged is offered the third choice alone, and told its branch becomes the only copy of its work', () => {
  const offer = pruneOffer({ ...shipped, toDecide: toMerge })!;
  assert.deepEqual(offer.choices.map((c) => c.key), ['worktrees', 'files', 'unmerged']);
  // The first two would be refused by the package: each says why, and neither is chosen first.
  assert.deepEqual(offer.choices.map((c) => c.unavailable), ['Nobody merged it: only the last choice prunes it.', 'Nobody merged it: only the last choice prunes it.', null]);
  const third = firstChoice(offer);
  assert.equal(third.key, 'unmerged');
  assert.equal(third.label, 'Its worktrees and its files, though nobody merged it');
  assert.deepEqual(third.how, { artifacts: true, unmerged: true });
  assert.match(third.says, /^Its work was never merged: once pruned, wf\/r-1\/implement is the only copy of it\. No branch is ever deleted/);
  // Asked twice: the second question says it again.
  const asked = pruneQuestion('r-1', third, offer);
  assert.match(asked, /^Prune r-1: its worktrees and its files, though nobody merged it\? This cannot be undone\. Its work was never merged/);
});

test('a failed run is one nobody merged, though the api says nothing to decide about it', () => {
  const failed = { ...shipped, status: 'failed' as const };
  assert.equal(nobodyMerged(failed), true);
  const offer = pruneOffer(failed)!;
  assert.equal(firstChoice(offer).key, 'unmerged');
  // No branch named by the decision: the run's own result branches, by their pattern.
  assert.match(firstChoice(offer).says, /wf\/r-1\/… is the only copy/);
});

test('a run that worked on its base branch itself is told what its decision loses, not that a branch is the only copy', () => {
  const offer = pruneOffer({ ...shipped, status: 'failed', isolate: false, onDisk: { worktrees: false, files: true } })!;
  assert.deepEqual(offer.choices.map((c) => [c.key, c.label, c.unavailable]), [
    ['files', 'Its files', 'It waits on your decision: only the last choice prunes it.'],
    ['unmerged', 'Its files, though nobody decided it', null],
  ]);
  assert.match(offer.warning!, /^It worked on main itself and nobody has decided it/);
  assert.doesNotMatch(offer.warning!, /only copy/);
});

test('a run called off is not one nobody merged', () => {
  assert.equal(nobodyMerged({ ...shipped, status: 'cancelled', cancelledAt: '2026-09-28T09:00:00.000Z' }), false);
  assert.equal(nobodyMerged({ ...shipped, status: 'failed', cancelledAt: '2026-09-28T09:00:00.000Z' }), false);
  assert.deepEqual(pruneOffer({ ...shipped, status: 'cancelled', cancelledAt: '2026-09-28T09:00:00.000Z' })!.choices.map((c) => c.key), ['worktrees', 'files']);
});

test('only what is on disk is offered: its files alone once its worktrees are gone, its worktrees alone with no files, and nothing once both are', () => {
  assert.deepEqual(keys({ ...shipped, onDisk: { worktrees: false, files: true } }), [['files', 'Its files', { artifacts: true, unmerged: false }]]);
  assert.deepEqual(keys({ ...shipped, toDecide: toMerge, onDisk: { worktrees: false, files: true } }), [
    ['files', 'Its files', { artifacts: true, unmerged: false }],
    ['unmerged', 'Its files, though nobody merged it', { artifacts: true, unmerged: true }],
  ]);
  // With no files, the third choice asks none: `--unmerged` alone.
  assert.deepEqual(keys({ ...shipped, toDecide: toMerge, onDisk: { worktrees: true, files: false } }), [
    ['worktrees', 'Its worktrees', { artifacts: false, unmerged: false }],
    ['unmerged', 'Its worktrees, though nobody merged it', { artifacts: false, unmerged: true }],
  ]);
  assert.equal(pruneOffer({ ...shipped, onDisk: { worktrees: false, files: false } }), null);
});

test('nothing is offered of a folder run, a run still running, or one with something still moving', () => {
  assert.equal(pruneOffer({ ...shipped, place: 'folder' }), null);
  assert.equal(pruneOffer({ ...shipped, status: 'running' }), null);
  assert.equal(pruneOffer({ ...shipped, moving: true }), null);
});
