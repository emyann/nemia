/**
 * The store's pause on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the pause still pauses; and a cordon `nemia cordon` put before the switch, at the same `WF_ROOT/cordon`, is the
 * pause, honoured by every reader and resumed by `nemia resume`. On a store of its own at `ROOT`, given as `ENV`.
 */
import { type Env, settingsOf } from '../config/config.store.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import { cutPause, pauseFile, resumePause, putPause, readPause } from './pause.store.ts';
import { storeAdmission } from '../runtime-client.ts';

const ROOT = scratch('wf-pause-store-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

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
    assert.equal(readPause(ROOT), null);
    const put = putPause(ROOT, { why: 'merging by hand', by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'));
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' });
    assert.equal(pauseFile(ROOT), path.join(ROOT, 'cordon'));
    assert.deepEqual(readPause(ROOT), put);
    refusedAs(
      () => putPause(ROOT, { by: 'bob' }),
      'Conflict',
      'already paused',
      'ann',
      '2026-10-04T12:00:00.000Z',
      'nemia resume',
      'nemia pause --now',
    );
    assert.deepEqual(readPause(ROOT), put);
    assert.deepEqual(resumePause(ROOT), put);
    assert.equal(readPause(ROOT), null);
    refusedAs(() => resumePause(ROOT), 'Missing', 'not paused', 'nemia pause');
  });
  await t.test('a pause put with no name is put by the machine user, and with no words has no why', () => {
    const put = putPause(ROOT, {});
    assert.equal(typeof put.by, 'string');
    assert.ok(put.by.length > 0);
    assert.equal('why' in put, false);
    resumePause(ROOT);
  });
  await t.test('a pause file that does not read as one still pauses the store, its fields empty', () => {
    for (const text of ['not json', '[1, 2]', '{"at": 3, "by": ["x"]}']) {
      fs.writeFileSync(pauseFile(ROOT), text);
      assert.deepEqual(readPause(ROOT), { at: '', by: '' }, text);
      assert.deepEqual(resumePause(ROOT), { at: '', by: '' });
    }
  });
  await t.test('a cordon put before the switch is the pause: read, refused a second, unschedulable to the runtime, and resumed', () => {
    const cordon = { at: '2026-10-03T08:00:00.000Z', by: 'ann', why: 'merging by hand' };
    fs.writeFileSync(path.join(ROOT, 'cordon'), `${JSON.stringify(cordon)}\n`);
    assert.deepEqual(readPause(ROOT), cordon);
    assert.equal(storeAdmission(ROOT, settingsOf(ENV)).unschedulable(), true, 'the runtime admits nothing under it');
    refusedAs(() => putPause(ROOT, { by: 'bob' }), 'Conflict', 'already paused', 'ann', cordon.at, 'nemia resume', 'nemia pause --now');
    assert.deepEqual(resumePause(ROOT), cordon);
    assert.equal(fs.existsSync(path.join(ROOT, 'cordon')), false, 'nemia resume removes it');
    assert.equal(storeAdmission(ROOT, settingsOf(ENV)).unschedulable(), false);
  });
  await t.test('a pause put with a timeout keeps it on its file; an old file of `{at, by}` has none', () => {
    const put = putPause(ROOT, { by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'), 900_000);
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', timeoutMs: 900_000 });
    assert.deepEqual(readPause(ROOT), put);
    resumePause(ROOT);
    fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann' })}\n`);
    assert.deepEqual(readPause(ROOT), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'no timeout: the pause parks nothing');
    fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann', timeoutMs: 'ten' })}\n`);
    assert.deepEqual(readPause(ROOT), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'a timeout that is no count of milliseconds is none');
    resumePause(ROOT);
  });
  await t.test('cutPause sets the timeout to 0, keeping when, by whom and why; with no pause it is refused', () => {
    putPause(ROOT, { by: 'ann', why: 'the bill' }, new Date('2026-10-04T12:00:00.000Z'), 600_000);
    assert.deepEqual(cutPause(ROOT), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    assert.deepEqual(readPause(ROOT), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    resumePause(ROOT);
    refusedAs(() => cutPause(ROOT), 'Missing', 'nemia pause');
  });
});
