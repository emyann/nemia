/**
 * `nemia grace`: bare, the grace in force — the default with no file, or the one set and when; given a duration, it writes it; a grace out
 * of its form, and a file that does not read, refused. Through the command's entry, at a root of the test's own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';
import { graceFile } from './grace.store.ts';
import { GRACE } from './grace.verb.ts';
import { TABLE } from '../command/commands.verb.ts';

/** `nemia grace` given `args` at `home`: its answer, or its refusal thrown. */
const graced = (home: string, args: Record<string, string> = {}) =>
  Effect.runPromise(GRACE.handler(args, undefined, home) as Effect.Effect<Effect.Success<ReturnType<typeof GRACE.handler>>, unknown>);

test('nemia grace: the default with no file, a grace set and then read back, and refusals', async (t) => {
  const home = scratch('wf-grace-verb-');
  await t.test('bare with no file: 10m, the default', async () => {
    const answer = await graced(home);
    assert.deepEqual(answer, { grace: { ms: 600_000, set: false }, wrote: false });
    assert.deepEqual(GRACE.print(answer, {}), ["the store's pause grace is 10m (the default)"]);
  });
  await t.test('nemia grace 15m writes it; bare then says 15m and when it was set', async () => {
    const wrote = await graced(home, { grace: '15m' });
    assert.equal(wrote.wrote, true);
    assert.equal(wrote.grace.ms, 900_000);
    names(GRACE.print(wrote, { grace: '15m' })[0], '15m');
    const read = await graced(home);
    assert.deepEqual(read, { grace: { ms: 900_000, set: true, at: wrote.grace.at }, wrote: false });
    assert.deepEqual(GRACE.print(read, {}), [`the store's pause grace is 15m, set ${wrote.grace.at}`]);
  });
  await t.test('REFUSED: a grace out of its form, by the check, and a file that does not read, by the read', async () => {
    for (const bad of ['0s', '24h', 'ten']) assert.equal(typeof GRACE.check?.({ grace: bad }), 'string', bad);
    assert.equal(GRACE.check?.({ grace: '90s' }), null);
    fs.writeFileSync(graceFile(home), 'not json');
    await assert.rejects(graced(home), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
      names(err.message, 'nemia grace <d>');
      return true;
    });
  });
  await t.test('it is a command of the CLI alone, listed beside nemia pause', () => {
    assert.equal(GRACE.only?.side, 'cli');
    assert.equal(GRACE.route, undefined);
    const names = TABLE.map((c) => c.name);
    assert.equal(names.indexOf('grace'), names.indexOf('pause') + 1);
  });
});
