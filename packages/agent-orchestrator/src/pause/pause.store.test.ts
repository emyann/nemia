/**
 * The store's pause on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the pause still pauses; and a cordon `nemia cordon` put before the switch, at the same `WF_ROOT/cordon`, is the
 * pause, honoured by every reader and resumed by `nemia resume`. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-pause-store-');
process.env.WF_ROOT = ROOT;
const { pauseFile, resumePause, putPause, readPause } = await import('./pause.store.ts');
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
    assert.equal(readPause(), null);
    const put = putPause({ why: 'merging by hand', by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'));
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' });
    assert.equal(pauseFile(), path.join(ROOT, 'cordon'));
    assert.deepEqual(readPause(), put);
    refusedAs(
      () => putPause({ by: 'bob' }),
      'Conflict',
      'already paused',
      'ann',
      '2026-10-04T12:00:00.000Z',
      'nemia resume',
      'nemia pause --now',
    );
    assert.deepEqual(readPause(), put);
    assert.deepEqual(resumePause(), put);
    assert.equal(readPause(), null);
    refusedAs(() => resumePause(), 'Missing', 'not paused', 'nemia pause');
  });
  await t.test('a pause put with no name is put by the machine user, and with no words has no why', () => {
    const put = putPause({});
    assert.equal(typeof put.by, 'string');
    assert.ok(put.by.length > 0);
    assert.equal('why' in put, false);
    resumePause();
  });
  await t.test('a pause file that does not read as one still pauses the store, its fields empty', () => {
    for (const text of ['not json', '[1, 2]', '{"at": 3, "by": ["x"]}']) {
      fs.writeFileSync(pauseFile(), text);
      assert.deepEqual(readPause(), { at: '', by: '' }, text);
      assert.deepEqual(resumePause(), { at: '', by: '' });
    }
  });
  await t.test('a cordon put before the switch is the pause: read, refused a second, unschedulable to the runtime, and resumed', () => {
    const cordon = { at: '2026-10-03T08:00:00.000Z', by: 'ann', why: 'merging by hand' };
    fs.writeFileSync(path.join(ROOT, 'cordon'), `${JSON.stringify(cordon)}\n`);
    assert.deepEqual(readPause(), cordon);
    assert.equal(storeAdmission().unschedulable(), true, 'the runtime admits nothing under it');
    refusedAs(() => putPause({ by: 'bob' }), 'Conflict', 'already paused', 'ann', cordon.at, 'nemia resume', 'nemia pause --now');
    assert.deepEqual(resumePause(), cordon);
    assert.equal(fs.existsSync(path.join(ROOT, 'cordon')), false, 'nemia resume removes it');
    assert.equal(storeAdmission().unschedulable(), false);
  });
});
