/**
 * The words of the quota over the Factory's floor (`QuotaLine`), from what the api judged (`Quota`). Pure: the time and the time zone are
 * handed in, the browser's own on the page.
 */
import type { Quota, QuotaWindow } from './api';

/** A time as a person reads it where they are: `16:40` on the day of `now`, `Tue 09:00` on another. */
export function clockWord(at: Date, now: Date, timeZone?: string): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at);
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(d);
  if (day(at) === day(now)) return time;
  return `${new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone }).format(at)} ${time}`;
}

/** How long ago a reading was made: `just now`, `4 min ago`, `2 h 5 min ago`, `3 d ago`. */
export function agoWord(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.floor(h / 24)} d ago`;
  return min % 60 ? `${h} h ${min % 60} min ago` : `${h} h ago`;
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

/** `3 min`, `90 s`: a keep, as the hover says how often the api asks. */
function keepWord(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`;
}

/** What the hover says of a reading: where it came from, the rule the header shows it by, and — with nothing to show as now — the last answer. */
export function quotaTitle(q: Quota, now: Date, timeZone?: string): string {
  const how = q.keepMs > 0 ? `asked again at most every ${keepWord(q.keepMs)} while a board is open` : 'asked again on every read';
  const from = q.state === 'fresh' && q.askedAt
    ? `Asked of Claude Code (get_usage${q.subscription ? `, ${q.subscription} plan` : ''}) at ${clockWord(new Date(q.askedAt), now, timeZone)}; ${how}.`
    : `Asked of Claude Code (get_usage); ${how}.`;
  const rule = `A window ${q.markAt}% used or more is marked.`;
  const last = q.state !== 'fresh' && q.last?.windows.length
    ? ` Last answer, at ${clockWord(new Date(q.last.askedAt), now, timeZone)}: ${q.last.windows.map((w) => `${w.label} ${Math.round(w.usedPercentage)}%`).join(', ')}.`
    : '';
  return `${from} ${rule}${last}`;
}
