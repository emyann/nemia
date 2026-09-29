/**
 * `runMain` in the process: what a program ends with reaches its caller as it was — its value, or the very error it failed or died with,
 * after what it held was let go — and the signal handlers it takes are handed back. A signal's exit code, which ends the process, is
 * daemon.store.test.ts's, on a real `wf up`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Conflict } from '../refusal/refusal.ts';
import { runMain } from './run-main.ts';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const listening = () => SIGNALS.map((s) => process.listenerCount(s));

test('a program that succeeds resolves with its value, and leaves no signal handler behind', async () => {
  const before = listening();
  assert.equal(await runMain(Effect.sleep(1).pipe(Effect.as('done'))), 'done');
  assert.deepEqual(listening(), before);
});

test('REFUSED: a program that fails with a refusal rejects with that refusal, its exitCode 2 kept, once what it held is let go', async () => {
  const before = listening();
  const refusal = new Conflict({ message: 'wf up: the store is taken' });
  const released: string[] = [];
  const program = Effect.acquireRelease(Effect.succeed('held'), () => Effect.sync(() => released.push('released'))).pipe(
    Effect.andThen(Effect.sleep(1)),
    Effect.andThen(Effect.fail(refusal)),
    Effect.scoped,
  );
  const threw = await runMain(program).then(
    () => undefined,
    (err: unknown) => err,
  );
  assert.equal(threw, refusal, 'the very instance, not a wrapper of it');
  assert.equal(threw.exitCode, 2);
  assert.equal(threw.message, 'wf up: the store is taken');
  assert.deepEqual(released, ['released'], 'let go before the caller hears of the failure');
  assert.deepEqual(listening(), before);
});

test('a program that dies with a thrown error, as a pass that throws does, rejects with that error', async () => {
  const before = listening();
  const crash = Object.assign(new Error('the pass threw'), { exitCode: 9 });
  const threw = await runMain(
    Effect.sync(() => {
      throw crash;
    }),
  ).then(
    () => undefined,
    (err: unknown) => err,
  );
  assert.equal(threw, crash);
  assert.equal((threw as Error).message, 'the pass threw');
  assert.deepEqual(listening(), before);
});

test('while a program runs, it listens for SIGINT, SIGTERM and SIGHUP, one handler each', async () => {
  const before = listening();
  let during: number[] = [];
  await runMain(
    Effect.sleep(1).pipe(
      Effect.andThen(
        Effect.sync(() => {
          during = listening();
        }),
      ),
    ),
  );
  assert.deepEqual(
    during,
    before.map((n) => n + 1),
  );
  assert.deepEqual(listening(), before);
});
