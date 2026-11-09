/**
 * A take-over's pause on disk against the real process table: the holder it names (`heldBy`) written and kept off the served pause, and
 * `liftLapsedPause` judging that holder by what `/proc` and a signal 0 say of it — a child spawned and waited to its exit for a process
 * gone, this process for one that runs. The process table is this file's whole subject, so it is a boundary test. The rest of the
 * pause's file is `pause.store.test.ts`'s.
 */
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from 'test-kit/scratch';

const ROOT = scratch('wf-pause-lapse-');
process.env.WF_ROOT = ROOT;
const { cutPause, liftLapsedPause, pauseFile, readPauseFile, resumePause, putPause, readPause } = await import('./pause.store.ts');
const { identify, thisProcess } = await import('../daemon/daemon.store.ts');

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
