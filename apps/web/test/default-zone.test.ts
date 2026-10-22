/**
 * A writer handed no `timeZone` writes the moment where the person is: `zoneOf` gives date-fns no context at all, so date-fns falls
 * back to the machine's own zone, as `Intl.DateTimeFormat` did with `timeZone: undefined`. This file sets a zone that is not UTC
 * before it loads a writer, so a `zoneOf(undefined)` that handed date-fns a context of its own (`{ in: undefined }`, or UTC) would
 * be caught here and nowhere else: every other suite passes its writers an explicit zone, and would stay green. A zone-carrying
 * comparison no other suite pins whatever the machine is belongs here too, named with its zone: a machine that is already UTC makes
 * a dropped zone a no-op everywhere else.
 */
process.env.TZ = 'Asia/Tokyo';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ZONE = 'Asia/Tokyo';
const { instantWhole, instantWords } = await import('../src/lib/instant.ts');
const { clockWord } = await import('../src/lib/quota.ts');
const { agoWords, dateParts, whenWords } = await import('../src/lib/runWords.ts');
const { fireWord } = await import('../src/lib/schedules.ts');
const { timeOfDay, timeToTheSecond, zoneOf } = await import('../src/lib/timeOfDay.ts');

test('the machine is the zone this file set, so a writer handed none can be told from one handed UTC', () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, ZONE, 'the zone is set before a writer is loaded');
  assert.deepEqual(zoneOf(), {}, 'no zone is no context: date-fns falls back to the machine, as the browser does to the person');
  assert.notEqual(zoneOf(ZONE).in, undefined, 'a zone is a context of its own');
  assert.notEqual(timeOfDay(new Date('2026-10-12T13:11:00Z')), timeOfDay(new Date('2026-10-12T13:11:00Z'), 'UTC'), 'not UTC');
});

test('every writer handed no time zone writes the words the machine’s zone gives, the same as that zone named', () => {
  const at = new Date('2026-10-12T13:11:00Z');
  const now = new Date('2026-10-12T14:00:00Z');
  assert.equal(timeOfDay(at), '10:11 PM', 'an hour: 13:11 UTC is 22:11 in Tokyo');
  assert.equal(timeOfDay(at), timeOfDay(at, ZONE));
  assert.equal(timeToTheSecond(new Date('2026-10-12T13:11:53Z')), '10:11:53 PM');
  assert.deepEqual(dateParts(at), { year: '2026', month: 'Oct', day: '12' });
  assert.deepEqual(dateParts(at), dateParts(at, ZONE));
  assert.equal(whenWords(at, now), '10:11 PM', 'both instants fall on the 12th in Tokyo, so the date is dropped');
  assert.equal(agoWords(at, now), '49 minutes ago', 'a distance is the same wherever the machine is: it names no zone and takes none');
  assert.equal(instantWords(at, now), '10:11 PM');
  assert.equal(instantWhole(at), '12 Oct 2026, 10:11:00 PM');
  assert.equal(clockWord(at, now), '10:11 PM', 'the same day in Tokyo');
  assert.equal(fireWord(at, now), '10:11 PM');
});

test('the day and the year are decided in the machine’s zone too, never in UTC', () => {
  const across = [new Date('2026-10-12T23:30:00Z'), new Date('2026-10-13T01:00:00Z')] as const;
  assert.equal(whenWords(...across), '8:30 AM', 'one day apart in UTC, both the 13th in Tokyo: the date is dropped');
  assert.equal(whenWords(...across, 'UTC'), '12 Oct 11:30 PM', 'and the same pair named UTC keeps it');
  const midnight = [new Date('2026-10-12T13:11:00Z'), new Date('2026-10-12T15:00:00Z')] as const;
  assert.equal(clockWord(...midnight), 'Mon 10:11 PM', 'one day in UTC, the 12th against the 13th in Tokyo: a weekday');
  assert.equal(clockWord(...midnight, 'UTC'), '1:11 PM', 'and the same pair named UTC is one day');
  const newYear = [new Date('2025-12-31T16:00:00Z'), new Date('2026-10-12T15:00:00Z')] as const;
  assert.equal(whenWords(...newYear), '1 Jan 1:00 AM', '31 Dec 16:00 UTC is already 2026 in Tokyo, so the year is dropped');
  assert.equal(whenWords(...newYear, 'UTC'), '31 Dec 2025', 'and named UTC it is the year before, which drops the time instead');
  assert.equal(agoWords(...newYear), '9 months ago', "a distance crosses no year's end: the zone changes the hover title, never it");
  assert.equal(instantWords(...newYear), '1 Jan 1:00 AM', 'the page keeps its time and drops the year the zone shares');
  assert.equal(instantWords(...newYear, 'UTC'), '31 Dec 2025, 4:00 PM', 'and named UTC it says the year, then a comma, then the time');
});
