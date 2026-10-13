/** The words of a factory's schedules on its settings page (`FactorySchedules`). Pure: the time and the time zone are handed in. */
import { clockWord } from './quota.ts';
import { instantWords } from './instant.ts';

/** How far from now a time is still said by its weekday: under six days either way, no weekday names two days. */
const WEEKDAY_MS = 6 * 24 * 60 * 60_000;

/**
 * A fire or a run's start as a person reads it where they are: as `clockWord` says it within six days of `now` (`4:40 PM`,
 * `Tue 9:00 AM`); further off, as `instantWords` says a whole instant: by its date in the runs page's order (`14 Oct 12:00 PM`),
 * with its year and a comma when it is not `now`'s (`1 Jan 2027, 9:00 AM`).
 */
export function fireWord(at: Date, now: Date, timeZone?: string): string {
  if (Math.abs(at.getTime() - now.getTime()) < WEEKDAY_MS) return clockWord(at, now, timeZone);
  return instantWords(at, now, timeZone);
}
