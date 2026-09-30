/**
 * The Stats page's rules: the headline numbers it draws, each worded as `wf stats` words it (`stats-words.ts` in the orchestrator), the
 * page's search and the api's query it asks, the period counted in UTC days, and the days and marks turned into what a chart draws. A
 * number nothing measured is null here, and `—` in words, never 0. Pure.
 */
import type { StatsDay, StatsHeadline, StatsMark } from './api.ts';

/** What a number nothing measured reads. */
export const NONE = '—';

/** A headline number's key in the api's answer. */
export type HeadlineKey = keyof StatsHeadline;

/** A headline number: its key, its name as `wf stats` prints it, what it counts, and its value in words. */
export type HeadlineNumber = { key: HeadlineKey; label: string; about: string; words: (value: number | null) => string };

const or = (word: (v: number) => string) => (v: number | null) => (v === null ? NONE : word(v));

/** A cost in dollars, as the package's `dollars` says it: three figures under a cent, cents above. */
const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A length of time, as the package's `durationWord` says it: `42s`, `2m05s`, `1h05m`, `1d01h`. */
export function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

/** The headline numbers, in the order the page shows them: how well the runs went first, then how much went on. */
export const HEADLINES: readonly HeadlineNumber[] = [
  { key: 'rounds', label: 'rounds', about: 'mean rounds to acceptance', words: or((n) => (Math.round(n * 10) / 10).toString()) },
  {
    key: 'firstTry',
    label: 'first try',
    about: 'share landed on the first try',
    words: or((n) => `${Math.round(n * 100)}%`),
  },
  { key: 'costPerLanded', label: 'cost/landed', about: 'mean cost of a landed run', words: or(dollars) },
  { key: 'timePerLanded', label: 'time/landed', about: 'mean wall time of a landed run', words: or(durationWord) },
  { key: 'landed', label: 'landed', about: 'runs that landed', words: or(String) },
  { key: 'runs', label: 'runs', about: 'runs finished', words: or(String) },
  { key: 'tries', label: 'tries', about: 'tries ended', words: or(String) },
  { key: 'refused', label: 'refused', about: 'checks that refused', words: or(String) },
  { key: 'gateWaitMs', label: 'gate wait', about: 'mean wait at a gate', words: or(durationWord) },
];

/** Every headline number of `h` in words, by key. */
export const wordsOf = (h: StatsHeadline): Record<HeadlineKey, string> =>
  Object.fromEntries(HEADLINES.map(({ key, words }) => [key, words(h[key])])) as Record<HeadlineKey, string>;

/** Which way a number went from `before` to `last`; null where either is not measured. Neither good nor bad: that is not the page's call. */
export const trendOf = (last: number | null, before: number | null): '↑' | '↓' | '=' | null =>
  last === null || before === null ? null : last > before ? '↑' : last < before ? '↓' : '=';

/** The keys the page can keep one value of, as the api's `by` names them. */
export const FILTERS = ['agent', 'step', 'factory', 'workflow', 'repo'] as const;

/** A key the page can keep one value of. */
export type FilterKey = (typeof FILTERS)[number];

/** The name the api reads each filter under: a factory and a repository as `ofFactory` and `ofRepo`, since `factory` and `repo` place it. */
const PARAM: Record<FilterKey, string> = { agent: 'agent', step: 'step', factory: 'ofFactory', workflow: 'workflow', repo: 'ofRepo' };

/** The periods the charts offer: the tiles' 28 days, the default; 90 days; and every day the store has. */
export const PERIODS = [
  { id: '28d', label: '28 days', days: 28 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All', days: null },
] as const;

/** A period the charts offer. */
export type PeriodId = (typeof PERIODS)[number]['id'];

/** The page's search: a period other than the default, and a value for each key kept. */
export type StatsSearch = { period?: Exclude<PeriodId, '28d'> } & Partial<Record<FilterKey, string>>;

/**
 * The page's search off its address: a period the page offers other than the default, and each filter given a non-empty string. Anything
 * else is dropped, so an address typed by hand never asks the api for what it refuses.
 */
export function searchOf(given: Record<string, unknown>): StatsSearch {
  const search: StatsSearch = {};
  if (given.period === '90d' || given.period === 'all') search.period = given.period;
  for (const key of FILTERS) {
    const value = given[key];
    if (typeof value === 'string' && value) search[key] = value;
  }
  return search;
}

const DAY_MS = 86_400_000;

/** The first UTC day of `period` as of `now`: today and the days before it, counted in UTC; null for every day. */
export function periodFrom(period: PeriodId, now: Date): string | null {
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  if (days === null) return null;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return new Date(today - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** The api's query string for `search` as of `now`: the period's first day, the key to go `by` if any, and each filter under its name. */
export function apiQueryOf(search: StatsSearch, now: Date, by?: FilterKey): string {
  const query = new URLSearchParams();
  const from = periodFrom(search.period ?? '28d', now);
  if (from) query.set('from', from);
  if (by) query.set('by', by);
  for (const key of FILTERS) {
    const value = search[key];
    if (value !== undefined) query.set(PARAM[key], value);
  }
  return query.toString();
}

/** One headline number of each day: the values, null kept where nothing was measured, and the largest known value, null where none is. */
export function seriesOf(
  days: readonly StatsDay[],
  key: HeadlineKey,
): { points: Array<{ day: string; value: number | null }>; max: number | null } {
  const points = days.map((d) => ({ day: d.day, value: d[key] }));
  const known = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const max = known.length ? Math.max(...known) : null;
  return { points, max };
}

/** The marks by their day, each day's in the order served. */
export function marksByDay(marks: readonly StatsMark[]): Map<string, StatsMark[]> {
  const byDay = new Map<string, StatsMark[]>();
  for (const mark of marks) byDay.set(mark.day, [...(byDay.get(mark.day) ?? []), mark]);
  return byDay;
}

/** A repository as the page names it: its folder's name. */
export const repoWord = (path: string): string => path.replace(/\/+$/, '').split('/').pop() || path;

/** `search` with `period` chosen: the default period is left out of the address. */
export function withPeriod(search: StatsSearch, period: PeriodId): StatsSearch {
  const { period: _was, ...rest } = search;
  return period === '28d' ? rest : { ...rest, period };
}

/** `search` keeping `value` for `key`, or no value of it for null. */
export function withFilter(search: StatsSearch, key: FilterKey, value: string | null): StatsSearch {
  const { [key]: _was, ...rest } = search;
  return value === null ? rest : { ...rest, [key]: value };
}
