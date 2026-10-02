/** `sendHeld`: a send's lease, on the monotonic clock within its boot and on the wall clock from `sentAt` otherwise. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Instant } from '../core/clock.ts';
import { sendHeld } from './sending.ts';

const SEND_MS = 15 * 60_000;
const T0 = Date.parse('2026-10-02T12:00:00Z');
const HOUR = 3_600_000;
const sent = (mono?: { boot: string; ms: number }, taskId?: string) => ({
  sentAt: new Date(T0).toISOString(),
  ...(taskId ? { taskId } : {}),
  sending: mono ? { mono } : {},
});
const at = (wallMs: number, monoMs?: number, boot = 'b-1'): Instant => ({
  at: T0 + wallMs,
  ...(monoMs !== undefined ? { mono: { boot, ms: monoMs } } : {}),
});

test('within its boot, a send holds its lease for `sendMs` on the monotonic clock, whichever way the wall clock stepped', () => {
  const e = sent({ boot: 'b-1', ms: 1_000 });
  assert.equal(sendHeld(e, at(HOUR, 1_000 + SEND_MS - 1), SEND_MS), true, 'the wall clock stepped forward an hour: still held');
  assert.equal(sendHeld(e, at(-HOUR, 1_000 + SEND_MS), SEND_MS), false, 'the wall clock stepped back an hour: lapsed at its bound');
});

test('a send with no monotonic stamp, or one of another boot, is judged on the wall clock from `sentAt`', () => {
  for (const e of [sent(), sent({ boot: 'b-0', ms: 1_000 })]) {
    assert.equal(sendHeld(e, at(SEND_MS - 1, 1_000), SEND_MS), true);
    assert.equal(sendHeld(e, at(SEND_MS, 1_000), SEND_MS), false);
  }
});

test('a send answered with a Task, or not under way, holds no lease', () => {
  assert.equal(sendHeld(sent({ boot: 'b-1', ms: 1_000 }, 't-1'), at(0, 1_000), SEND_MS), false);
  assert.equal(sendHeld({ sentAt: new Date(T0).toISOString() }, at(0, 1_000), SEND_MS), false);
});
