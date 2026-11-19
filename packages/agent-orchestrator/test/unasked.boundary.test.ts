/**
 * `heldUnasked` at a file's head, on a real run of the test runner, a Vitest of its own: a fixture file whose one test files on the engine
 * it holds unasked (`test/fixtures/unasked/filed.ts`) is run as a child, and fails after that test, in the words of `unasked`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runnerless, vitestOver } from 'test-kit/probe';
import { suiteOf } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';

const PACKAGE = path.join(import.meta.dirname, '..');

test('REFUSED: a test file that holds its engine unasked, and whose test files on it, fails after that test', () => {
  const fixture = path.join('test', 'fixtures', 'unasked', 'filed.ts');
  const over = vitestOver(scratch('wf-unasked-'), PACKAGE, [fixture], suiteOf(PACKAGE)?.setupFiles ?? []);
  const ran = spawnSync(process.execPath, over, {
    cwd: PACKAGE,
    env: runnerless(process.env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = ran.stdout + ran.stderr;
  assert.equal(ran.status, 1, out);
  assert.match(out, /none of them files on, stops, says to or forgets from: one did/);
  assert.match(out, /Test Files\s+1 failed \(1\)/);
});
