/**
 * The series' files: a tier's lines by UTC day, `$WF_ROOT/metrics/<tier>/<YYYY-MM-DD>.jsonl`, a line of JSON a series over a span
 * (`RollupLine`), appended by the ticking daemon's pass alone and deleted by date as their retention passes (`keepSeries`); read over a
 * range by `nemia series` and `GET /api/series` (`seriesRead`, the command `SERIES` in `series/commands.verb.ts`), and over a period's days
 * by `nemia stats` (`seriesHealth`). What is due is read off the files on every pass, so a restart rolls nothing twice and loses nothing
 * the ring still holds. Beneath the controllers: it imports the store's root, its retention and the pass's meter, and no controller.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import type { Settings } from '../config/config.store.ts';
import { countRead } from '../meter/tally.store.ts';
import { FORMER_PHASE_WORDS, FORMER_PHASES, isPhase, PHASES, RECENT_KEPT, type RecentPass } from '../meter/index.ts';
import { ALL_KINDS, DISK_PARTS } from '../disk/disk.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  dayOf,
  daysOfRange,
  daysPast,
  healthOf,
  hoursDue,
  isRange,
  SERIES_LABEL_KEYS,
  memoDays,
  minutesDue,
  RANGES,
  rollHours,
  rollMinutes,
  seriesOf,
  strangeLabels,
  type Health,
  type RollupLine,
  type SeriesMemo,
  type SeriesRead,
  type Tier,
} from './series.ts';

/** The folder of a tier's files. */
export const tierDir = (home: string, tier: Tier): string => path.join(home, 'metrics', tier);

/** The file of a tier's day. */
export const dayFile = (home: string, tier: Tier, day: string): string => path.join(tierDir(home, tier), `${day}.jsonl`);

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** The days a tier holds a file of, oldest first: none before any is written. */
export const days = (home: string, tier: Tier): string[] => {
  let names: string[];
  try {
    names = fs.readdirSync(tierDir(home, tier));
  } catch {
    return [];
  }
  return names.flatMap((name) => DAY_FILE.exec(name)?.slice(1, 2) ?? []).sort();
};

/**
 * Lines appended to their days' files of `tier`. Refuses as `Invalid` a line labelled by a key outside `SERIES_LABEL_KEYS`, writing
 * none.
 */
export const appendLines = (home: string, tier: Tier, lines: readonly RollupLine[]): void => {
  for (const line of lines) {
    const strange = strangeLabels(line.l);
    if (strange.length)
      throw new Invalid({
        message: `A series line may not be labelled ${strange.join(', ')}: its labels are ${SERIES_LABEL_KEYS.join(', ')}. A run's own detail stays in its record.`,
      });
  }
  if (!lines.length) return;
  fs.mkdirSync(tierDir(home, tier), { recursive: true });
  const byDay = new Map<string, string[]>();
  for (const line of lines) byDay.set(dayOf(line.t), [...(byDay.get(dayOf(line.t)) ?? []), `${JSON.stringify(line)}\n`]);
  for (const [day, texts] of byDay) fs.appendFileSync(dayFile(home, tier, day), texts.join(''));
};

/** A label's free name. */
const named = Schema.optionalKey(Schema.String);

/**
 * A line as the files hold it: its labels each a string, but a `phase`, `part` and `kind` each a word of its closed set — a phase under
 * its former word too (`FORMER_PHASES`), which `linesIn` reads as today's.
 */
const isLine = Schema.is(
  Schema.Struct({
    t: Schema.String,
    s: Schema.String,
    l: Schema.Struct({
      factory: named,
      workflow: named,
      step: named,
      agent: named,
      phase: Schema.optionalKey(Schema.Literals([...PHASES, ...FORMER_PHASE_WORDS])),
      harness: named,
      window: named,
      part: Schema.optionalKey(Schema.Literals(DISK_PARTS)),
      kind: Schema.optionalKey(Schema.Literals(ALL_KINDS)),
    }),
    n: Schema.Finite,
    sum: Schema.Finite,
    min: Schema.Finite,
    max: Schema.Finite,
    last: Schema.Finite,
    b: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.Finite))),
    p50: Schema.optionalKey(Schema.Finite),
    p95: Schema.optionalKey(Schema.Finite),
  }),
);

/** The lines `text` holds, and how many of its lines do not read as one. */
const linesIn = (text: string): { lines: RollupLine[]; unread: number } => {
  const lines: RollupLine[] = [];
  let unread = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined;
    }
    if (!isLine(value)) unread++;
    else {
      const { phase, ...l } = value.l;
      lines.push({ ...value, l: phase === undefined ? l : { ...l, phase: isPhase(phase) ? phase : FORMER_PHASES[phase] } });
    }
  }
  return { lines, unread };
};

/** The bytes the tail read takes: many lines longer than a histogram's. */
const TAIL = 16_384;

