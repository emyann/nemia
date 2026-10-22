/**
 * A whole instant has one writer (src/lib/instant.ts): the page's words to the minute, the time alone on the day of now, its date
 * before it on another, its year and a comma in another year; the whole instant to the second on hover; and a log's time to the
 * second from the writer of an hour. Each form is an exact string here, and a schedule's far fire is the same words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantWhole, instantWords } from '../src/lib/instant.ts';
import { fireWord } from '../src/lib/schedules.ts';
import { clockWord } from '../src/lib/quota.ts';
import { agoWords, dateParts, whenWords } from '../src/lib/runWords.ts';
import { timeOfDay, timeToTheSecond, UNREADABLE } from '../src/lib/timeOfDay.ts';

const NOW = new Date('2026-10-12T23:08:53Z');
const ZONE = 'America/Toronto';

test("the page's words: the time alone today, its date before it on another day, its year and a comma in another year", () => {
  assert.equal(instantWords(NOW, NOW, ZONE), '7:08 PM', 'today');
  assert.equal(instantWords(new Date('2026-10-09T21:30:00Z'), NOW, ZONE), '9 Oct 5:30 PM', 'another day');
  assert.equal(instantWords(new Date('2025-12-31T21:10:00Z'), NOW, ZONE), '31 Dec 2025, 4:10 PM', 'another year');
  assert.equal(instantWords(new Date('2025-10-12T23:08:00Z'), NOW, ZONE), '12 Oct 2025, 7:08 PM', 'the same day of another year');
});

test('the day is decided where the person is', () => {
  const at = new Date('2026-10-12T14:30:00Z');
  assert.equal(instantWords(at, NOW, 'UTC'), '2:30 PM');
  assert.equal(instantWords(at, new Date('2026-10-12T03:00:00Z'), 'Asia/Tokyo'), '11:30 PM', 'the same day in Tokyo');
  assert.equal(instantWords(at, NOW, 'Asia/Tokyo'), '12 Oct 11:30 PM', "now is already the 13th in Tokyo, so the 12th is another day's");
});

test('the whole instant, on hover, has its year and its seconds, and a log has its time to the second', () => {
  assert.equal(instantWhole(NOW, ZONE), '12 Oct 2026, 7:08:53 PM');
  assert.equal(timeToTheSecond(NOW, ZONE), '7:08:53 PM');
  assert.equal(timeToTheSecond(new Date('2026-10-12T16:00:05Z'), 'UTC'), '4:00:05 PM', 'a second under ten keeps two digits');
  assert.equal(timeToTheSecond(new Date('2026-10-12T00:00:00Z'), 'UTC'), '12:00:00 AM', 'midnight');
  for (const words of [instantWhole(NOW, ZONE), timeToTheSecond(NOW, ZONE), instantWords(new Date('2025-12-31T21:10:00Z'), NOW, ZONE)])
    assert.doesNotMatch(words, /[^\dA-Za-z:, ]/, `only digits, letters, a colon, a comma and a plain space: ${words}`);
});

test("a schedule's far fire is the whole instant's words, and a near one stays the clock's", () => {
  const far = new Date('2027-01-01T09:00:00Z');
  assert.equal(fireWord(far, NOW, ZONE), '1 Jan 2027, 4:00 AM');
  assert.equal(fireWord(far, NOW, ZONE), instantWords(far, NOW, ZONE));
  assert.equal(
    fireWord(new Date('2026-10-14T16:00:00Z'), new Date('2026-10-01T12:00:00Z'), ZONE),
    '14 Oct 12:00 PM',
    'no mark without a year',
  );
  assert.equal(fireWord(new Date('2026-10-13T13:00:00Z'), NOW, ZONE), 'Tue 9:00 AM', 'within six days');
});

const BROKEN = new Date('not a date');

test('REFUSED: a date that does not parse is said in fixed words by the writers of an hour, and none throws', () => {
  assert.equal(UNREADABLE, 'an unreadable time');
  assert.equal(timeOfDay(BROKEN, ZONE), UNREADABLE);
  assert.equal(timeToTheSecond(BROKEN, ZONE), UNREADABLE);
});

test('REFUSED: the parts of a date that does not parse are empty, and nothing throws', () => {
  assert.deepEqual(dateParts(BROKEN, ZONE), { year: '', month: '', day: '' });
});

test("REFUSED: the runs page's words say a date that does not parse, or a clock that does not, in the fixed words", () => {
  assert.equal(whenWords(BROKEN, NOW, ZONE), UNREADABLE);
  assert.equal(whenWords(NOW, BROKEN, ZONE), UNREADABLE, 'a clock that does not parse');
});

test("REFUSED: a column's `how long ago` says a date that does not parse, or a clock that does not, in the fixed words", () => {
  assert.equal(agoWords(BROKEN, NOW), UNREADABLE);
  assert.equal(agoWords(NOW, BROKEN), UNREADABLE, 'a clock that does not parse');
});

test("REFUSED: the page's words say an instant that does not parse, or a clock that does not, in the fixed words", () => {
  assert.equal(instantWords(BROKEN, NOW, ZONE), UNREADABLE);
  assert.equal(instantWords(NOW, BROKEN, ZONE), UNREADABLE, 'a clock that does not parse');
});

test('REFUSED: the whole instant, on hover, says an instant that does not parse in the fixed words', () => {
  assert.equal(instantWhole(BROKEN, ZONE), UNREADABLE);
});

test("REFUSED: the clock's word says a time that does not parse, or a clock that does not, in the fixed words", () => {
  assert.equal(clockWord(BROKEN, NOW, ZONE), UNREADABLE);
  assert.equal(clockWord(NOW, BROKEN, ZONE), UNREADABLE, 'a clock that does not parse');
});

test("REFUSED: a schedule's fire that does not parse, or said against a clock that does not, is the fixed words", () => {
  assert.equal(fireWord(BROKEN, NOW, ZONE), UNREADABLE);
  assert.equal(fireWord(NOW, BROKEN, ZONE), UNREADABLE, 'a clock that does not parse');
});
