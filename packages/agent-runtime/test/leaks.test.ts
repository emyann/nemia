/**
 * The guard: a test file leaves no `ae-detached-*` folder and no worker behind, failed or passed. Each fixture under
 * `fixtures/` is run as a test file of its own, in a `node --test` of its own under `timeout`, with a temp directory
 * of its own, which is read after it ends: what the run left in it is what it leaked.
 *
 * A process is found in a root by its environment too: a harness a fake exec'd — `exec sleep 30` — names no root in its
 * arguments and runs elsewhere, and still has the root on its PATH, or in an AE_ROOT it inherited. Until it has exec'd, its
 * environment is its parent's, so the test waits for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { leftBehind, reap, runningIn, scratch } from './scratch.ts';
import { until, WAITED } from '../src/waits/index.ts';

const PACKAGE = path.join(import.meta.dirname, '..');

/**
 * Runs `fixture` as a test file with `TMPDIR` its own, bounded: its status, what it printed, and the directory. The child runs
 * without `NODE_TEST_CONTEXT`: a `node --test` under another reports to it instead of running, unless it is told it is on its own.
 */
const run = (fixture: string) => {
  const tmp = scratch('ae-leaks-');
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const r = spawnSync('timeout', ['-k', '5', '90', process.execPath, '--test', path.join('test', 'fixtures', fixture)], {
    cwd: PACKAGE,
    env: { ...env, TMPDIR: tmp },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, tmp };
};

/** The roots a run left in `tmp`, each made removable again so this file's own `scratch` can take `tmp` away. */
const left = (tmp: string) => {
  const roots = fs.readdirSync(tmp).filter((e) => e.startsWith('ae-detached-'));
  for (const r of roots) execFileSync('chmod', ['-R', 'u+rwx', path.join(tmp, r)]);
  return roots;
};

test('a test file that fails with its workers running leaves no folder and no process behind', () => {
  const { status, out, tmp } = run('leak-failing.ts');
  assert.notEqual(status, 124, `the fixture ran out its time:\n${out}`);
  assert.notEqual(status, 0, 'its tests fail');
  assert.match(out, /failed with its worker running/);
  assert.doesNotMatch(out, /scratch: the file left/, 'nothing was left for the last hook to find');
  const left = leftBehind(tmp);
  assert.deepEqual(left.entries, [], 'no folder left');
  assert.deepEqual(
    left.processes.map((p) => p.args),
    [],
    'no process left',
  );
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

test('REFUSED: a test file that leaves a root scratch cannot remove fails, and names it', (t) => {
  if (process.getuid?.() === 0) return t.skip('run as root, which removes any folder');
  const { status, out, tmp } = run('leak-kept.ts');
  const kept = left(tmp);
  assert.notEqual(status, 124, `the fixture ran out its time:\n${out}`);
  assert.equal(kept.length, 1, 'its root kept');
  assert.notEqual(status, 0, `its test passes, and the file fails:\n${out}`);
  assert.match(out, /scratch: the file left 0 process\(es\) and 1 root\(s\) behind/);
  assert.ok(out.includes(path.join(tmp, kept[0])), 'the root it left named');
});

test('a process whose only tie to a root is its environment is found in it, and reaped', WAITED, async (t) => {
  const tmp = scratch('ae-leaks-');
  const child = spawn('sleep', ['30'], {
    cwd: '/',
    env: { ...process.env, PATH: `${tmp}${path.delimiter}${process.env.PATH}` },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await until(t, () => runningIn([tmp]).length > 0, `sleep (pid ${child.pid}) found running in ${tmp}`, { everyMs: 25 });
  assert.deepEqual(
    runningIn([tmp]).map((p) => p.pid),
    [child.pid],
  );
  assert.deepEqual(await reap([tmp]), []);
});
