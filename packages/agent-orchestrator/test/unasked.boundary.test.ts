/**
 * `heldUnasked` at a file's head, on a real run of the test runner: a fixture file whose one test files on the engine it holds unasked
 * (`test/fixtures/unasked/filed.ts`) is run as a child, and fails after that test, in the words of `unasked`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('REFUSED: a test file that holds its engine unasked, and whose test files on it, fails after that test', () => {
  const fixture = path.join(import.meta.dirname, 'fixtures', 'unasked', 'filed.ts');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
  const ran = spawnSync(process.execPath, ['--test-reporter=spec', fixture], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(ran.status, 1, ran.stdout + ran.stderr);
  assert.match(ran.stdout, /none of them files on, stops, says to or forgets from: one did/);
  assert.match(ran.stdout, /fail 1\b/);
});
