/**
 * The store's pause on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the pause still pauses; and a cordon `nemia cordon` put before the switch, at the same `WF_ROOT/cordon`, is the
 * pause, honoured by every reader and resumed by `nemia resume`. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-pause-store-');
process.env.WF_ROOT = ROOT;
const { cutPause, liftLapsedPause, pauseFile, readPauseFile, resumePause, putPause, readPause } = await import('./pause.store.ts');
const { identify, thisProcess } = await import('../daemon/daemon.store.ts');
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
  await t.test('a pause put with a timeout keeps it on its file; an old file of `{at, by}` has none', () => {
    const put = putPause({ by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'), 900_000);
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', timeoutMs: 900_000 });
    assert.deepEqual(readPause(), put);
    resumePause();
    fs.writeFileSync(pauseFile(), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann' })}\n`);
    assert.deepEqual(readPause(), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'no timeout: the pause parks nothing');
    fs.writeFileSync(pauseFile(), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann', timeoutMs: 'ten' })}\n`);
    assert.deepEqual(readPause(), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'a timeout that is no count of milliseconds is none');
    resumePause();
  });
  await t.test('cutPause sets the timeout to 0, keeping when, by whom and why; with no pause it is refused', () => {
    putPause({ by: 'ann', why: 'the bill' }, new Date('2026-10-04T12:00:00.000Z'), 600_000);
    assert.deepEqual(cutPause(), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    assert.deepEqual(readPause(), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    resumePause();
    refusedAs(() => cutPause(), 'Missing', 'nemia pause');
  });
});

/** The pid of a process spawned and waited to its exit: one the process table says is gone. */
const gonePid = (): number => {
  const { pid } = spawnSync(process.execPath, ['-e', '']);
  assert.ok(pid, 'a child was spawned and has exited');
  return pid;
};

test("a take-over's pause names its process, and the pass lifts it once that process is gone, never a person's", async (t) => {
  const AT = new Date('2026-11-05T12:30:00.000Z');
  await t.test('a holder is written to the file and kept off the pause the store serves', () => {
    const put = putPause({ by: 'nemia service restart' }, AT, undefined, thisProcess());
    assert.deepEqual(put, { at: AT.toISOString(), by: 'nemia service restart' });
    assert.deepEqual(readPause(), put, 'the served pause carries no holder');
    assert.equal(readPauseFile()?.heldBy?.pid, process.pid);
    cutPause();
    assert.equal(readPauseFile()?.heldBy?.pid, process.pid, 'nemia pause --now keeps who holds the pause');
    resumePause();
  });
  const rows: { name: string; heldBy?: unknown; lifted: boolean }[] = [
    { name: 'held by a process gone since: lifted', heldBy: { pid: gonePid() }, lifted: true },
    { name: 'held by a pid another process took since: lifted', heldBy: { pid: process.pid, procStart: -1 }, lifted: true },
    { name: 'held by a process that runs: kept', heldBy: thisProcess(), lifted: false },
    { name: "a person's, holding no process: kept", lifted: false },
    { name: 'a holder that does not read: kept, as a pause that stands', heldBy: { pid: 'twelve' }, lifted: false },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const pause = { at: AT.toISOString(), by: 'nemia service restart' };
      fs.writeFileSync(pauseFile(), `${JSON.stringify(row.heldBy === undefined ? pause : { ...pause, heldBy: row.heldBy })}\n`);
      const lifted = liftLapsedPause(identify);
      assert.equal(lifted !== null, row.lifted);
      assert.equal(readPause() === null, row.lifted, 'the file is gone exactly when the pause was lifted');
      if (!row.lifted) resumePause();
    });
  await t.test('a pause put again between the judging and the lift stands', () => {
    putPause({ by: 'nemia service restart' }, AT, undefined, { pid: gonePid() });
    const lifted = liftLapsedPause((holder) => {
      fs.writeFileSync(pauseFile(), `${JSON.stringify({ at: AT.toISOString(), by: 'ann' })}\n`);
      return identify(holder);
    });
    assert.equal(lifted, null);
    assert.equal(readPause()?.by, 'ann');
    resumePause();
  });
});
