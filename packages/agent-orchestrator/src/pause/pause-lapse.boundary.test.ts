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
import { cutPause, liftLapsedPause, pauseFile, readPauseFile, resumePause, putPause, readPause } from './pause.store.ts';
import { identify, thisProcess } from '../daemon/daemon.store.ts';

const ROOT = scratch('wf-pause-lapse-');

/** The pid of a process spawned and waited to its exit: one the process table says is gone. */
const gonePid = (): number => {
  const { pid } = spawnSync(process.execPath, ['-e', '']);
  assert.ok(pid, 'a child was spawned and has exited');
  return pid;
};

test("a take-over's pause names its process, and the pass lifts it once that process is gone, never a person's", async (t) => {
  const AT = new Date('2026-11-05T12:30:00.000Z');
  await t.test('a holder is written to the file and kept off the pause the store serves', () => {
    const put = putPause(ROOT, { by: 'nemia service restart' }, AT, undefined, thisProcess());
    assert.deepEqual(put, { at: AT.toISOString(), by: 'nemia service restart' });
    assert.deepEqual(readPause(ROOT), put, 'the served pause carries no holder');
    assert.equal(readPauseFile(ROOT)?.heldBy?.pid, process.pid);
    cutPause(ROOT);
    assert.equal(readPauseFile(ROOT)?.heldBy?.pid, process.pid, 'nemia pause --now keeps who holds the pause');
    resumePause(ROOT);
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
      fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify(row.heldBy === undefined ? pause : { ...pause, heldBy: row.heldBy })}\n`);
      const lifted = liftLapsedPause(ROOT, identify);
      assert.equal(lifted !== null, row.lifted);
      assert.equal(readPause(ROOT) === null, row.lifted, 'the file is gone exactly when the pause was lifted');
      if (!row.lifted) resumePause(ROOT);
    });
  await t.test('a pause put again between the judging and the lift stands', () => {
    putPause(ROOT, { by: 'nemia service restart' }, AT, undefined, { pid: gonePid() });
    const lifted = liftLapsedPause(ROOT, (holder) => {
      fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: AT.toISOString(), by: 'ann' })}\n`);
      return identify(holder);
    });
    assert.equal(lifted, null);
    assert.equal(readPause(ROOT)?.by, 'ann');
    resumePause(ROOT);
  });
});
