/**
 * `alive(pid)`, the runtime's one reading of whether a process is there: signal 0 reaches it, or it is another user's. A boundary
 * test: the processes of the machine are its whole subject.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { alive } from './alive.ts';

describe('alive reads a process by signal 0: this one is there, a reaped child is not, and one this user may not signal is', () => {
  test('this process is alive', () => {
    assert.equal(alive(process.pid), true);
  });
  test('a child that ran, ended and was reaped is not alive', () => {
    const ran = spawnSync(process.execPath, ['-e', '']);
    assert.equal(ran.status, 0, 'the child ran to its end');
    assert.equal(typeof ran.pid, 'number', 'the child had a pid');
    assert.equal(alive(ran.pid), false);
  });
  test('pid 1, which signal 0 answers EPERM when this user is not root, is alive', () => {
    assert.equal(alive(1), true);
  });
});
