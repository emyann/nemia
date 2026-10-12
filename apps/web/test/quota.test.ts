/**
 * The quota's words over the Factory (src/lib/quota.ts): a reset in the person's own time zone, the age of a reading, and a window marked
 * or reset since. `npm run e2e` looks at the header itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Quota, QuotaWindow } from '../src/lib/api.ts';
import { agoWord, clockWord, lastWords, quotaTitle, windowWords } from '../src/lib/quota.ts';

const NOW = new Date('2026-09-19T10:00:00.000Z');
const win = (over: Partial<QuotaWindow> = {}): QuotaWindow => ({
  key: 'five_hour',
  label: '5-hour',
  usedPercentage: 38.4,
  resetsAt: '2026-09-19T12:30:00.000Z',
  reset: false,
  marked: false,
  ...over,
});

test("a reset is said in the person's own time zone: the time on the same day, the weekday before it on another", () => {
  assert.equal(clockWord(new Date('2026-09-19T12:30:00Z'), NOW, 'UTC'), '12:30 PM');
  assert.equal(clockWord(new Date('2026-09-19T12:30:00Z'), NOW, 'Asia/Tokyo'), '9:30 PM');
  assert.equal(clockWord(new Date('2026-09-22T02:00:00Z'), NOW, 'UTC'), 'Tue 2:00 AM', 'Tuesday in UTC');
  assert.equal(clockWord(new Date('2026-09-22T02:00:00Z'), NOW, 'America/New_York'), 'Mon 10:00 PM', 'still Monday in New York');
  assert.equal(clockWord(new Date('2026-09-19T20:00:00Z'), NOW, 'UTC'), '8:00 PM', 'the same instant is today in one zone');
  assert.equal(clockWord(new Date('2026-09-19T20:00:00Z'), NOW, 'Asia/Tokyo'), 'Sun 5:00 AM', 'and tomorrow in another');
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
  assert.deepEqual(windowWords(win(), NOW, 'UTC'), {
    key: 'five_hour',
    label: '5-hour',
    used: '38%',
    resets: 'resets 12:30 PM',
    marked: false,
  });
  assert.equal(windowWords(win({ usedPercentage: 86, marked: true }), NOW, 'UTC').marked, true);
  const reset = windowWords(win({ usedPercentage: 91, marked: true, reset: true, resetsAt: '2026-09-19T09:00:00Z' }), NOW, 'UTC');
  assert.equal(reset.resets, 'reset 9:00 AM, not read since');
  assert.equal(reset.marked, false, 'a window begun again is not the number it was');
  assert.equal(windowWords(win({ resetsAt: null }), NOW, 'UTC').resets, null);
});

test('the hover says where the reading came from, when it is asked again, and by what rule it is shown', () => {
  const windows = [win(), win({ key: 'seven_day', label: 'week', usedPercentage: 71 })];
  const fresh: Quota = {
    state: 'fresh',
    askedAt: '2026-09-19T09:58:00Z',
    ageMs: 120_000,
    againAt: '2026-09-19T10:01:00Z',
    subscription: 'max',
    windows,
    last: null,
    keepMs: 180_000,
    markAt: 80,
    said: null,
  };
  assert.equal(
    quotaTitle(fresh, NOW, 'UTC'),
    'Asked of Claude Code (get_usage, max plan) at 9:58 AM; asked again at most every 3 min while a board is open. A window 80% used or more is marked.',
  );
  const failed: Quota = {
    ...fresh,
    state: 'timeout',
    askedAt: '2026-09-19T09:59:00Z',
    subscription: null,
    windows: [],
    said: 'late',
    last: { askedAt: '2026-09-19T09:40:00Z', windows },
  };
  assert.equal(
    quotaTitle(failed, NOW, 'UTC'),
    'Asked of Claude Code (get_usage); asked again at most every 3 min while a board is open. A window 80% used or more is marked. The dimmed numbers are the last reading, not now.',
  );
  assert.match(
    quotaTitle({ ...failed, keepMs: 0, last: null }, NOW, 'UTC'),
    /^Asked of Claude Code \(get_usage\); asked again on every read\. A window 80% used or more is marked\.$/,
  );
  assert.match(quotaTitle({ ...fresh, keepMs: 90_000 }, NOW, 'UTC'), /at most every 90 s /);
});

test('the last good reading beside a state with none: its windows, and as of when — in the header itself, never beside a fresh one', () => {
  const windows = [win(), win({ key: 'seven_day', label: 'week', usedPercentage: 86, marked: true, resetsAt: '2026-09-22T11:00:00Z' })];
  const unanswered: Quota = {
    state: 'unanswered',
    askedAt: '2026-09-19T09:59:00Z',
    ageMs: 60_000,
    againAt: '2026-09-19T10:19:00Z',
    subscription: 'max',
    windows: [],
    last: { askedAt: '2026-09-19T09:35:00Z', windows },
    keepMs: 600_000,
    markAt: 80,
    said: 'nothing this time',
  };
  const last = lastWords(unanswered, NOW, 'UTC');
  assert.equal(last?.asOf, 'as of 9:35 AM, 25 min ago');
  assert.deepEqual(
    last?.windows.map((w) => [w.label, w.used, w.resets, w.marked]),
    [
      ['5-hour', '38%', 'resets 12:30 PM', false],
      ['week', '86%', 'resets Tue 11:00 AM', true],
    ],
  );
  assert.equal(lastWords({ ...unanswered, last: null }, NOW, 'UTC'), null, "none past the api's bound");
  assert.equal(lastWords({ ...unanswered, state: 'fresh', windows }, NOW, 'UTC'), null);
  assert.equal(
    quotaTitle(unanswered, NOW, 'UTC'),
    'Asked of Claude Code (get_usage); asked again at 10:19 AM at the soonest, and less often each time the usage service gives nothing. A window 80% used or more is marked. The dimmed numbers are the last reading, not now.',
  );
});
