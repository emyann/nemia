/**
 * Whether a process is there (`alive`), asked of the real process table: this one is, and a child that has exited and been reaped is
 * not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { alive } from './alive.store.ts';

test('this process is alive', () => {
  assert.equal(alive(process.pid), true);
});

test('a child that has exited and been reaped is not alive', () => {
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.equal(alive(child.pid), false);
});
