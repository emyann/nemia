/**
 * The daemon's memory, recorded (`memoryWatched`): after one reading each gauge of `MEMORY` holds the process's figure, the heap used
 * within what is committed, and what is committed within the limit.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Metric } from 'effect';
import { MEMORY, memoryWatched } from './memory.store.ts';

test('after one reading each gauge holds a figure of the process, the heap used within what is committed and within the limit', async () => {
  const read = await Effect.runPromise(
    memoryWatched(Effect.sleep(50), 60_000).pipe(
      Effect.andThen(Effect.all(Object.fromEntries(Object.entries(MEMORY).map(([key, gauge]) => [key, Metric.value(gauge)])))),
      Effect.scoped,
    ),
  );
  const bytes = Object.fromEntries(Object.entries(read).map(([key, state]) => [key, Number(state.value)]));
  for (const [key, value] of Object.entries(bytes)) assert.ok(value > 0, `${key} was recorded`);
  assert.ok(bytes.heapUsed <= bytes.heapCommitted, 'the heap used is within what is committed');
  assert.ok(bytes.heapCommitted < bytes.heapLimit, 'what is committed is within the limit');
  assert.ok(bytes.heapUsed < bytes.resident, 'the resident size holds the heap used');
});
