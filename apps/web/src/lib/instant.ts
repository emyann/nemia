/**
 * The one place the board writes a whole instant, its date and its time: the words a page says and the whole instant a hover says.
 * The date is `dateParts`'s and the hour the one writer's (`timeOfDay`, `timeToTheSecond`); a comma stands after a year alone, and
 * every space is a plain one. Pure: the instant, now and the time zone are handed in.
 */
import { isSameDay, isSameYear } from 'date-fns';
import { dateParts } from './runWords.ts';
import { timeOfDay, timeToTheSecond, unreadable, UNREADABLE, zoneOf } from './timeOfDay.ts';

/**
 * An instant as a page says it where the person is, in `timeZone`, theirs by default, to the minute: the time alone on the day of
 * `now` (`7:08 PM`), its day and month before it on another day of `now`'s year (`9 Oct 5:30 PM`), and its year too, then a comma,
 * in another year (`31 Dec 2025, 4:10 PM`). `UNREADABLE` where `at` or `now` does not parse.
 */
export function instantWords(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const zone = zoneOf(timeZone);
  const then = dateParts(at, timeZone);
  const time = timeOfDay(at, timeZone);
  if (!isSameYear(at, now, zone)) return `${then.day} ${then.month} ${then.year}, ${time}`;
  return isSameDay(at, now, zone) ? time : `${then.day} ${then.month} ${time}`;
}

/**
 * An instant whole, as a hover says it in `timeZone`, theirs by default: its date, its year and its time to the second
 * (`12 Oct 2026, 7:08:53 PM`). `UNREADABLE` where `at` does not parse.
 */
export function instantWhole(at: Date, timeZone?: string): string {
  if (unreadable(at)) return UNREADABLE;
  const then = dateParts(at, timeZone);
  return `${then.day} ${then.month} ${then.year}, ${timeToTheSecond(at, timeZone)}`;
}
