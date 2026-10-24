import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdable, holdCandidates } from '../src/lib/hold.ts';

type Run = Parameters<typeof holdCandidates>[1][number] & Parameters<typeof holdable>[0];

/** A repository run of `/code/app` in flight, held by nobody: what the page offers a hold of, and what a hold may wait on. */
const run = (extra: Partial<Run> = {}): Run => ({
  id: 'r-1',
  place: 'repository',
  repo: '/code/app',
  cancelledAt: null,
  pruned: null,
  holding: null,
  holdUntil: [],
  status: 'running',
  toDecide: null,
  ...extra,
});

test('holdable, holdCandidates: which run is offered a hold, and which runs a hold may wait on', async (t) => {
  await t.test('a repository run in flight, or stopped on something, held by nobody, is offered a hold', () => {
    assert.equal(holdable(run()), true);
    assert.equal(holdable(run({ status: 'failed' })), true);
  });
  await t.test(
    'REFUSED: a run that cannot be held by what it says of itself is offered none — a folder run, called off, pruned, held, succeeded',
    () => {
      const holding = { at: 'now', runs: [], word: 'held until r-2 lands', advice: '', onYou: false };
      const cases: Array<[string, Partial<Run>]> = [
        ['a folder run', { place: 'folder', repo: null }],
        ['a repository run with no repository said', { repo: null }],
        ['called off', { cancelledAt: 'now', status: 'cancelled' }],
        ['called off, its status not yet said', { cancelledAt: 'now' }],
        ['pruned', { pruned: { said: 'pruned' } }],
        ['held', { holding, holdUntil: ['r-2'] }],
        ['held, its words not read', { holdUntil: ['r-2'] }],
        ['held, the runs it waits on not said', { holding }],
        ['succeeded', { status: 'succeeded' }],
      ];
      for (const [what, extra] of cases) assert.equal(holdable(run(extra)), false, what);
    },
  );
  await t.test(
    'a hold may wait on the other runs of its repository not called off, pruned or landed, in the order given — one succeeded with branches to decide among them',
    () => {
      const runs = [
        run({ id: 'r-2' }),
        run(),
        run({ id: 'r-3', status: 'failed' }),
        run({ id: 'r-4', status: 'succeeded', toDecide: { kind: 'result', branches: [], said: '', command: '' } }),
      ];
      assert.deepEqual(
        holdCandidates(run(), runs).map((r) => r.id),
        ['r-2', 'r-3', 'r-4'],
      );
    },
  );
  await t.test(
    'REFUSED: a run a hold could never wait on is not offered — the run itself, another repository, a folder run, called off, pruned, succeeded and merged',
    () => {
      const runs = [
        run(),
        run({ id: 'other-repo', repo: '/code/other' }),
        run({ id: 'folder', place: 'folder', repo: null }),
        run({ id: 'cancelled', cancelledAt: 'now', status: 'cancelled' }),
        run({ id: 'cancelled-running', cancelledAt: 'now' }),
        run({ id: 'pruned', pruned: { said: 'pruned' } }),
        run({ id: 'landed', status: 'succeeded' }),
      ];
      assert.deepEqual(holdCandidates(run(), runs), []);
      assert.deepEqual(holdCandidates(run({ repo: null }), [run({ id: 'r-2', repo: null })]), [], 'no repository said, none matches');
    },
  );
});
