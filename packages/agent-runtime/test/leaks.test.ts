/**
 * The guard: a test file leaves no `ae-detached-*` folder and no worker behind, failed or passed. Each fixture under
 * `fixtures/` is run as a test file of its own, in a `node --test` of its own under `timeout`, with a temp directory
 * of its own, which is read after it ends: what the run left in it is what it leaked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { leftBehind, reap, runningIn, scratch } from './scratch.ts';

const PACKAGE = path.join(import.meta.dirname, '..');

/** Runs `fixture` as a test file with `TMPDIR` its own, bounded: its status, what it printed, and the directory. */
const run = (fixture: string) => {
  const tmp = scratch('ae-leaks-');
  // A child `node --test` under this one reports to it instead of running, unless it is told it is on its own.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const r = spawnSync('timeout', ['-k', '5', '90', process.execPath, '--test', path.join('test', 'fixtures', fixture)], {
    cwd: PACKAGE, env: { ...env, TMPDIR: tmp }, encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, tmp };
};

test('a test file that fails with its workers running leaves no folder and no process behind', () => {
  const { status, out, tmp } = run('leak-failing.ts');
  assert.notEqual(status, 124, `the fixture ran out its time:\n${out}`);
  assert.notEqual(status, 0, 'its tests fail');
  assert.match(out, /failed with its worker running/);
  assert.doesNotMatch(out, /scratch: the file left/, 'nothing was left for the last hook to find');
  const left = leftBehind(tmp);
  assert.deepEqual(left.entries, [], 'no folder left');
  assert.deepEqual(left.processes.map((p) => p.args), [], 'no process left');
});

test('REFUSED: a test file that makes its root by hand and never stops its worker is seen to leave both', async () => {
  const { status, out, tmp } = run('leak-unguarded.ts');
  assert.equal(status, 0, `its test passes:\n${out}`);
  const left = leftBehind(tmp);
  assert.equal(left.entries.filter((e) => e.startsWith('ae-detached-')).length, 1, 'its folder left');
  assert.equal(left.processes.filter((p) => /\bae-worker\.ts\b/.test(p.args)).length, 1, 'its worker left');
  assert.equal(left.processes.length, 2, 'its worker and its harness');
  assert.deepEqual(await reap([tmp]), [], 'and reaped here');
});

test('a process whose only tie to a root is its environment is found in it, and reaped', async () => {
  // A harness exec'd from a fake — `exec sleep 30` — names no root in its arguments and runs elsewhere, and still has
  // the root on its PATH, or in an AE_ROOT it inherited.
  const tmp = scratch('ae-leaks-');
  const child = spawn('sleep', ['30'], { cwd: '/', env: { ...process.env, PATH: `${tmp}${path.delimiter}${process.env.PATH}` }, detached: true, stdio: 'ignore' });
  child.unref();
  // Read once the child has exec'd, under a bound: until then its environment is this process's.
  for (const bound = performance.now() + 10_000; !runningIn([tmp]).length;) {
    if (performance.now() > bound) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.deepEqual(runningIn([tmp]).map((p) => p.pid), [child.pid]);
  assert.deepEqual(await reap([tmp]), []);
});
