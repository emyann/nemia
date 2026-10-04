/**
 * The store's cordon on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the cordon still cordons. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-cordon-store-');
process.env.WF_ROOT = ROOT;
const { cordonFile, liftCordon, putCordon, readCordon } = await import('./cordon.store.ts');

/** Whether `fn` refuses with exit 2, of `kind`, in exactly `message`. */
function refusedAs(fn: () => unknown, kind: string, message: string): void {
  try {
    fn();
  } catch (err) {
    const e = err as Error & { exitCode?: number; _tag?: string };
    assert.equal(e.exitCode, 2);
    assert.equal(e._tag, kind);
    assert.equal(e.message, message);
    return;
  }
  assert.fail('expected a refusal');
}

test('a cordon is put once, read back, refused while it stands, and lifted once', () => {
  assert.equal(readCordon(), null);
  const put = putCordon({ why: 'merging by hand', by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'));
  assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' });
  assert.equal(cordonFile(), path.join(ROOT, 'cordon'));
  assert.deepEqual(readCordon(), put);
  refusedAs(
    () => putCordon({ by: 'bob' }),
    'Conflict',
    'the store is already cordoned by ann since 2026-10-04T12:00:00.000Z: wf uncordon lifts it first.',
  );
  assert.deepEqual(readCordon(), put);
  assert.deepEqual(liftCordon(), put);
  assert.equal(readCordon(), null);
  refusedAs(() => liftCordon(), 'Missing', 'the store is not cordoned: there is nothing to lift (wf cordon puts one).');
});

test('a cordon put with no name is put by the machine user, and with no words has no why', () => {
  const put = putCordon({});
  assert.equal(typeof put.by, 'string');
  assert.ok(put.by.length > 0);
  assert.equal('why' in put, false);
  liftCordon();
});

test('a cordon file that does not read as one still cordons the store, its fields empty', () => {
  for (const text of ['not json', '[1, 2]', '{"at": 3, "by": ["x"]}']) {
    fs.writeFileSync(cordonFile(), text);
    assert.deepEqual(readCordon(), { at: '', by: '' }, text);
    assert.deepEqual(liftCordon(), { at: '', by: '' });
  }
});
