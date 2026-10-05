/**
 * The engine `ae` builds (`engineAt`): options the engine refuses reject in the runtime's words, led by `ae`, exit code 2, which `ae`
 * prints as its sentence and exits with.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineAt } from '../src/cli/main.ts';
import { scratch } from './scratch.ts';

test('an engine `ae` cannot build from its options is refused with exit code 2, its message led by `ae`', async () => {
  const err = await engineAt({ root: scratch('ae-engine-at-'), maxConcurrent: 0 }).then(
    () => assert.fail('the options were built into an engine'),
    (e: unknown) => e as Error & { exitCode?: number },
  );
  assert.equal(err.exitCode, 2);
  assert.ok(err.message.startsWith('ae: '), err.message);
  assert.match(err.message, /`maxConcurrent: 0` is not a ceiling/);
});
