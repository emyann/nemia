import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstChoice, nobodyMerged, pruneOffer, pruneQuestion } from '../src/lib/prune.ts';
import type { RunDetail } from '../src/lib/api.ts';

type Prunable = Parameters<typeof pruneOffer>[0];

/** A git run that succeeded and shipped: nothing left to decide, nothing moving. */
const shipped: Prunable = { id: 'r-1', place: 'git', status: 'succeeded', moving: false, cancelledAt: null, toDecide: null, pruned: null };
const toMerge: RunDetail['toDecide'] = { kind: 'git', branches: ['wf/r-1/implement'], said: 'merge it', command: 'git merge wf/r-1/implement' };
const prunedAt = (artifacts: boolean): RunDetail['pruned'] => ({
  at: '2026-09-28T10:00:00.000Z',
  worktrees: [{ path: '/w/r-1/implement', bytes: 10 }],
  artifacts: artifacts ? { at: '2026-09-28T10:00:00.000Z', bytes: 5 } : null,
});

test('a shipped run is offered its worktrees, or its files too, and nothing about merging', () => {
  const offer = pruneOffer(shipped)!;
  assert.deepEqual(offer.choices.map((c) => [c.key, c.how, c.unavailable]), [
    ['worktrees', { artifacts: false, unmerged: false }, null],
    ['files', { artifacts: true, unmerged: false }, null],
  ]);
  assert.equal(offer.unmerged, false);
  assert.equal(firstChoice(offer).key, 'worktrees');
  assert.equal(pruneQuestion('r-1', firstChoice(offer), offer), 'Prune r-1: its worktrees? This cannot be undone.');
});

test('a run nobody merged is offered the third choice alone, and told its branch becomes the only copy of its work', () => {
  const offer = pruneOffer({ ...shipped, toDecide: toMerge })!;
  assert.deepEqual(offer.choices.map((c) => c.key), ['worktrees', 'files', 'unmerged']);
  // The first two would be refused by the package: each says why, and neither is chosen first.
  assert.deepEqual(offer.choices.map((c) => c.unavailable !== null), [true, true, false]);
  assert.match(offer.choices[0]!.unavailable!, /Nobody merged wf\/r-1\/implement/);
  const third = firstChoice(offer);
  assert.equal(third.key, 'unmerged');
  assert.deepEqual(third.how, { artifacts: true, unmerged: true });
  assert.match(third.says, /wf\/r-1\/implement is the only copy of it/);
  assert.match(third.says, /No branch is ever deleted/);
  // Asked twice: the second question says it again.
  const asked = pruneQuestion('r-1', third, offer);
  assert.match(asked, /^Prune r-1: its worktrees and its files, though nobody merged it\? This cannot be undone\. /);
  assert.match(asked, /is the only copy of it/);
});

test('a failed run is one nobody merged, though the api says nothing to decide about it', () => {
  const failed = { ...shipped, status: 'failed' as const };
  assert.equal(nobodyMerged(failed), true);
  const offer = pruneOffer(failed)!;
  assert.equal(firstChoice(offer).key, 'unmerged');
  // No branch named by the decision: the run's own result branches, by their pattern.
  assert.match(firstChoice(offer).says, /wf\/r-1\/… is the only copy/);
});

test('a run called off is not one nobody merged', () => {
  assert.equal(nobodyMerged({ ...shipped, status: 'cancelled', cancelledAt: '2026-09-28T09:00:00.000Z' }), false);
  assert.equal(nobodyMerged({ ...shipped, status: 'failed', cancelledAt: '2026-09-28T09:00:00.000Z' }), false);
  assert.deepEqual(pruneOffer({ ...shipped, status: 'cancelled', cancelledAt: '2026-09-28T09:00:00.000Z' })!.choices.map((c) => c.key), ['worktrees', 'files']);
});

test('a run pruned without its files is offered its files alone; once they are gone, nothing', () => {
  const offer = pruneOffer({ ...shipped, pruned: prunedAt(false) })!;
  assert.deepEqual(offer.choices.map((c) => [c.key, c.label]), [['files', 'Its files']]);
  const unmerged = pruneOffer({ ...shipped, toDecide: toMerge, pruned: prunedAt(false) })!;
  assert.deepEqual(unmerged.choices.map((c) => [c.key, c.label]), [['files', 'Its files'], ['unmerged', 'Its files, though nobody merged it']]);
  assert.equal(pruneOffer({ ...shipped, pruned: prunedAt(true) }), null);
});

test('nothing is offered of a folder run, a run still running, or one with something still moving', () => {
  assert.equal(pruneOffer({ ...shipped, place: 'folder' }), null);
  assert.equal(pruneOffer({ ...shipped, status: 'running' }), null);
  assert.equal(pruneOffer({ ...shipped, moving: true }), null);
});
