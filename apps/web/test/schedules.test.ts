/**
 * The words of a factory's schedules (src/lib/schedules.ts): a fire or a run said by its weekday within six days of now, by its date
 * further off, and its year when it is another year's. `npm run e2e` looks at the card itself (`factory-schedules`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireWord } from '../src/lib/schedules.ts';

const NOW = new Date('2026-10-08T12:00:00.000Z');

test("a fire within six days is said as the quota's resets are: the time today, the weekday before it on another day", () => {
  assert.equal(fireWord(new Date('2026-10-08T13:00:00Z'), NOW, 'UTC'), '1:00 PM');
  assert.equal(fireWord(new Date('2026-10-12T13:00:00Z'), NOW, 'UTC'), 'Mon 1:00 PM');
  assert.equal(fireWord(new Date('2026-10-05T13:00:00Z'), NOW, 'UTC'), 'Mon 1:00 PM', 'a run started three days ago, too');
  assert.equal(fireWord(new Date('2026-10-14T11:59:00Z'), NOW, 'UTC'), 'Wed 11:59 AM', 'a minute under six days');
});

test('REFUSED: a fire six days off or more is never said by its weekday alone, which would read as this week', () => {
  assert.equal(fireWord(new Date('2026-10-14T12:00:00Z'), NOW, 'UTC'), '14 Oct 12:00 PM', 'six days on');
  assert.equal(fireWord(new Date('2026-10-01T09:00:00Z'), NOW, 'UTC'), '1 Oct 9:00 AM', 'a week ago');
  assert.equal(fireWord(new Date('2027-01-01T09:00:00Z'), NOW, 'UTC'), '1 Jan 2027 9:00 AM', "another year's, with its year");
  assert.equal(fireWord(new Date('2027-01-01T09:00:00Z'), NOW, 'America/Toronto'), '1 Jan 2027 4:00 AM', "in the person's own time zone");
  assert.equal(fireWord(new Date('2026-12-15T03:00:00Z'), NOW, 'America/Toronto'), '14 Dec 10:00 PM', 'the date where the person is');
});
