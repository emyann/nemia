/**
 * The words of the quota over the Factory's floor (`QuotaLine`), from what the api judged (`Quota`). Pure: the time and the time zone are
 * handed in, the browser's own on the page.
 */
import { format, isSameDay } from 'date-fns';
import type { Quota, QuotaWindow } from './api';
import { durationWords } from './duration.ts';
import { agoWords } from './runWords.ts';
import { timeOfDay, unreadable, UNREADABLE, zoneOf } from './timeOfDay.ts';

/**
 * A time as a person reads it where they are, as `timeOfDay` writes it: `4:40 PM` on the day of `now`, `Tue 9:00 AM` on another, its
 * weekday in date-fns's English, wherever the browser is. `UNREADABLE` where `at` or `now` does not parse.
 */
export function clockWord(at: Date, now: Date, timeZone?: string): string {
  if (unreadable(at, now)) return UNREADABLE;
  const zone = zoneOf(timeZone);
  const time = timeOfDay(at, timeZone);
  return isSameDay(at, now, zone) ? time : `${format(at, 'EEE', zone)} ${time}`;
}

/** One window as the header says it: its label, the percentage used, and when it resets — or that it has, since the reading. */
export type WindowWords = { key: string; label: string; used: string; resets: string | null; marked: boolean };

export function windowWords(w: QuotaWindow, now: Date, timeZone?: string): WindowWords {
  const at = w.resetsAt ? clockWord(new Date(w.resetsAt), now, timeZone) : null;
  return {
    key: w.key,
    label: w.label,
    used: `${Math.round(w.usedPercentage)}%`,
    resets: at && (w.reset ? `reset ${at}, not read since` : `resets ${at}`),
    marked: w.marked && !w.reset,
  };
}

/** `3m`, `1m 30s`: a keep, as the hover says how often the api asks, to the minute where it is whole and to the second where not. */
const keepWord = (ms: number): string => durationWords(ms, ms % 60_000 === 0 ? 'minute' : 'second');

/**
 * The last good reading beside a state with no windows of its own: its windows, and `as of 11:20 AM, 25 minutes ago`. Null when there is
 * none.
 */
export function lastWords(q: Quota, now: Date, timeZone?: string): { windows: WindowWords[]; asOf: string } | null {
  if (q.state === 'fresh' || !q.last?.windows.length) return null;
  const at = new Date(q.last.askedAt);
  return {
    windows: q.last.windows.map((w) => windowWords(w, now, timeZone)),
    asOf: `as of ${clockWord(at, now, timeZone)}, ${agoWords(at, now)}`,
  };
}

/** What the hover says of a reading: where it came from, how often it is asked again, and the rule the header shows it by. */
export function quotaTitle(q: Quota, now: Date, timeZone?: string): string {
  const every = q.keepMs > 0 ? `asked again at most every ${keepWord(q.keepMs)} while a board is open` : 'asked again on every read';
  const how =
    q.state === 'unanswered' && q.againAt
      ? `asked again at ${clockWord(new Date(q.againAt), now, timeZone)} at the soonest, and less often each time the usage service gives nothing`
      : every;
  const from =
    q.state === 'fresh' && q.askedAt
      ? `Asked of Claude Code (get_usage${q.subscription ? `, ${q.subscription} plan` : ''}) at ${clockWord(new Date(q.askedAt), now, timeZone)}; ${how}.`
      : `Asked of Claude Code (get_usage); ${how}.`;
  const rule = `A window ${q.markAt}% used or more is marked.`;
  const last = lastWords(q, now, timeZone) ? ' The dimmed numbers are the last reading, not now.' : '';
  return `${from} ${rule}${last}`;
}
