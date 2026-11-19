/**
 * A harness's check turn, started by the server (`startTurn`) and read back (`turnOf`), on the runtime's stand-in (`testEngine`), with the
 * needs' readings planted in this process's memory (`NeedsMemory`): the turn is filed as a job of the harness on its declared
 * `turnModel`, in its held fence, under its cap and deadline, asked for its one-word statement; refused while the harness is not
 * installed or not signed in, and for a harness that runs no turn; a second start while one runs answers the same turn; and its check
 * is read off its task as it settles — passed with its answer and cost, failed for its deadline, its cap or a silent end, in the
 * harness's own words.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { engineOf, runWith, type EngineService } from '../runtime-client.ts';
import { PlaceService } from '../place/place.store.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory, type NeedsMemo } from '../needs/needs.verb.ts';
import { signInNeedOf } from '../needs/harness.ts';
import { TURN_BUDGET_USD, TURN_DEADLINE_SECONDS } from './harness-turn.ts';
import { latestTurnCheck, startTurn, turnOf } from './harness-turn.verb.ts';

const HARNESS = 'claude';

const stand = eachTest(testPlace);
/** This test's store, a folder of its own, so no turn of another test is its latest. */
const root = eachTest(() => scratch('wf-turn-'));
const engine = eachTest(testEngine);

/** A memory with the harness's install and sign-in read as `install` and `signIn`. */
const memoWith = (install: 'met' | 'missing', signIn: 'met' | 'missing'): NeedsMemo => {
  const memo = needsMemo(root());
  for (const need of memo.harnessNeeds) {
    if (need.name === HARNESS) memo.readings.set(checkKey(harnessCheckOf(need)), install);
    if (need.name === signInNeedOf(HARNESS)) memo.readings.set(checkKey(harnessCheckOf(need)), signIn);
  }
  return memo;
};

/** `program` over this test's engine and the test place, its needs read as `memo` says. */
const run = <A, E>(program: Effect.Effect<A, E, PlaceService | StoreRoot | EngineService>, memo: NeedsMemo = memoWith('met', 'met')) =>
  runOver(runWith, () => PlaceService.layer(stand().place), { ...process.env, WF_ROOT: root() } satisfies Env)(
    engineOf(engine().layer),
    Effect.provideService(program, NeedsMemory, memo),
  );

/** What `program` was refused with. */
const refusedBy = async (program: Effect.Effect<unknown, unknown, PlaceService | StoreRoot | EngineService>, memo?: NeedsMemo) => {
  try {
    await run(program, memo);
  } catch (err) {
    return err;
  }
  assert.fail('the program was not refused');
};

test('a check turn is filed as a job of the harness on its turn model, in its held fence, under its cap and deadline, and read as it settles', async () => {
  const started = await run(startTurn({ harness: HARNESS }));
  assert.equal(started.check.state, 'running');
  const filed = engine().specs.at(-1);
  assert.ok(filed);
  const needs = HARNESS_DECLARATIONS[HARNESS]?.needs;
  assert.equal(filed.harness, HARNESS);
  assert.equal(filed.deadlineSeconds, TURN_DEADLINE_SECONDS);
  assert.ok(filed.closeoutSchema !== undefined);
  assert.equal(filed.config?.model, needs?.turnModel);
  const fence = HARNESS_DECLARATIONS[HARNESS]?.knobs?.fence.key;
  assert.ok(fence);
  assert.equal(
    (filed.config as Readonly<Record<string, unknown>> | undefined)?.[fence],
    HARNESS_DECLARATIONS[HARNESS]?.reach?.(needs?.turnModel).held,
    'it runs in its held fence',
  );
  assert.equal(filed.config?.budgetUsd, TURN_BUDGET_USD);

  assert.equal((await run(startTurn({ harness: HARNESS }))).id, started.id, 'a second start while one runs answers the same turn');
  assert.equal(engine().specs.length, 1);

  engine().settle(started.id, 'succeeded', { reason: 'harness', closeout: { answer: 'ready' }, usage: { costUsd: 0.0042 } });
  const passed = await run(turnOf(started.id));
  assert.equal(passed.check.state, 'passed');
  assert.equal(passed.check.answer, 'ready');
  assert.equal(passed.check.costUsd, 0.0042);
  assert.equal((await run(latestTurnCheck(root(), HARNESS))).state, 'passed');
});

describe('a turn ended at its deadline, at its cap, or with nothing said fails saying why, the last in the harness’s own words', () => {
const rows = [
    { end: { reason: 'deadline' as const }, failure: 'deadline' },
    { end: { reason: 'harness' as const, limit: 'budget' }, failure: 'budget' },
    { end: { reason: 'harness' as const }, failure: 'unanswered', printed: { stderr: 'Invalid API key · Please run /login\n' } },
  ];
for (const row of rows)
    test(row.failure, async () => {
      const started = await run(startTurn({ harness: HARNESS }));
      engine().settle(started.id, 'failed', { ...row.end, ...(row.printed ? { printed: row.printed } : {}) });
      const read = await run(turnOf(started.id));
      assert.equal(read.check.state, 'failed');
      assert.equal(read.check.failure, row.failure);
      if (row.printed) assert.ok(read.check.message.includes('Invalid API key'));
      assert.ok(read.check.fixes.length > 0);
    });
});

test('REFUSED: a turn while the harness is not installed or not signed in, through a harness that runs none, and of an unknown id', async () => {
  assert.ok((await refusedBy(startTurn({ harness: HARNESS }), memoWith('missing', 'missing'))) instanceof Invalid);
  assert.ok((await refusedBy(startTurn({ harness: HARNESS }), memoWith('met', 'missing'))) instanceof Invalid);
  assert.ok((await refusedBy(startTurn({ harness: 'command' }))) instanceof Missing);
  assert.ok((await refusedBy(turnOf('turn-none'))) instanceof Missing);
  assert.equal(engine().specs.length, 0);
});
