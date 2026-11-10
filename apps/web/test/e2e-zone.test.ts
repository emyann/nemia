/**
 * `middayZone` (test/e2e/visit.ts): every e2e browser is placed where the moment reads between noon and one, so a page that reads
 * "today" from the browser's midnight counts the seed's runs, which are dated minutes to an hour back, at every hour of the machine's
 * day: the first minutes after its midnight included, where `ci` failed the overview strip at 00:00:58 UTC.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { middayZone } from './e2e/visit.ts';

/** The hour and minute `at` reads in `zone`, as the browser placed there reads them. */
const clockIn = (at: number, zone: string): { hour: number; minute: number } => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: 'hour' | 'minute') => Number(parts.find((p) => p.type === type)?.value);
  return { hour: part('hour'), minute: part('minute') };
};

/** Midnight UTC of the day `ci` went red on. */
const MIDNIGHT = Date.parse('2026-11-09T00:00:00Z');

test('at every minute of a day, the browser is placed in a zone where the moment reads between noon and one', () => {
  for (let minute = 0; minute < 24 * 60; minute++) {
    const now = MIDNIGHT + minute * 60_000 + 58_000;
    const zone = middayZone(now);
    const clock = clockIn(now, zone);
    assert.equal(clock.hour, 12, `${new Date(now).toISOString()} in ${zone} reads ${clock.hour}:${clock.minute}`);
    assert.equal(clock.minute, minute % 60, `${zone} is a whole hour from UTC`);
  }
});

test("at 00:00:58 UTC, when ci failed, the browser's day began twelve hours before, and the seed's hour falls in it", () => {
  const now = MIDNIGHT + 58_000;
  const zone = middayZone(now);
  const hourAgo = now - 60 * 60_000;
  assert.equal(clockIn(hourAgo, zone).hour, 11, 'a run seeded an hour back is in the same day of the browser');
  assert.notEqual(zone, 'UTC', 'not the zone where the run fell on the day before');
});
