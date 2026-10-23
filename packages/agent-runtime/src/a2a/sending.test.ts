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

/** Each row: the send as its entry holds it, the instant it is judged at, and whether its lease still holds. */
const ROWS: Array<{ name: string; entry: Parameters<typeof sendHeld>[0]; now: Instant; held: boolean }> = [
  {
    name: 'within its boot, the wall clock stepped forward an hour: held until `sendMs` on the monotonic clock',
    entry: sent({ boot: 'b-1', ms: 1_000 }),
    now: at(HOUR, 1_000 + SEND_MS - 1),
    held: true,
  },
  {
    name: 'within its boot, the wall clock stepped back an hour: lapsed at its bound on the monotonic clock',
    entry: sent({ boot: 'b-1', ms: 1_000 }),
    now: at(-HOUR, 1_000 + SEND_MS),
    held: false,
  },
  ...[
    ['no monotonic stamp', sent()],
    ['a stamp of another boot', sent({ boot: 'b-0', ms: 1_000 })],
  ].flatMap(
    ([what, entry]) =>
      [
        {
          name: `${what as string}: held on the wall clock under \`sendMs\` from \`sentAt\``,
          entry,
          now: at(SEND_MS - 1, 1_000),
          held: true,
        },
        { name: `${what as string}: lapsed on the wall clock at \`sendMs\` from \`sentAt\``, entry, now: at(SEND_MS, 1_000), held: false },
      ] as Array<{ name: string; entry: Parameters<typeof sendHeld>[0]; now: Instant; held: boolean }>,
  ),
  { name: 'a send answered with a Task holds no lease', entry: sent({ boot: 'b-1', ms: 1_000 }, 't-1'), now: at(0, 1_000), held: false },
  { name: 'a send not under way holds no lease', entry: { sentAt: new Date(T0).toISOString() }, now: at(0, 1_000), held: false },
];

test('sendHeld: a lease on the monotonic clock within its boot, on the wall clock across one, and none once answered', async (t) => {
  for (const row of ROWS) await t.test(row.name, () => assert.equal(sendHeld(row.entry, row.now, SEND_MS), row.held));
});
