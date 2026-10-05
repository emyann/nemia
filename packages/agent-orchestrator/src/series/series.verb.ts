/**
 * The system's series, kept and read: a pass rolls what the recent passes hold into minute lines, minute lines into hour lines, and deletes
 * the days past their retention (`keepSeries`); `nemia series` and `GET /api/series` read a range (`seriesRead`); `nemia stats` reads a
 * period's health (`seriesHealth`). A controller, beneath the tick: it reads and writes through `series.store.ts`, and keeps nothing
 * between passes. What is due is read off the files on every pass, so a restart rolls nothing twice and loses nothing the ring still holds.
 */
import { metricsHourDays, metricsMinuteDays } from '../config/config.store.ts';
import { RECENT_KEPT, type RecentPass } from '../meter/meter.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { appendLines, days, dayStamp, dropDay, lastLine, readDay } from './series.store.ts';
import {
  dayOf,
  daysOfRange,
  daysPast,
  healthOf,
  hoursDue,
  isRange,
  minutesDue,
  RANGES,
  rollHours,
  rollMinutes,
  seriesLines,
  seriesOf,
  type Health,
  type RollupLine,
  type SeriesMemo,
  type SeriesRead,
  type Tier,
} from './series.ts';

/**
 * The series kept on a pass at `now`, from the passes the ring holds after it (`ring`, oldest first): the minutes due rolled and appended,
 * then the hours due rolled from the minute files, then each tier's days past its retention deleted (`WF_METRICS_MINUTE_DAYS`,
 * `WF_METRICS_HOUR_DAYS`). Throws what a read or a write threw, a retention refused among them: the tick's to say, never to stop on.
 */
export const keepSeries = (ring: readonly RecentPass[], now: number = Date.now()): void => {
  const lastMinute = lastLine('minute')?.t;
  appendLines('minute', rollMinutes(ring, minutesDue(ring, lastMinute, now, RECENT_KEPT)));
  const due = hoursDue(lastMinute, lastLine('hour')?.t, now);
  if (due) {
    const from = due.after === undefined ? '' : dayOf(due.after);
    const minutes = days('minute')
      .filter((d) => d >= from && d <= dayOf(due.before))
      .flatMap((d) => readDay('minute', d));
    appendLines('hour', rollHours(minutes, due));
  }
  for (const day of daysPast(days('minute'), now, metricsMinuteDays())) dropDay('minute', day);
  for (const day of daysPast(days('hour'), now, metricsHourDays())) dropDay('hour', day);
};

/** A tier's day, answered from `memo` while its file has not moved since it was read, and read again once it has. */
const dayLines = (tier: Tier, day: string, memo: SeriesMemo | undefined): RollupLine[] => {
  if (!memo) return readDay(tier, day);
  const key = `${tier}/${day}`;
  const stamp = dayStamp(tier, day);
  const held = memo.get(key);
  if (stamp !== undefined && held?.stamp === stamp) return held.lines;
  const lines = readDay(tier, day);
  if (stamp === undefined) memo.delete(key);
  else memo.set(key, { stamp, lines });
  return lines;
};

/** What `--range` takes, as its refusal says it. */
const RANGE_TAKES = `--range takes ${Object.keys(RANGES).join(', ')}: nemia series --range 7d`;

/** The range `text` names, `24h` when none is given. Refuses as `Invalid` a range that is not one of `RANGES`. */
export const rangeOf = (text: string | undefined): keyof typeof RANGES => {
  if (text === undefined) return '24h';
  if (!isRange(text)) throw new Invalid({ message: `${RANGE_TAKES}, not ${JSON.stringify(text)}.` });
  return text;
};

/** The series over `range` (`rangeOf`) at `now`, read off its tier's days, past days from `memo` where one is handed. Writes nothing. */
export const seriesRead = (range: string | undefined, memo?: SeriesMemo, now: number = Date.now()): SeriesRead => {
  const r = rangeOf(range);
  const tier = RANGES[r].tier;
  return seriesOf(
    r,
    daysOfRange(r, days(tier), now).flatMap((d) => dayLines(tier, d, memo)),
    now,
  );
};

/**
 * The system's health over the UTC days from `from` (every day kept, for null) to `to`, both included, read off the hour lines: each
 * figure null where nothing was kept.
 */
export const seriesHealth = (from: string | null, to: string, memo?: SeriesMemo): Health =>
  healthOf(
    days('hour')
      .filter((d) => (from === null || d >= from) && d <= to)
      .flatMap((d) => dayLines('hour', d, memo)),
  );

const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `nemia series`: the system's series over a range, a point a minute, an hour or a day. */
export const SERIES: Command<SeriesRead> = {
  name: 'series',
  usage: '[--range 24h|7d|30d|all] [--json]',
  help: [
    "the system's series over a range: a pass's time and its phases, its",
    'journal reads, the runs in the store, the sessions queued and admitted',
    'and the longest wait, the load, and the quota used. --range: 24h (a',
    'point a minute, the default), 7d or 30d (an hour), all (a day);',
    '--json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--range', kind: 'text', key: 'range', takes: RANGE_TAKES, twice: 'nemia series takes --range once.' },
      { flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole answer, as JSON' } },
    ],
    unknown: (arg) => `nemia series does not take ${arg}. It takes --range <range> and --json.`,
    apart: () => RANGE_TAKES,
  },
  writes: false,
  route: { method: 'GET', path: '/api/series', status: 200 },
  handler: async (_e, args, _env, _home, kept) => seriesRead(textOf(args, 'range'), kept?.series),
  print: (read, args) => (args.json === true ? [JSON.stringify(read, null, 2)] : seriesLines(read)),
};
