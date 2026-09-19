/**
 * The quota's words over the Factory (src/lib/quota.ts): a reset in the person's own time zone, the age of a reading, and a window marked or
 * reset since. `npm run e2e` looks at the header itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Quota, QuotaWindow } from '../src/lib/api.ts';
import { agoWord, clockWord, quotaTitle, windowWords } from '../src/lib/quota.ts';

const NOW = new Date('2026-09-19T10:00:00.000Z');
const win = (over: Partial<QuotaWindow> = {}): QuotaWindow => ({
  key: 'five_hour', label: '5-hour', usedPercentage: 38.4, resetsAt: '2026-09-19T12:30:00.000Z', reset: false, marked: false, ...over,
});

test("a reset is said in the person's own time zone: the time on the same day, the weekday before it on another", () => {
  assert.equal(clockWord(new Date('2026-09-19T12:30:00Z'), NOW, 'UTC'), '12:30');
  assert.equal(clockWord(new Date('2026-09-19T12:30:00Z'), NOW, 'Asia/Tokyo'), '21:30');
  // Tuesday in UTC, and still Monday in New York.
  assert.equal(clockWord(new Date('2026-09-22T02:00:00Z'), NOW, 'UTC'), 'Tue 02:00');
  assert.equal(clockWord(new Date('2026-09-22T02:00:00Z'), NOW, 'America/New_York'), 'Mon 22:00');
  // The same instant is today in one zone and tomorrow in another.
  assert.equal(clockWord(new Date('2026-09-19T20:00:00Z'), NOW, 'UTC'), '20:00');
  assert.equal(clockWord(new Date('2026-09-19T20:00:00Z'), NOW, 'Asia/Tokyo'), 'Sun 05:00');
});

test('the age of a reading', () => {
  assert.equal(agoWord(20_000), 'just now');
  assert.equal(agoWord(4 * 60_000), '4 min ago');
  assert.equal(agoWord(120 * 60_000), '2 h ago');
  assert.equal(agoWord(125 * 60_000), '2 h 5 min ago');
  assert.equal(agoWord(3 * 86_400_000), '3 d ago');
  assert.equal(agoWord(-5_000), 'just now', 'a clock behind the writer’s reads as now, not as the future');
});

test('a window: its percentage rounded, when it resets, marked past the mark — and, reset since the reading, said so and not marked', () => {
  assert.deepEqual(windowWords(win(), NOW, 'UTC'), { key: 'five_hour', label: '5-hour', used: '38%', resets: 'resets 12:30', marked: false });
  assert.equal(windowWords(win({ usedPercentage: 86, marked: true }), NOW, 'UTC').marked, true);
  const reset = windowWords(win({ usedPercentage: 91, marked: true, reset: true, resetsAt: '2026-09-19T09:00:00Z' }), NOW, 'UTC');
  assert.equal(reset.resets, 'reset 09:00, not read since');
  assert.equal(reset.marked, false, 'a window begun again is not the number it was');
  assert.equal(windowWords(win({ resetsAt: null }), NOW, 'UTC').resets, null);
});

test('the hover says where the reading came from and by what rule it is shown, and a stale one what it last said', () => {
  const q: Quota = {
    state: 'stale', file: '/store/quota.json', writtenAt: '2026-09-19T01:00:00Z', ageMs: 9 * 3_600_000, version: '2.1.278',
    windows: [win(), win({ key: 'seven_day', label: 'week', usedPercentage: 71 })], staleAfterMs: 5 * 3_600_000, markAt: 80, said: 'old',
  };
  assert.equal(
    quotaTitle(q, NOW, 'UTC'),
    "Read by Claude Code 2.1.278's statusline at 01:00, into /store/quota.json. The numbers are as fresh as your last turn in an interactive claude session; past 5 h they are not shown, and a window 80% used or more is marked. Last read: 5-hour 38%, week 71%.",
  );
});
