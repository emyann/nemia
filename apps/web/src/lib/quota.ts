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

/** What the hover says of a reading: where it came from, and the rule the header shows it by. */
export function quotaTitle(q: Quota, now: Date, timeZone?: string): string {
  const from = q.writtenAt
    ? `Read by Claude Code${q.version ? ` ${q.version}` : ''}'s statusline at ${clockWord(new Date(q.writtenAt), now, timeZone)}, into ${q.file}.`
    : `Written by the statusline script into ${q.file}.`;
  const rule = `The numbers are as fresh as your last turn in an interactive claude session; past ${Math.round(q.staleAfterMs / 3_600_000)} h they are not shown, and a window ${q.markAt}% used or more is marked.`;
  const last = q.state === 'stale' && q.windows.length ? ` Last read: ${q.windows.map((w) => `${w.label} ${Math.round(w.usedPercentage)}%`).join(', ')}.` : '';
  return `${from} ${rule}${last}`;
}
