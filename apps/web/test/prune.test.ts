import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Decidable } from '../src/lib/api.ts';
import { awaitingOf, firstChoice, prunable, pruneOffer, pruneQuestion, type Awaiting } from '../src/lib/prune.ts';

type Prunable = Parameters<typeof pruneOffer>[0];

/**
 * A repository run that succeeded: nothing moving, its worktree and its files still on disk. Whether anybody decided it is the api's
 * to say.
 */
const finished: Prunable = { id: 'r-1', place: 'repository', status: 'succeeded', moving: false, onDisk: { worktrees: true, files: true } };
/** The api's decision of a run nobody merged, and of one that worked on its base branch itself (`Decidable['awaiting']`). */
const unmerged: Awaiting = { branches: ['wf/r-1/implement'], direct: false };
const direct: Awaiting = { branches: ['main'], direct: true };
const keys = (run: Prunable, awaiting: Awaiting | null) => pruneOffer(run, awaiting)?.choices.map((c) => [c.key, c.label, c.how]);

test('pruneOffer, awaitingOf: what a finished run is offered to prune, and what it is told it loses', async (t) => {
  await t.test(
    'a run nobody waits on — shipped, or called off — is offered its worktrees, or its files too, and nothing about merging',
    () => {
      const offer = pruneOffer(finished, null)!;
      assert.deepEqual(
        offer.choices.map((c) => [c.key, c.how, c.unavailable]),
        [
          ['worktrees', { artifacts: false, unmerged: false }, null],
          ['files', { artifacts: true, unmerged: false }, null],
        ],
      );
      assert.equal(offer.warning, null);
      assert.equal(firstChoice(offer).key, 'worktrees');
      assert.equal(pruneQuestion('r-1', firstChoice(offer), offer), 'Prune r-1: its worktrees? This cannot be undone.');
    },
  );
  await t.test('a run nobody merged is offered the third choice alone, and told its branch becomes the only copy of its work', () => {
    const offer = pruneOffer(finished, unmerged)!;
    assert.deepEqual(
      offer.choices.map((c) => c.key),
      ['worktrees', 'files', 'unmerged'],
    );
    assert.deepEqual(
      offer.choices.map((c) => c.unavailable),
      ['Nobody merged it: only the last choice prunes it.', 'Nobody merged it: only the last choice prunes it.', null],
      'the first two would be refused by the package: each says why',
    );
    const third = firstChoice(offer);
    assert.equal(third.key, 'unmerged', 'neither refused choice is chosen first');
    assert.equal(third.label, 'Its worktrees and its files, though nobody merged it');
    assert.deepEqual(third.how, { artifacts: true, unmerged: true });
    assert.match(
      third.says,
      /^Its work was never merged: once pruned, wf\/r-1\/implement is the only copy of it\. No branch is ever deleted/,
    );
    const asked = pruneQuestion('r-1', third, offer);
    assert.match(
      asked,
      /^Prune r-1: its worktrees and its files, though nobody merged it\? This cannot be undone\. Its work was never merged/,
      'asked twice: the second question says it again',
    );
    assert.match(
      pruneOffer(finished, { branches: ['wf/r-1/a', 'wf/r-1/b'], direct: false })!.warning!,
      /once pruned, wf\/r-1\/a, wf\/r-1\/b are the only copy of it/,
      'two result branches are both named',
    );
  });
  await t.test(
    'a run that succeeded on its base branch itself (--no-worktree) is offered the third choice, which the package asks for, and told what its decision loses',
    () => {
      const offer = pruneOffer({ ...finished, onDisk: { worktrees: false, files: true } }, direct)!;
      assert.deepEqual(
        offer.choices.map((c) => [c.key, c.label, c.unavailable]),
        [
          ['files', 'Its files', 'It waits on your decision: only the last choice prunes it.'],
          ['unmerged', 'Its files, though nobody decided it', null],
        ],
        'the list never says `toDecide` of such a run: its decision says it waits, as `wf prune` reads it',
      );
      assert.equal(firstChoice(offer).key, 'unmerged');
      assert.deepEqual(firstChoice(offer).how, { artifacts: true, unmerged: true });
      assert.match(offer.warning!, /^It worked on main itself and nobody has decided it/);
      assert.doesNotMatch(offer.warning!, /only copy/);
    },
  );
  await t.test(
    'a failed run whose branch a person merged by hand shipped, as the package reads it: both choices open, and no branch is said to be the only copy',
    () => {
      const shippedByHand = { nothing: 'shipped — wf/r-1/implement is already on main' };
      const failed = { ...finished, status: 'failed' as const };
      const offer = pruneOffer(failed, awaitingOf(shippedByHand))!;
      assert.deepEqual(
        offer.choices.map((c) => [c.key, c.unavailable]),
        [
          ['worktrees', null],
          ['files', null],
        ],
      );
      assert.equal(offer.warning, null);
      assert.equal(firstChoice(offer).key, 'worktrees', 'the api answers such a run `nothing: shipped …`: the status does not decide it');
      assert.equal(
        firstChoice(pruneOffer(failed, unmerged)!).key,
        'unmerged',
        'the api answers a failed run nobody merged `awaiting`: the status does not decide it',
      );
    },
  );
  await t.test(
    'the decision is read for its `awaiting` alone: null for every answer but a decidable one, and for an api older than the field',
    () => {
      const decidable: Omit<Decidable, 'awaiting'> = {
        standings: [],
        touched: [],
        lesson: { said: '', state: 'nothing' },
        sensitive: [],
        used: {},
        total: { usage: null, used: '', cost: '', costUsd: null, apiMs: null, toolMs: null, read: null, peak: null, rebuilt: 0 },
        cost: null,
        overBudget: null,
        collisions: null,
        commands: [],
      };
      assert.deepEqual(awaitingOf({ ...decidable, awaiting: unmerged }), unmerged);
      assert.equal(awaitingOf({ ...decidable, awaiting: null }), null);
      assert.equal(awaitingOf(decidable as never), null, 'a decision without `awaiting`, which the type does not allow, has none');
      assert.equal(awaitingOf({ nothing: 'cancelled at 2026-09-28T09:00:00.000Z — nothing to decide' }), null);
      assert.equal(awaitingOf({ running: true }), null);
    },
  );
  await t.test(
    'only what is on disk is offered: its files alone once its worktrees are gone, its worktrees alone with no files, and nothing once both are',
    () => {
      assert.deepEqual(keys({ ...finished, onDisk: { worktrees: false, files: true } }, null), [
        ['files', 'Its files', { artifacts: true, unmerged: false }],
      ]);
      assert.deepEqual(keys({ ...finished, onDisk: { worktrees: false, files: true } }, unmerged), [
        ['files', 'Its files', { artifacts: true, unmerged: false }],
        ['unmerged', 'Its files, though nobody merged it', { artifacts: true, unmerged: true }],
      ]);
      assert.deepEqual(
        keys({ ...finished, onDisk: { worktrees: true, files: false } }, unmerged),
        [
          ['worktrees', 'Its worktrees', { artifacts: false, unmerged: false }],
          ['unmerged', 'Its worktrees, though nobody merged it', { artifacts: false, unmerged: true }],
        ],
        'with no files, the third choice asks none: `--unmerged` alone',
      );
      assert.equal(pruneOffer({ ...finished, onDisk: { worktrees: false, files: false } }, null), null);
      assert.equal(prunable({ ...finished, onDisk: { worktrees: false, files: false } }), false);
    },
  );
  await t.test('nothing is offered of a folder run, a run still running, or one with something still moving', () => {
    for (const run of [
      { ...finished, place: 'folder' as const },
      { ...finished, status: 'running' as const },
      { ...finished, moving: true },
    ]) {
      assert.equal(prunable(run), false, JSON.stringify(run));
      assert.equal(pruneOffer(run, unmerged), null, JSON.stringify(run));
    }
    assert.equal(prunable(finished), true);
  });
});
