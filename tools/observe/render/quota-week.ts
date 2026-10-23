/**
 * A week of the subscription's quota for the render's seed (`seed.ts`): the gauges `quota.used` and `quota.resets_at` of the week and the
 * five-hour windows, sampled every five minutes as the daemon's gauges are exported, read every ten, through one reset of the week and
 * the five-hour windows' resets, used while a person works, twelve hours a day.
 */
import type { MetricSeed } from './seed.ts';

/**
 * A gauge's history, in place of its last minute: `count` samples `every` ms apart up to the stamp, each series' value at a sample `ago`
 * ms before the stamp `now` given by `at`. Posted before every other metric, oldest first (`post`), since Prometheus takes a sample far
 * behind the newest it holds as out of bounds.
 */
export type Sampled = { every: number; count: number; at: (attributes: Record<string, string>, ago: number, now: number) => number };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How often the daemon reads the quota (`QUOTA_EVERY_MS`): a reading holds until the next. */
const READING_MS = 10 * 60_000;
/** How long the seeded week's window has run at the stamp: it reset two and a half days before it. */
const WEEK_RUN_MS = 2.5 * DAY_MS;
/** Each window's length, by the key the harness gives it. */
const WINDOW_MS: Record<string, number> = { seven_day: 7 * DAY_MS, five_hour: 5 * HOUR_MS };

/** The ms of `from` to `to` (since the week's window began) that fall in a working day, 08:00 to 20:00 of each day after that start. */
const workedMs = (from: number, to: number): number => {
  let worked = 0;
  for (let day = Math.floor(from / DAY_MS) * DAY_MS; day < to; day += DAY_MS)
    worked += Math.max(0, Math.min(to, day + 20 * HOUR_MS) - Math.max(from, day + 8 * HOUR_MS));
  return worked;
};

/**
 * The seeded quota `ago` ms before the stamp, for a window: its start and its reset, in ms since the week's window began, and the percent
 * used at the reading before it, ninety percent of a window that is worked through, twelve hours a day.
 */
function quotaAt(window: string, ago: number): { used: number; resetsAt: number } {
  const t = Math.floor((WEEK_RUN_MS - ago) / READING_MS) * READING_MS;
  const length = WINDOW_MS[window];
  const start = Math.floor(t / length) * length;
  const worked = workedMs(start, t);
  const full = window === 'seven_day' ? 7 * 12 * HOUR_MS : 5 * HOUR_MS;
  return { used: Math.min(100, Math.round((900 * worked) / full) / 10), resetsAt: start + length };
}

/** A week of the quota as the daemon reads it, sampled every five minutes as its gauges are exported, through one reset of the week. */
const QUOTA_WEEK = { every: 5 * 60_000, count: (7 * DAY_MS) / (5 * 60_000) + 1 };

/** The seeded quota of the week and of the five-hour window, each a gauge `quota.used` or `quota.resets_at`. */
export const quota = (name: 'quota.used' | 'quota.resets_at'): MetricSeed => ({
  name,
  kind: 'gauge',
  series: ['seven_day', 'five_hour'].map((window): [Record<string, string>, number] => [{ harness: 'claude', window }, 0]),
  sampled: {
    ...QUOTA_WEEK,
    at: ({ window }, ago, now) => {
      const at = quotaAt(window, ago);
      return name === 'quota.used' ? at.used : (now - WEEK_RUN_MS + at.resetsAt) / 1000;
    },
  },
});
