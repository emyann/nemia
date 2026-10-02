/** `elapsedMs`: the monotonic clock answers within a boot, the wall clock across one or where a reading has none. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMs, type Instant } from './clock.ts';

const T0 = Date.parse('2026-10-02T12:00:00Z');
const read = (wallMs: number, monoMs?: number, boot = 'b-1'): Instant => ({
  at: T0 + wallMs,
  ...(monoMs !== undefined ? { mono: { boot, ms: monoMs } } : {}),
});

test('within one boot, the time elapsed is the monotonic clock’s, whichever way the wall clock stepped', () => {
  assert.equal(elapsedMs(read(0, 1_000), read(60_000, 6_000)), 5_000, 'a wall clock stepped forward');
  assert.equal(elapsedMs(read(0, 1_000), read(-60_000, 6_000)), 5_000, 'a wall clock stepped back');
});

test('across two boots, or with a reading missing on either side, the time elapsed is the wall clock’s', () => {
  assert.equal(elapsedMs(read(0, 1_000, 'b-1'), read(60_000, 6_000, 'b-2')), 60_000, 'another boot');
  assert.equal(elapsedMs(read(0), read(60_000, 6_000)), 60_000, 'none at the start');
  assert.equal(elapsedMs(read(0, 1_000), read(60_000)), 60_000, 'none at the end');
});
