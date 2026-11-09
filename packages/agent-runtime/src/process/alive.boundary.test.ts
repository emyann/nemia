/**
 * `alive(pid)`, the runtime's one reading of whether a process is there: signal 0 reaches it, or it is another user's. A boundary
 * test: the processes of the machine are its whole subject.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { alive } from './alive.ts';

test('alive reads a process by signal 0: this one is there, a reaped child is not, and one this user may not signal is', async (t) => {
  await t.test('this process is alive', () => {
    assert.equal(alive(process.pid), true);
  });
  await t.test('a child that ran, ended and was reaped is not alive', () => {
    const ran = spawnSync(process.execPath, ['-e', '']);
    assert.equal(ran.status, 0, 'the child ran to its end');
    assert.equal(typeof ran.pid, 'number', 'the child had a pid');
    assert.equal(alive(ran.pid), false);
  });
  await t.test('pid 1, which signal 0 answers EPERM when this user is not root, is alive', () => {
    assert.equal(alive(1), true);
  });
});
