/**
 * The client's way of reading the runtime: a verb of the engine read through `asked` dies, as an `Error`, of the runtime's refusal in the
 * runtime's words, and an engine `engineOf` cannot build is refused in them; a program it runs (`runWith`) says its warnings and errors,
 * and no Info line. `WF_ROOT` is set before the client loads, a scratch root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Engine, EngineRefused, StopRefused } from 'agent-runtime';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('wf-runtime-client-');
const { asked, engineOf, runWith } = await import('../src/runtime-client.ts');

test('a runtime refusal read through asked rejects with exit code 2, its message led by the verb', async () => {
  const e = engineOf(testEngine().layer);
  const refused = Object.assign(e, { stop: () => Effect.fail(new StopRefused({ message: 'task t-1 has settled' })) });
  const err = await runWith(refused, asked('stop', refused.stop('t-1'))).then(
    () => assert.fail('the refusal was read as a success'),
    (e: unknown) => e as Error & { exitCode?: number },
  );
  assert.equal(err.exitCode, 2);
  assert.ok(err.message.startsWith('stop: '), err.message);
  assert.match(err.message, /task t-1 has settled/);
});

test('a failure of the runtime that is no refusal is thrown as it was, with no exit code and no verb', async () => {
  const e = engineOf(testEngine().layer);
  const lost = new Error('the journal is gone');
  const broken = Object.assign(e, { stop: () => Effect.fail(lost as never) });
  const err = await runWith(broken, asked('stop', broken.stop('t-1'))).then(
    () => assert.fail('the failure was read as a success'),
    (e: unknown) => e as Error & { exitCode?: number },
  );
  assert.equal(err.message, 'the journal is gone');
  assert.equal(err.exitCode, undefined);
});

test('an engine whose layer the runtime refuses is refused with exit code 2, its message led by engine', () => {
  const refused = Layer.effect(Engine, Effect.fail(new EngineRefused({ message: '`maxConcurrent: 0` is not a ceiling' })));
  const err = (() => {
    try {
      engineOf(refused);
    } catch (e) {
      return e as Error & { exitCode?: number };
    }
    return assert.fail('the refused layer was built into an engine');
  })();
  assert.equal(err.exitCode, 2);
  assert.ok(err.message.startsWith('engine: '), err.message);
  assert.match(err.message, /`maxConcurrent: 0` is not a ceiling/);
});

test('REFUSED: a program run through runWith says no Info line, and still says its warnings and errors on the console', async (t) => {
  const said: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    t.mock.method(console, method, (...args: unknown[]) => void said.push(args.map(String).join(' ')));
  await runWith(
    engineOf(testEngine().layer),
    Effect.gen(function* () {
      yield* Effect.logInfo('a feed line, said by the daemon alone');
      yield* Effect.logWarning('a warning a command must not swallow');
      yield* Effect.logError('an error a command must not swallow');
    }),
  );
  t.mock.restoreAll();
  assert.equal(said.filter((s) => s.includes('a feed line')).length, 0, said.join('\n'));
  assert.equal(said.filter((s) => s.includes('a warning a command must not swallow')).length, 1, said.join('\n'));
  assert.equal(said.filter((s) => s.includes('an error a command must not swallow')).length, 1, said.join('\n'));
});
