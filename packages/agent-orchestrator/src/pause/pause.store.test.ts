/**
 * The store's pause on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the pause still pauses; and a cordon `nemia cordon` put before the switch, at the same `WF_ROOT/cordon`, is the
 * pause, honoured by every reader and resumed by `nemia resume`. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { settingsOf } from '../config/config.store.ts';
import { rootNow } from '../../test/config-given.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-pause-store-');
process.env.WF_ROOT = ROOT;
const { cutPause, pauseFile, resumePause, putPause, readPause } = await import('./pause.store.ts');
const { storeAdmission } = await import('../runtime-client.ts');

/** Whether `fn` refuses with exit 2, of `kind`, its message naming each of `facts`: the command its fix names, and who and when. */
function refusedAs(fn: () => unknown, kind: string, ...facts: string[]): void {
  try {
    fn();
  } catch (err) {
    const e = err as Error & { exitCode?: number; _tag?: string };
    assert.equal(e.exitCode, 2);
    assert.equal(e._tag, kind);
    names(e.message, ...facts);
    return;
  }
  assert.fail('expected a refusal');
}

test('the pause on disk: put, read back, refused, lifted, read when it does not parse, and a cordon put before the switch', async (t) => {
  await t.test('a pause is put once, read back, refused while it stands, and lifted once', () => {
    assert.equal(readPause(rootNow()), null);
    const put = putPause(rootNow(), { why: 'merging by hand', by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'));
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' });
    assert.equal(pauseFile(rootNow()), path.join(ROOT, 'cordon'));
    assert.deepEqual(readPause(rootNow()), put);
    refusedAs(
      () => putPause(rootNow(), { by: 'bob' }),
      'Conflict',
      'already paused',
      'ann',
      '2026-10-04T12:00:00.000Z',
      'nemia resume',
      'nemia pause --now',
    );
    assert.deepEqual(readPause(rootNow()), put);
    assert.deepEqual(resumePause(rootNow()), put);
    assert.equal(readPause(rootNow()), null);
    refusedAs(() => resumePause(rootNow()), 'Missing', 'not paused', 'nemia pause');
  });
  await t.test('a pause put with no name is put by the machine user, and with no words has no why', () => {
    const put = putPause(rootNow(), {});
    assert.equal(typeof put.by, 'string');
    assert.ok(put.by.length > 0);
    assert.equal('why' in put, false);
    resumePause(rootNow());
  });
  await t.test('a pause file that does not read as one still pauses the store, its fields empty', () => {
    for (const text of ['not json', '[1, 2]', '{"at": 3, "by": ["x"]}']) {
      fs.writeFileSync(pauseFile(rootNow()), text);
      assert.deepEqual(readPause(rootNow()), { at: '', by: '' }, text);
      assert.deepEqual(resumePause(rootNow()), { at: '', by: '' });
    }
  });
  await t.test('a cordon put before the switch is the pause: read, refused a second, unschedulable to the runtime, and resumed', () => {
    const cordon = { at: '2026-10-03T08:00:00.000Z', by: 'ann', why: 'merging by hand' };
    fs.writeFileSync(path.join(ROOT, 'cordon'), `${JSON.stringify(cordon)}\n`);
    assert.deepEqual(readPause(rootNow()), cordon);
    assert.equal(storeAdmission(rootNow(), settingsOf(process.env)).unschedulable(), true, 'the runtime admits nothing under it');
    refusedAs(
      () => putPause(rootNow(), { by: 'bob' }),
      'Conflict',
      'already paused',
      'ann',
      cordon.at,
      'nemia resume',
      'nemia pause --now',
    );
    assert.deepEqual(resumePause(rootNow()), cordon);
    assert.equal(fs.existsSync(path.join(ROOT, 'cordon')), false, 'nemia resume removes it');
    assert.equal(storeAdmission(rootNow(), settingsOf(process.env)).unschedulable(), false);
  });
  await t.test('a pause put with a timeout keeps it on its file; an old file of `{at, by}` has none', () => {
    const put = putPause(rootNow(), { by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'), 900_000);
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', timeoutMs: 900_000 });
    assert.deepEqual(readPause(rootNow()), put);
    resumePause(rootNow());
    fs.writeFileSync(pauseFile(rootNow()), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann' })}\n`);
    assert.deepEqual(readPause(rootNow()), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'no timeout: the pause parks nothing');
    fs.writeFileSync(pauseFile(rootNow()), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann', timeoutMs: 'ten' })}\n`);
    assert.deepEqual(
      readPause(rootNow()),
      { at: '2026-10-03T08:00:00.000Z', by: 'ann' },
      'a timeout that is no count of milliseconds is none',
    );
    resumePause(rootNow());
  });
  await t.test('cutPause sets the timeout to 0, keeping when, by whom and why; with no pause it is refused', () => {
    putPause(rootNow(), { by: 'ann', why: 'the bill' }, new Date('2026-10-04T12:00:00.000Z'), 600_000);
    assert.deepEqual(cutPause(rootNow()), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    assert.deepEqual(readPause(rootNow()), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    resumePause(rootNow());
    refusedAs(() => cutPause(rootNow()), 'Missing', 'nemia pause');
  });
});
