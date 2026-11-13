/**
 * `processesNow` and `endProcesses`, the runtime's reads of this user's processes and their end by pid and start. A boundary test: the
 * processes of the machine, their working folders and their environments are its whole subject.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { alive } from './alive.ts';
import { endProcesses, processesNow } from './processes.ts';

/** A `node` child that waits, in `cwd`, with `env` beside the parent's; killed when the test ends. */
const waiting = (cwd: string, env: Record<string, string>): ChildProcess => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
  return child;
};

/** Waits until `child` is gone, as `exit` says. */
const exited = (child: ChildProcess): Promise<void> =>
  child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((done) => child.once('exit', () => done()));

test('processesNow reads this user processes with the variables asked for, and endProcesses ends one only while its start matches', async (t) => {
  const folder = path.join(scratch('ae-processes-'), 'work');
  fs.mkdirSync(folder);
  const child = waiting(folder, { AE_PROCESSES_MARK: 'here', AE_PROCESSES_OTHER: 'unasked' });
  t.after(() => child.kill('SIGKILL'));
  const pid = child.pid;
  assert.equal(typeof pid, 'number', 'the child had a pid');
  if (pid === undefined) return;

  await t.test('a child is listed with the variable asked for, its name and its working folder, and nothing unasked', () => {
    const read = processesNow(['AE_PROCESSES_MARK']).find((p) => p.pid === pid);
    assert.ok(read, 'the child is listed');
    assert.deepEqual(read.env, { AE_PROCESSES_MARK: 'here' });
    assert.equal(read.cwd, fs.realpathSync(folder));
    assert.equal(read.cwdDeleted, false);
    assert.equal(read.name, 'node');
  });

  await t.test('once its folder is removed under it, its working folder is read as deleted, by its old path', () => {
    const before = fs.realpathSync(folder);
    fs.rmSync(folder, { recursive: true });
    const read = processesNow([]).find((p) => p.pid === pid);
    assert.ok(read, 'the child is still listed');
    assert.equal(read.cwd, before);
    assert.equal(read.cwdDeleted, true);
  });

  await t.test('a pid whose start differs from what was read is left alone', () => {
    assert.deepEqual(endProcesses([{ pid, start: 'not-its-start' }], 'SIGKILL'), []);
    assert.equal(alive(pid), true);
  });

  await t.test('a pid whose start matches is signalled, and ends', async () => {
    const read = processesNow([]).find((p) => p.pid === pid);
    assert.ok(read, 'the child is listed');
    assert.deepEqual(endProcesses([read], 'SIGTERM'), [pid]);
    await exited(child);
    assert.equal(child.signalCode, 'SIGTERM');
  });
});
