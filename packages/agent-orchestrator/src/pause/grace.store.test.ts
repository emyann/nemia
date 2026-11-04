/**
 * The store's pause grace on disk (`pause-grace.json`): ten minutes where no file is, the file's once `putGrace` writes it, and a file
 * that does not read refused, naming the verb that writes it again. Each test on a root of its own, given by parameter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';
import { graceAt, graceFile, putGrace } from './grace.store.ts';
import { DEFAULT_GRACE_MS } from './pause.ts';

/** Whether `fn` refuses `Invalid` with exit 2, its message naming each of `facts`. */
function invalid(fn: () => unknown, ...facts: string[]): void {
  try {
    fn();
  } catch (err) {
    const e = err as Error & { exitCode?: number; _tag?: string };
    assert.deepEqual([e._tag, e.exitCode], ['Invalid', 2], e.message);
    names(e.message, ...facts);
    return;
  }
  assert.fail('expected a refusal');
}

test("the store's pause grace: the default with no file, a grace written and read back, a bad file and a bad grace refused", async (t) => {
  await t.test('with no file the grace is ten minutes, not set', () => {
    assert.deepEqual(graceAt(scratch('wf-grace-')), { ms: DEFAULT_GRACE_MS, set: false });
  });
  await t.test('a grace written is the grace read back, stamped when it was set', () => {
    const home = scratch('wf-grace-');
    const at = new Date('2026-11-03T10:00:00.000Z');
    assert.deepEqual(putGrace(home, '15m', at), { ms: 900_000, set: true, at: at.toISOString() });
    assert.deepEqual(graceAt(home), { ms: 900_000, set: true, at: at.toISOString() });
    assert.deepEqual(JSON.parse(fs.readFileSync(graceFile(home), 'utf8')), { grace: '15m', at: at.toISOString() });
    assert.deepEqual(fs.readdirSync(home), ['pause-grace.json'], 'no hidden file left behind');
  });
  await t.test('REFUSED: a file that does not read, or holds no grace, names the file and nemia grace <d>', () => {
    for (const text of ['not json', '{"grace": 600}', '{"grace": "ten"}', '{"grace": "24h"}']) {
      const home = scratch('wf-grace-');
      fs.writeFileSync(graceFile(home), text);
      invalid(() => graceAt(home), graceFile(home), 'nemia grace <d>');
    }
  });
  await t.test('REFUSED: a grace out of its form is not written', () => {
    const home = scratch('wf-grace-');
    invalid(() => putGrace(home, '0s'), 'nemia grace');
    assert.equal(fs.existsSync(graceFile(home)), false);
  });
});
