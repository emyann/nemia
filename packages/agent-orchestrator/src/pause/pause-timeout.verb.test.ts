/**
 * `nemia pause-timeout`: bare, the timeout in force — the default with no file, or the one set and when; given a duration, it writes it; a
 * timeout out of its form, and a file that does not read, refused. Through the command's entry, at a root of the test's own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import { timeoutFile } from './pause-timeout.store.ts';
import { TIMEOUT } from './pause-timeout.verb.ts';
import { storeGiven } from '../../test/config-given.ts';

/** `nemia pause-timeout` given `args` at `home`: its answer, or its refusal thrown. */
const timed = (home: string, args: Record<string, string> = {}) =>
  Effect.runPromise(storeGiven(home)(TIMEOUT.handler(args)) as Effect.Effect<Effect.Success<ReturnType<typeof TIMEOUT.handler>>, unknown>);

test('nemia pause-timeout: the default with no file, a timeout set and then read back, and refusals', async (t) => {
  const home = scratch('wf-timeout-verb-');
  await t.test('bare with no file: 10m, the default', async () => {
    const answer = await timed(home);
    assert.deepEqual(answer, { timeout: { ms: 600_000, set: false }, wrote: false });
    assert.deepEqual(TIMEOUT.print(answer, {}), ["the store's pause timeout is 10m (the default)"]);
  });
  await t.test('nemia pause-timeout 15m writes it; bare then says 15m and when it was set', async () => {
    const wrote = await timed(home, { timeout: '15m' });
    assert.equal(wrote.wrote, true);
    assert.equal(wrote.timeout.ms, 900_000);
    names(TIMEOUT.print(wrote, { timeout: '15m' })[0], '15m');
    const read = await timed(home);
    assert.deepEqual(read, { timeout: { ms: 900_000, set: true, at: wrote.timeout.at }, wrote: false });
    assert.deepEqual(TIMEOUT.print(read, {}), [`the store's pause timeout is 15m, set ${wrote.timeout.at}`]);
  });
  await t.test('REFUSED: a timeout out of its form, by the check, and a file that does not read, by the read', async () => {
    for (const bad of ['0s', '24h', 'ten']) assert.equal(typeof TIMEOUT.check?.({ timeout: bad }), 'string', bad);
    assert.equal(TIMEOUT.check?.({ timeout: '90s' }), null);
    fs.writeFileSync(timeoutFile(home), 'not json');
    await assert.rejects(timed(home), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
      names(err.message, 'nemia pause-timeout <d>');
      return true;
    });
  });
});
