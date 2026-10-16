/**
 * The one place the board writes an hour: a time of day in words, on a 12-hour clock, as date-fns writes `h:mm a` in its default
 * English locale. Every word that says a time takes it from here and decides its own day beside it; `test/time-of-day.test.ts`
 * refuses a second writer, and a date formatted anywhere in `src` but through date-fns. Pure: the instant and the time zone are
 * handed in.
 */
import { tz } from '@date-fns/tz';
import { format, isValid } from 'date-fns';

/** What every writer of a time or a date says of a date that does not parse, where the time would stand: none of them throws. */
export const UNREADABLE = 'an unreadable time';

/** Whether one of `dates` does not parse: a writer handed one says `UNREADABLE`, of the instant or of the clock it is said against. */
export const unreadable = (...dates: Date[]): boolean => dates.some((date) => !isValid(date));

/**
 * The one place a time zone becomes what date-fns reads it as: `timeZone`'s context, and nothing where there is none, so that the
 * browser's own zone is what date-fns falls back to and `tz` is never called without a zone. Every writer of a time or a date in
 * `timeZone` takes its context from here.
 */
export const zoneOf = (timeZone?: string): { in?: ReturnType<typeof tz> } => (timeZone === undefined ? {} : { in: tz(timeZone) });

/**
 * A time of day as a person reads it in `timeZone`, theirs by default, to the minute: `1:11 PM`, `12:00 PM` at noon, `12:05 AM` after
 * midnight. The hour has no leading zero, and the space before the period is a plain one. A date that does not parse is `UNREADABLE`.
 */
export function timeOfDay(at: Date, timeZone?: string): string {
  if (unreadable(at)) return UNREADABLE;
  return format(at, 'h:mm a', zoneOf(timeZone));
}

/**
 * A time of day to the second, as a log's line is stamped, in `timeZone`, theirs by default: `7:08:53 PM`. The hour has no leading
 * zero, the minute and the second two digits each, and the space before the period is a plain one. A date that does not parse is
 * `UNREADABLE`.
 */
export function timeToTheSecond(at: Date, timeZone?: string): string {
  if (unreadable(at)) return UNREADABLE;
  return format(at, 'h:mm:ss a', zoneOf(timeZone));
}
