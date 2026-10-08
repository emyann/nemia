/** The words of a factory's schedules on its settings page (`FactorySchedules`). Pure: the time and the time zone are handed in. */
import { clockWord } from './quota.ts';

/** How far from now a time is still said by its weekday: under six days either way, no weekday names two days. */
const WEEKDAY_MS = 6 * 24 * 60 * 60_000;

/**
 * A fire or a run's start as a person reads it where they are: as `clockWord` says it within six days of `now` (`16:40`, `Tue 09:00`);
 * further off, by its date (`Jan 1 09:00`), and its year when it is not `now`'s (`Jan 1, 2027 09:00`).
 */
export function fireWord(at: Date, now: Date, timeZone?: string): string {
  if (Math.abs(at.getTime() - now.getTime()) < WEEKDAY_MS) return clockWord(at, now, timeZone);
  const year = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone }).format(d);
  const date = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: year(at) === year(now) ? undefined : 'numeric',
    timeZone,
  }).format(at);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at);
  return `${date} ${time}`;
}