/** The last line of `tier`'s latest day, read off the file's tail alone; undefined where none reads. */
export const lastLine = (home: string, tier: Tier): RollupLine | undefined => {
  const day = days(home, tier).at(-1);
  if (!day) return undefined;
  let fd: number | undefined;
  try {
    fd = fs.openSync(dayFile(home, tier, day), 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TAIL);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    countRead(length);
    return linesIn(
      buf
        .toString('utf8')
        .split('\n')
        .slice(size > length ? 1 : 0)
        .join('\n'),
    ).lines.at(-1);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

/** A tier's day as it reads: its lines, a line that does not read as one left out and the file said once on stderr; none for no file. */
export const readDay = (home: string, tier: Tier, day: string): RollupLine[] => {
  let text: string;
  try {
    text = fs.readFileSync(dayFile(home, tier, day), 'utf8');
  } catch {
    return [];
  }
  countRead(Buffer.byteLength(text));
  const { lines, unread } = linesIn(text);
  if (unread)
    process.stderr.write(`${dayFile(home, tier, day)}: ${unread} of its lines did not read as a series line and were left out.\n`);
  return lines;
};

/** What a day's file is now, its size and time of change, to tell a memo it moved; undefined for no file. */
export const dayStamp = (home: string, tier: Tier, day: string): string | undefined => {
  try {
    const st = fs.statSync(dayFile(home, tier, day));
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return undefined;
  }
};

/** A tier's day deleted; nothing for one that is gone. */
export const dropDay = (home: string, tier: Tier, day: string): void => fs.rmSync(dayFile(home, tier, day), { force: true });

/**
 * The series kept on a pass at `now`, from the passes the ring holds after it (`ring`, oldest first): the minutes due rolled and appended,
 * then the hours due rolled from the minute files, then each tier's days past its retention deleted (`WF_METRICS_MINUTE_DAYS`,
 * `WF_METRICS_HOUR_DAYS`). Throws what a read or a write threw, a retention refused among them: the tick's to say, never to stop on.
 */
export const keepSeries = (home: string, ring: readonly RecentPass[], config: Settings, now: number = Date.now()): void => {
  const lastMinute = lastLine(home, 'minute')?.t;
  appendLines(home, 'minute', rollMinutes(ring, minutesDue(ring, lastMinute, now, RECENT_KEPT)));
  const due = hoursDue(lastMinute, lastLine(home, 'hour')?.t, now);
  if (due) {
    const from = due.after === undefined ? '' : dayOf(due.after);
    const minutes = days(home, 'minute')
      .filter((d) => d >= from && d <= dayOf(due.before))
      .flatMap((d) => readDay(home, 'minute', d));
    appendLines(home, 'hour', rollHours(minutes, due));
  }
  for (const day of daysPast(days(home, 'minute'), now, config.metricsMinuteDays)) dropDay(home, 'minute', day);
  for (const day of daysPast(days(home, 'hour'), now, config.metricsHourDays)) dropDay(home, 'hour', day);
};

/** A tier's day, answered from `memo` while its file has not moved since it was read, and read again once it has. */
const dayLines = (home: string, tier: Tier, day: string, memo: SeriesMemo | undefined): RollupLine[] => {
  if (!memo) return readDay(home, tier, day);
  const key = `${tier}/${day}`;
  const stamp = dayStamp(home, tier, day);
  const held = memo.get(key);
  if (stamp !== undefined && held?.stamp === stamp) return held.lines;
  const lines = readDay(home, tier, day);
  if (stamp === undefined) memo.delete(key);
  else memo.set(key, { stamp, lines });
  return lines;
};

/**
 * The lines of a tier's `wanted` days, each day from `memo` where it holds it unmoved (`dayLines`); first, every day of the tier the memo
 * holds that is no longer among those it may keep at `now` (`memoDays` of `onDisk`, the days the tier holds a file of) is dropped from it:
 * a day leaves by age or with its file, never because this read did not want it, and the other tier's days stay.
 */
const linesOf = (
  home: string,
  tier: Tier,
  wanted: readonly string[],
  onDisk: readonly string[],
  now: number,
  memo: SeriesMemo | undefined,
): RollupLine[] => {
  if (memo) {
    const keep = new Set(memoDays(tier, onDisk, now));
    for (const key of memo.keys()) if (key.startsWith(`${tier}/`) && !keep.has(key.slice(tier.length + 1))) memo.delete(key);
  }
  return wanted.flatMap((d) => dayLines(home, tier, d, memo));
};

/** What `--range` takes, as its refusal says it. */
export const RANGE_TAKES = `--range takes ${Object.keys(RANGES).join(', ')}: nemia series --range 7d`;

/** The range `text` names, `24h` when none is given. Refuses as `Invalid` a range that is not one of `RANGES`. */
export const rangeOf = (text: string | undefined): keyof typeof RANGES => {
  if (text === undefined) return '24h';
  if (!isRange(text)) throw new Invalid({ message: `${RANGE_TAKES}, not ${JSON.stringify(text)}.` });
  return text;
};

/** The series over `range` (`rangeOf`) at `now`, read off its tier's days, from `memo` where one is handed (`linesOf`). Writes nothing. */
export const seriesRead = (home: string, range: string | undefined, memo?: SeriesMemo, now: number = Date.now()): SeriesRead => {
  const r = rangeOf(range);
  const tier = RANGES[r].tier;
  const onDisk = days(home, tier);
  return seriesOf(r, linesOf(home, tier, daysOfRange(r, onDisk, now), onDisk, now, memo), now);
};

/**
 * The system's health over the UTC days from `from` (every day kept, for null) to `to`, both included, read off the hour lines at `now`,
 * from `memo` where one is handed (`linesOf`): each figure null where nothing was kept.
 */
export const seriesHealth = (home: string, from: string | null, to: string, memo?: SeriesMemo, now: number = Date.now()): Health => {
  const onDisk = days(home, 'hour');
  return healthOf(
    linesOf(
      home,
      'hour',
      onDisk.filter((d) => (from === null || d >= from) && d <= to),
      onDisk,
      now,
      memo,
    ),
  );
};
