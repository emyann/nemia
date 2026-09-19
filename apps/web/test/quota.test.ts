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

test('the hover says where the reading came from and by what rule it is shown, and with nothing to show as now, the last answer', () => {
  const windows = [win(), win({ key: 'seven_day', label: 'week', usedPercentage: 71 })];
  const fresh: Quota = {
    state: 'fresh', askedAt: '2026-09-19T09:58:00Z', ageMs: 120_000, subscription: 'max', windows, last: null, keepMs: 180_000, markAt: 80, said: null,
  };
  assert.equal(
    quotaTitle(fresh, NOW, 'UTC'),
    'Asked of Claude Code (get_usage, max plan) at 09:58; asked again at most every 3 min while a board is open. A window 80% used or more is marked.',
  );
  const failed: Quota = {
    ...fresh, state: 'timeout', askedAt: '2026-09-19T09:59:00Z', subscription: null, windows: [], said: 'late',
    last: { askedAt: '2026-09-19T09:40:00Z', windows },
  };
  assert.equal(
    quotaTitle(failed, NOW, 'UTC'),
    'Asked of Claude Code (get_usage); asked again at most every 3 min while a board is open. A window 80% used or more is marked. Last answer, at 09:40: 5-hour 38%, week 71%.',
  );
  assert.match(quotaTitle({ ...failed, keepMs: 0, last: null }, NOW, 'UTC'), /^Asked of Claude Code \(get_usage\); asked again on every read\. A window 80% used or more is marked\.$/);
  assert.match(quotaTitle({ ...fresh, keepMs: 90_000 }, NOW, 'UTC'), /at most every 90 s /);
});
