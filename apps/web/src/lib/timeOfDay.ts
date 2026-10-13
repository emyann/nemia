/**
 * The one place the board writes an hour: a time of day in words, on a 12-hour clock. Every word that says a time takes it from here
 * and decides its own day beside it; `test/time-of-day.test.ts` refuses a second writer. Pure, and it imports nothing.
 */

/**
 * A time of day as a person reads it in `timeZone`, theirs by default, to the minute: `1:11 PM`, `12:00 PM` at noon, `12:05 AM` after
 * midnight. The hour has no leading zero, and the space before the period is a plain one.
 */
export function timeOfDay(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).formatToParts(at);
  const of = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${of('hour')}:${of('minute')} ${of('dayPeriod')}`;
}

/**
 * A time of day to the second, as a log's line is stamped, in `timeZone`, theirs by default: `7:08:53 PM`. The hour has no leading
 * zero, the minute and the second two digits each, and the space before the period is a plain one.
 */
export function timeToTheSecond(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone,
  }).formatToParts(at);
  const of = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${of('hour')}:${of('minute')}:${of('second')} ${of('dayPeriod')}`;
}
