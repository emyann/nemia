/**
 * Which runner a Claude Code spawn goes to (`attachedLongLived`): a long-lived request runs attached while a holder holds the attached
 * sessions, and is refused when nothing holds them — there is no `--bg` to fall back on — so its attempt ends `unstartable` and is
 * never restarted; a job's route is not this rule's, and a request for the claude.ai bridge does not change it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect } from 'effect';
import { attachedLongLived, claudeCodeOps } from './code.ts';
import type { Attached } from './attached.ts';
import { Engine } from '../../index.ts';
import { builtEngine } from '../../../test/engine.ts';
import { scratch } from '../../../test/scratch.ts';

/** An attached runner that holds, or does not. */
const holder = (holding: boolean) => ({ holding: () => holding });

const ROWS: { name: string; run: () => void }[] = [
  {
    name: 'a long-lived request runs attached while a holder holds the attached sessions',
    run: () => assert.equal(attachedLongLived({ restartPolicy: 'Always' }, holder(true)), true),
  },
  {
    name: 'REFUSED: a long-lived request with no holder, and one where no attached runner is there at all, does not run attached',
    run: () => {
      assert.equal(attachedLongLived({ restartPolicy: 'Always' }, holder(false)), false, 'a holder that let go does not run it');
      assert.equal(attachedLongLived({ restartPolicy: 'Always' }, undefined), false, 'nor does an engine with no attached runner');
    },
  },
  {
    name: 'REFUSED: a request that is no long-lived session is not sent attached by this rule, holder or not',
    run: () => assert.equal(attachedLongLived({}, holder(true)), false, 'a job takes its own route'),
  },
];

test('attachedLongLived: a long-lived request runs attached while a holder holds, and nothing else does', async (t) => {
  for (const row of ROWS) await t.test(row.name, row.run);
});

test('REFUSED: a long-lived spawn with nothing holding the attached sessions, refused, and its attempt never restarted', async (t) => {
  const request = { name: 'ae/t1/1', brief: 'stay', cwd: '/r', restartPolicy: 'Always' as const };
  await t.test('a runner with no attached sessions refuses it, `refused`, before anything runs', async () => {
    const err = await Effect.runPromise(Effect.flip(claudeCodeOps({ root: scratch('ae-route-') }).spawn(request)));
    assert.deepEqual([err._tag, err.refused], ['RunnerError', true]);
  });
  await t.test('an engine whose attached sessions nothing holds ends the attempt `unstartable` and starts no other', async () => {
    const engine = builtEngine(Engine.layer({ root: scratch('ae-route-root-'), harnesses: { claude: 'claude' } }));
    const id = await Effect.runPromise(engine.file({ brief: 'stay', cwd: scratch('ae-route-cwd-'), restartPolicy: 'Always' }));
    for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
    const { state } = await Effect.runPromise(engine.view(id));
    assert.deepEqual(
      state.attempts.map((a) => a.reason),
      ['unstartable'],
      'one attempt, unstartable, and no restart',
    );
  });
});

/** An attached runner that holds, each spawn it is handed counted: what `claudeCodeOps` routes a spawn to while a holder holds. */
const holding = () => {
  const spawned: string[] = [];
  const attached: Attached = {
    ops: {
      spawn: (r) => Effect.sync(() => void spawned.push(r.name)),
      observe: Effect.succeed(new Map()),
      observeFor: () => Effect.succeed({ seen: new Map(), unread: new Set() }),
      stop: () => Effect.void,
      logs: () => Effect.succeed(''),
    },
    hold: Effect.void,
    holding: () => true,
    has: (name) => spawned.includes(name),
    following: () => 0,
  };
  return { attached, spawned };
};

test('under a holder, a job spawn takes the job road and a long-lived spawn goes attached', async (t) => {
  await t.test(
    'a job spawn takes the job road, never the attached one: refused by the job road, which checks its folder first',
    async () => {
      const { attached, spawned } = holding();
      const r = { name: 'ae/j1/1', brief: 'run it', cwd: '/no/such/folder/ae-route' };
      const err = await Effect.runPromise(Effect.flip(claudeCodeOps({ root: scratch('ae-route-job-') }, attached).spawn(r)));
      assert.equal(err._tag, 'RunnerError');
      assert.deepEqual(spawned, [], 'and nothing was spawned attached');
    },
  );
  await t.test('a long-lived spawn goes attached', async () => {
    const { attached, spawned } = holding();
    const r = { name: 'ae/l1/1', brief: 'stay', cwd: '/no/such/folder/ae-route', restartPolicy: 'Always' as const };
    await Effect.runPromise(claudeCodeOps({ root: scratch('ae-route-ll-') }, attached).spawn(r));
    assert.deepEqual(spawned, ['ae/l1/1'], 'spawned attached');
  });
});
