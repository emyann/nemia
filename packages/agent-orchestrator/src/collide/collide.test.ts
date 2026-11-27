/**
 * The collisions a run's decision reads (`collide.ts`): which runs are in flight beside a run (`othersInFlight`), the trials asked in
 * order (`trialsOf`), and what the place's answer says (`collisionsOf`).
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { collisionsOf, othersInFlight, trialsOf } from './collide.ts';
import type { RepositoryRun, Run } from '../record/record.ts';
import type { TrialMerge } from '../place/place.ts';

/** A repository run `id` on /code/app's main, with `more` over it. */
const run = (id: string, more: Partial<RepositoryRun> = {}) => ({
  id,
  workspace: '/code/app',
  brief: 'b',
  workflowDir: '/wf',
  createdAt: '2026-10-05T00:00:00.000Z',
  repo: '/code/app',
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  steps: { implement: { taskId: `t-${id}`, branch: `wf/${id}/implement` } },
  ...more,
});

const CLEAN: TrialMerge = { clean: true };
const SHA = 'b'.repeat(40);

test('othersInFlight keeps each other run with worktrees on the same repository and base, a held one among them', () => {
  const ours = run('r-1');
  const held = run('r-3', { hold: { at: '2026-01-01T00:00:00Z', until: ['r-9'] } });
  assert.deepEqual(
    othersInFlight(ours, [ours, run('r-2'), held, run('r-4', { repo: '/code/app/' })]).map((r) => r.id),
    ['r-2', 'r-3', 'r-4'],
  );
});

test('REFUSED: othersInFlight leaves out a run called off, pruned, on another base or repository, without worktrees, or a folder run', () => {
  const ours = run('r-1');
  const folder = { ...run('r-7'), place: { kind: 'folder' }, repo: undefined, branch: undefined } as unknown as Run;
  const others = [
    run('r-2', { cancelledAt: '2026-10-05T00:00:00.000Z' }),
    run('r-3', { pruned: { at: '2026-10-05T00:00:00.000Z' } } as Partial<RepositoryRun>),
    run('r-4', { branch: 'release' }),
    run('r-5', { repo: '/code/other' }),
    run('r-6', { isolate: false }),
    folder,
  ];
  for (const other of others) assert.deepEqual(othersInFlight(ours, [ours, other]), [], other.id);
});

test('trialsOf asks each of ours onto the base, then each of ours onto each branch of theirs, in that order', () => {
  assert.deepEqual(
    trialsOf(
      'main',
      ['wf/r-1/a', 'wf/r-1/b'],
      [
        { run: 'r-2', branch: 'wf/r-2/x' },
        { run: 'r-3', branch: 'wf/r-3/y' },
      ],
    ),
    [
      { onto: 'main', branch: 'wf/r-1/a' },
      { onto: 'main', branch: 'wf/r-1/b' },
      { onto: 'wf/r-2/x', branch: 'wf/r-1/a' },
      { onto: 'wf/r-2/x', branch: 'wf/r-1/b' },
      { onto: 'wf/r-3/y', branch: 'wf/r-1/a' },
      { onto: 'wf/r-3/y', branch: 'wf/r-1/b' },
    ],
  );
});

test('collisionsOf words the base, each run it collides with and in which files, and what git could not say', () => {
  const theirs = [
    { run: 'r-2', branch: 'wf/r-2/implement' },
    { run: 'r-3', branch: 'wf/r-3/implement' },
    { run: 'r-4', branch: 'wf/r-4/implement' },
  ];
  const c = collisionsOf(run('r-1'), ['wf/r-1/implement'], theirs, {
    at: { main: SHA },
    trials: [CLEAN, { clean: false, conflicts: ['src/a.ts', 'src/b.ts'] }, CLEAN, { unknown: 'fatal: not a valid object name' }],
  });
  assert.deepEqual(c.base, [{ branch: 'wf/r-1/implement', clean: true, said: 'merges cleanly onto main' }]);
  assert.deepEqual(c.inFlight, ['r-2', 'r-3', 'r-4']);
  assert.deepEqual(
    c.colliding.map((x) => [x.run, x.branch, x.ours, x.said]),
    [
      ['r-2', 'wf/r-2/implement', 'wf/r-1/implement', "conflicts with r-2's wf/r-2/implement in 2 files: src/a.ts, src/b.ts"],
      [
        'r-4',
        'wf/r-4/implement',
        'wf/r-1/implement',
        "whether it merges onto r-4's wf/r-4/implement is not known: fatal: not a valid object name",
      ],
    ],
  );
  assert.equal(c.said, 'collides with 1 of the 3 runs in flight on main: r-2; whether it collides with r-4 is not known');
});

test('collisionsOf says when it collides with none, and when no other run is in flight', () => {
  const one = [{ run: 'r-2', branch: 'wf/r-2/implement' }];
  const none = collisionsOf(run('r-1'), ['wf/r-1/implement'], one, { at: { main: SHA }, trials: [CLEAN, CLEAN] });
  assert.deepEqual(none.colliding, []);
  assert.equal(none.said, 'collides with none of the 1 run in flight on main');
  const alone = collisionsOf(run('r-1'), ['wf/r-1/implement'], [], { at: { main: SHA }, trials: [CLEAN] });
  assert.equal(alone.said, 'no other run is in flight on main');
});
