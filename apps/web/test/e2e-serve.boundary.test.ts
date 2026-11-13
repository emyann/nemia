/**
 * The board's holder that ends before it serves says why: `startHolder` (`e2e/serve.ts`) rejects with the holder's own error, read from
 * the `hold.log` it leaves in its folder, never with nothing to say.
 *
 * A boundary test, and the real holder is its whole subject: the refusal is read from a log a detached process writes and then must not
 * take with it on its way out, which no stand-in models. The holder is made to fail honestly, before it serves: its PATH is an empty
 * folder, so the seed's first `git` cannot start. No build is made and no server started; the seed fails first.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { scratch } from 'test-kit/scratch';
import { startHolder } from './e2e/serve.ts';

test('REFUSED a holder that ends before it serves: the refusal quotes its reason from the hold.log it leaves', async () => {
  const root = scratch('nemia-board-hold-');
  const dir = path.join(root, 'board');
  const empty = path.join(root, 'no-programs');
  fs.mkdirSync(dir);
  fs.mkdirSync(empty);
  const refused = await startHolder(dir, 'tree', { ...process.env, PATH: empty }).then(
    () => assert.fail('a holder with no git on its PATH served'),
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  );
  assert.match(refused, /ENOENT|git/, "the holder's own error is in the refusal");
  assert.match(refused, /hold\.log/, 'and the log it is read from is named');
  assert.doesNotMatch(refused, /\(nothing\)/);
  const log = path.join(dir, 'hold.log');
  assert.ok(fs.existsSync(log) && fs.statSync(log).size > 0, 'hold.log stays, holding what the holder said');
  assert.ok(!fs.existsSync(path.join(dir, 'store')), 'the store it began is gone with it');
});
