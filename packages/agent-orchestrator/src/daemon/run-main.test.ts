/**
 * `runMain` in the process: what a program ends with reaches its caller as it was — its value, or the very error it failed or died with,
 * after what it held was let go — and the signal handlers it takes are handed back; and a signal that comes while the program first runs
 * without yielding, as a daemon taking the store does, lets go of what it held. A signal's exit code on a real `nemia up` is
 * daemon.store.test.ts's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { Conflict } from '../refusal/refusal.ts';
import { runMain } from './up.verb.ts';
import { nodeChild } from '../../test/child.ts';
import { scratch } from '../../test/scratch.ts';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const listening = () => SIGNALS.map((s) => process.listenerCount(s));

test('a program that succeeds resolves with its value, and leaves no signal handler behind', async () => {
  const before = listening();
  assert.equal(await runMain(Effect.sleep(1).pipe(Effect.as('done'))), 'done');
  assert.deepEqual(listening(), before);
});

test('REFUSED: a program that fails with a refusal rejects with that refusal, its exitCode 2 kept, once what it held is let go', async () => {
  const before = listening();
  const refusal = new Conflict({ message: 'nemia up: the store is taken' });
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
  assert.equal(threw.message, 'nemia up: the store is taken');
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

test('a SIGTERM while the program first runs without yielding is heard once it yields: what it held is let go, and it exits 143', async () => {
  const dir = scratch('wf-run-main-');
  const [taken, signalled, released] = ['taken', 'signalled', 'released'].map((name) => path.join(dir, name));
  const up = pathToFileURL(path.join(import.meta.dirname, 'up.verb.ts')).href;
  const child = nodeChild(
    [
      "const fs = await import('node:fs');",
      "const { Effect } = await import('effect');",
      `const { runMain } = await import(${JSON.stringify(up)});`,
      'const held = Effect.acquireRelease(',
      `  Effect.sync(() => { fs.writeFileSync(${JSON.stringify(taken)}, ''); while (!fs.existsSync(${JSON.stringify(signalled)})) {} }),`,
      `  () => Effect.sync(() => fs.writeFileSync(${JSON.stringify(released)}, '')),`,
      ');',
      "await runMain(held.pipe(Effect.andThen(Effect.sleep('1 hour')), Effect.scoped));",
    ].join('\n'),
    process.env,
  );
  await child.until(() => fs.existsSync(taken), 'the program took what it holds');
  child.child.kill('SIGTERM');
  fs.writeFileSync(signalled, '');
  const ended = await child.closed;
  assert.deepEqual([ended.code, ended.signal], [143, null], child.err());
  assert.ok(fs.existsSync(released), 'what it held was let go');
});
