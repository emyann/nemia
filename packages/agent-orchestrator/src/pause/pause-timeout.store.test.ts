/**
 * The store's pause timeout on disk (`pause-timeout.json`): ten minutes where no file is, the file's once `putTimeout` writes it, and a
 * file that does not read refused, naming the verb that writes it again. Each test on a root of its own, given by parameter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import { timeoutAt, timeoutFile, putTimeout } from './pause-timeout.store.ts';
import { DEFAULT_TIMEOUT_MS } from './pause.ts';

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

test("the store's pause timeout: the default with no file, a timeout written and read back, a bad file and a bad timeout refused", async (t) => {
  await t.test('with no file the timeout is ten minutes, not set', () => {
    assert.deepEqual(timeoutAt(scratch('wf-timeout-')), { ms: DEFAULT_TIMEOUT_MS, set: false });
  });
  await t.test('a timeout written is the timeout read back, stamped when it was set', () => {
    const home = scratch('wf-timeout-');
    const at = new Date('2026-11-03T10:00:00.000Z');
    assert.deepEqual(putTimeout(home, '15m', at), { ms: 900_000, set: true, at: at.toISOString() });
    assert.deepEqual(timeoutAt(home), { ms: 900_000, set: true, at: at.toISOString() });
    assert.deepEqual(JSON.parse(fs.readFileSync(timeoutFile(home), 'utf8')), { timeout: '15m', at: at.toISOString() });
    assert.deepEqual(fs.readdirSync(home), ['pause-timeout.json'], 'no hidden file left behind');
  });
  await t.test('REFUSED: a file that does not read, or holds no timeout, names the file and nemia pause-timeout <d>', () => {
    for (const text of ['not json', '{"timeout": 600}', '{"timeout": "ten"}', '{"timeout": "24h"}']) {
      const home = scratch('wf-timeout-');
      fs.writeFileSync(timeoutFile(home), text);
      invalid(() => timeoutAt(home), timeoutFile(home), 'nemia pause-timeout <d>');
    }
  });
  await t.test('REFUSED: a timeout out of its form is not written', () => {
    const home = scratch('wf-timeout-');
    invalid(() => putTimeout(home, '0s'), 'nemia pause-timeout');
    assert.equal(fs.existsSync(timeoutFile(home)), false);
  });
});
