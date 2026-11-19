/**
 * The words of the quota over the Factory's floor (`QuotaLine`), from what the api judged (`Quota`). Pure: the time and the time zone are
 * handed in, the browser's own on the page.
 */
import { format, isSameDay } from 'date-fns';
import type { Quota, QuotaWindow } from './api/quota.ts';
import { durationWords } from './duration.ts';
import { agoWords } from './runWords.ts';
import { timeOfDay, unreadable, UNREADABLE, zoneOf } from './timeOfDay.ts';

/**
 * A time as a person reads it where they are, as `timeOfDay` writes it: `4:40 PM` on the day of `now`, `Tue 9:00 AM` on another, its
 * weekday in date-fns's English, wherever the browser is. `UNREADABLE` where `at` or `now` does not parse.
 * @param at The time to say.
 * @param now The instant it is now, which sets whether the weekday is said.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
 */
export function clockWord(at: Date, now: Date, timeZone?: string) {
  if (unreadable(at, now)) return UNREADABLE;
  const zone = zoneOf(timeZone);
  const time = timeOfDay(at, timeZone);
  return isSameDay(at, now, zone) ? time : `${format(at, 'EEE', zone)} ${time}`;
}

/** One window as the header says it: its label, the percentage used, and when it resets — or that it has, since the reading. */
export type WindowWords = { key: string; label: string; used: string; resets: string | null; marked: boolean };

/**
 * One window of a reading as the header says it (`WindowWords`): its label, the percentage used, rounded, and when it resets,
 * or that it reset since the reading; marked where the api marked it and it has not reset.
 * @param w The window, as the api judged it.
 * @param now The instant it is now, against which the reset is said.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
 */
export function windowWords(w: QuotaWindow, now: Date, timeZone?: string) {
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
const keepWord = (ms: number) => durationWords(ms, ms % 60_000 === 0 ? 'minute' : 'second');

/**
 * The last good reading beside a state with no windows of its own: its windows, and `as of 11:20 AM, 25 minutes ago`. Null when there is
 * none.
 * @param q The quota, as the api judged it.
 * @param now The instant it is now, against which the reading's time is said.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
 */
export function lastWords(q: Quota, now: Date, timeZone?: string) {
  if (q.state === 'fresh' || !q.last?.windows.length) return null;
  const at = new Date(q.last.askedAt);
  return {
    windows: q.last.windows.map((w) => windowWords(w, now, timeZone)),
    asOf: `as of ${clockWord(at, now, timeZone)}, ${agoWords(at, now)}`,
  };
}

/**
 * How old a `fresh` reading is, as the header says it beside its windows: `read 4 minutes ago` for an ask's answer, and `as of a
 * session's turn 4 minutes ago` for windows a token's sessions heard (`heard`), which no ask read. Null where neither time is held.
 * @param q The quota, as the api judged it.
 * @param now The instant it is now, against which the reading's age is said.
 */
export function readingAge(q: Quota, now: Date) {
  if (q.heard) return `as of a session's turn ${agoWords(new Date(q.heard.at), now)}`;
  return q.askedAt ? `read ${agoWords(new Date(q.askedAt), now)}` : null;
}

/**
 * What the hover says of a reading: where it came from, how often it is asked again, and the rule the header shows it by.
 * @param q The quota, as the api judged it.
 * @param now The instant it is now, against which each time is said.
 * @param timeZone The IANA time zone to say it in, or undefined for the person's own.
 */
export function quotaTitle(q: Quota, now: Date, timeZone?: string) {
  const every = q.keepMs > 0 ? `asked again at most every ${keepWord(q.keepMs)} while a board is open` : 'asked again on every read';
  const how =
    q.state === 'unanswered' && q.againAt
      ? `asked again at ${clockWord(new Date(q.againAt), now, timeZone)} at the soonest, and less often each time the usage service gives nothing`
      : every;
  const from = q.heard
    ? `This machine is signed in by a token, whose get_usage gives no plan limits: these are the newest the sessions' own turns were told (rate_limit_event), at ${clockWord(new Date(q.heard.at), now, timeZone)}; ${how}.`
    : q.state === 'fresh' && q.askedAt
      ? `Asked of Claude Code (get_usage${q.subscription ? `, ${q.subscription} plan` : ''}) at ${clockWord(new Date(q.askedAt), now, timeZone)}; ${how}.`
      : `Asked of Claude Code (get_usage); ${how}.`;
  const rule = `A window ${q.markAt}% used or more is marked.`;
  const last = lastWords(q, now, timeZone) ? ' The dimmed numbers are the last reading, not now.' : '';
  return `${from} ${rule}${last}`;
}
