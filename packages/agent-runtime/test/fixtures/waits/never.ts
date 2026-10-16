/**
 * A test whose wait never comes, under a timeout of 50ms: what `test/waits.test.ts` runs in a child, to read what the runner says of it.
 */
import { test } from 'node:test';
import { until } from '../../../src/waits/index.ts';

test('a wait that never comes', { timeout: 50 }, async (t) => {
  await until(t, () => false, 'the bell that never rings');
});
