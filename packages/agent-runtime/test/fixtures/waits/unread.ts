/**
 * A test whose wait is handed a waiter with no signal to read: what `test/waits.test.ts` runs in a child, to see its process end on its
 * own once the wait has failed, holding no timer open.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { until, type Waiter } from '../../../src/waits/index.ts';

/** A waiter whose signal throws when read, as a function handed in its place does. */
const unread: Waiter = {
  get signal(): AbortSignal {
    throw new Error('no signal to read');
  },
  diagnostic: () => undefined,
};

test('a wait whose waiter has no signal to read fails at once', async () => {
  const err = await until(unread, () => false, 'the bell that never rings').then(
    () => undefined,
    (e: unknown) => e,
  );
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'no signal to read');
});
