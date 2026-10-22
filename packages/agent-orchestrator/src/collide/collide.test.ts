/**
 * The collisions an ending's decision reads (`collide.ts`): which runs are in flight beside a run (`othersInFlight`), the trials asked in
 * order (`trialsOf`), which ending reads them (`collisionsDue`), and what the place's answer says (`collisionsOf`), the semantic conflict
 * among it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collisionsDue, collisionsOf, othersInFlight, trialsOf } from './collide.ts';
import type { RepositoryRun, Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import type { TrialMerge } from '../place/place.ts';

const STEPS: Workflow[] = [
  { name: 'implement', after: [], body: 'Build it.' },
  { name: 'ship', after: ['implement'], body: 'Ship it.', workspace: 'main', check: 'npm test' },
];

/** The same shape with no gate anywhere, as `quick` is: its ending lands on its check all the same, filed by the review before it. */
const UNGATED = (): RepositoryRun => ({ ...refused(SHA), gates: [] });

/** A repository run `id` on /code/app's main, gated at its ship, with `more` over it. */
const run = (id: string, more: Partial<RepositoryRun> = {}): RepositoryRun => ({
  id,
  workspace: '/code/app',
  brief: 'b',
  workflowDir: '/wf',
  createdAt: '2026-10-05T00:00:00.000Z',
  repo: '/code/app',
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  gates: ['ship'],
  steps: { implement: { taskId: `t-${id}`, branch: `wf/${id}/implement` } },
  ...more,
});

const CLEAN: TrialMerge = { clean: true };
const SHA = 'b'.repeat(40);

/** `run` whose ship's landing was aborted, its check `t-check` having refused the merged tree on `refusedOn`. */
const refused = (refusedOn: string | undefined, check = true): RepositoryRun =>
  run('r-1', {
    steps: {
      implement: { taskId: 't-r-1', branch: 'wf/r-1/implement' },
      ship: {
        taskId: 't-ship',
        landed: { aborted: '2026-10-05T01:00:00.000Z', ...(refusedOn ? { refusedOn } : {}) },
        ...(check ? { check: { taskId: 't-check' } } : {}),
      },
    },
  });

test('othersInFlight keeps each other run with worktrees on the same repository and base, a held one among them', () => {
  const ours = run('r-1');
  const held = run('r-3', { hold: { until: ['r-9'] } } as Partial<RepositoryRun>);
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

test('collisionsDue reads the ending waiting at its gate, or one whose landing a check refused — gated or not', () => {
  assert.equal(collisionsDue(STEPS, run('r-1'), { kind: 'approve', step: 'ship', says: null, filed: false }), 'ship');
  assert.equal(collisionsDue(STEPS, refused(SHA), undefined), 'ship');
  assert.equal(
    collisionsDue(STEPS, UNGATED(), undefined),
    'ship',
    "an ungated ending lands on its check in the same way, so its refused merge owes the same trials: quick's land, filed by its review",
  );
});

test('REFUSED: collisionsDue for a result left to the person, an ending landed or untouched, a run called off or pruned', () => {
  assert.equal(collisionsDue(STEPS, run('r-1'), { kind: 'result', branches: ['wf/r-1/implement'] }), undefined);
  assert.equal(collisionsDue(STEPS, run('r-1'), undefined), undefined);
  const landed = run('r-1', { steps: { ship: { taskId: 't-ship', landed: { commit: SHA } } } });
  assert.equal(collisionsDue(STEPS, landed, undefined), undefined);
  const untouched = run('r-1', { steps: { ship: { taskId: 't-ship', landed: { untouched: 'x' } } } });
  assert.equal(collisionsDue(STEPS, untouched, undefined), undefined);
  assert.equal(collisionsDue(STEPS, { ...refused(SHA), cancelledAt: '2026-10-05T02:00:00.000Z' }, undefined), undefined);
  assert.equal(collisionsDue(STEPS, { ...refused(SHA), pruned: { at: 'x' } } as unknown as Run, undefined), undefined);
  assert.equal(
    collisionsDue([{ ...STEPS[0] }, { ...STEPS[1], check: undefined }], refused(SHA), undefined),
    undefined,
    'an ending with no `check:` lands nothing on one: its session commits or aborts in its own prose, and no check refused a merge',
  );
  assert.equal(
    collisionsDue([{ ...STEPS[0] }, { ...STEPS[1], workspace: undefined }], refused(SHA), undefined),
    undefined,
    'and a step of the work ends nothing on the base branch',
  );
});

test('collisionsOf words the base, each run it collides with and in which files, and what git could not say', () => {
  const theirs = [
    { run: 'r-2', branch: 'wf/r-2/implement' },
    { run: 'r-3', branch: 'wf/r-3/implement' },
    { run: 'r-4', branch: 'wf/r-4/implement' },
  ];
  const c = collisionsOf(run('r-1'), 'ship', ['wf/r-1/implement'], theirs, {
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
  assert.equal(c.semantic, null);
});

test('collisionsOf says when it collides with none, and when no other run is in flight', () => {
  const one = [{ run: 'r-2', branch: 'wf/r-2/implement' }];
  const none = collisionsOf(run('r-1'), 'ship', ['wf/r-1/implement'], one, { at: { main: SHA }, trials: [CLEAN, CLEAN] });
  assert.deepEqual(none.colliding, []);
  assert.equal(none.said, 'collides with none of the 1 run in flight on main');
  const alone = collisionsOf(run('r-1'), 'ship', ['wf/r-1/implement'], [], { at: { main: SHA }, trials: [CLEAN] });
  assert.equal(alone.said, 'no other run is in flight on main');
});

test("collisionsOf says the semantic conflict: a clean merge onto the base whose landing check refused the base's commit now", () => {
  const c = collisionsOf(refused(SHA), 'ship', ['wf/r-1/implement'], [], { at: { main: SHA }, trials: [CLEAN] });
  assert.deepEqual(c.semantic, {
    step: 'ship',
    check: 't-check',
    sha: SHA,
    said: "merges cleanly onto main, and ship's landing check refused the merged tree at bbbbbbb: a conflict of meaning, not of text",
  });
});

test('REFUSED: no semantic conflict on a base moved since, a refusal on no commit, a check not kept, or a base that conflicts', () => {
  const asked = (r: RepositoryRun, trial: TrialMerge, at: string | null = SHA) =>
    collisionsOf(r, 'ship', ['wf/r-1/implement'], [], { at: { main: at }, trials: [trial] }).semantic;
  assert.equal(asked(refused('c'.repeat(40)), CLEAN), null, 'the base moved since');
  assert.equal(asked(refused(undefined), CLEAN), null, 'no commit refused');
  assert.equal(asked(refused(SHA, false), CLEAN), null, 'no check kept');
  assert.equal(asked(refused(SHA), { clean: false, conflicts: ['a'] }), null, 'the base conflicts');
  assert.equal(asked(refused(SHA), { unknown: 'no' }), null, 'git could not say');
  assert.equal(asked(refused(SHA), CLEAN, null), null, 'the place names no base');
  assert.equal(collisionsOf(refused(SHA), undefined, ['wf/r-1/implement'], [], { at: { main: SHA }, trials: [CLEAN] }).semantic, null);
});
