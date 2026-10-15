/**
 * The system's series, the pure half: what a pass is sampled into (`samplesOf`), a minute's samples rolled into lines (`rollMinutes`),
 * lines merged into hours and days (`mergeLines`), which minutes and hours are due to roll (`minutesDue`, `hoursDue`), which days are past
 * their retention (`daysPast`), a range read into points (`seriesOf`), a period's health (`healthOf`), and the words `nemia series` says.
 * The files, and the passes that roll and prune them, are `series.store.ts`'s.
 *
 * A line is one series over one span: its start `t`, its series `s`, its labels `l`, how many samples `n`, their `sum`, `min`, `max` and
 * `last`, and for a histogram the counts of its buckets `b` with `p50` and `p95` — exact for a minute, to the bucket for a merged span.
 */
import { unreadByPart, type DiskReading } from '../disk/disk.ts';
import { PASS_BOUNDS, PHASES, READ_BOUNDS, type RecentPass } from '../meter/index.ts';

/** The labels a line may carry: bounded keys, never a run id. A run's own detail stays in its record. */
export const LABEL_KEYS = ['factory', 'workflow', 'step', 'agent', 'phase', 'harness', 'window', 'part', 'kind'] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];
export type Labels = Partial<Record<LabelKey, string>>;

/** The upper bounds of the machine's load per core. */
export const LOAD_BOUNDS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4];

/**
 * The series kept, each a gauge or a histogram over its bounds: a pass's time and each phase's (`phase`), its journal reads, the runs in
 * the store, the sessions queued and admitted, how long the oldest queued session has waited, the machine's load per core at a pass and at
 * a check's start (`factory`, `workflow`, `step`, `agent`), each harness's quota used, in percent, per `window`, and what the store takes
 * on the disk as the daemon's last sweep read it: the bytes of each `part`, by `factory` where the part is kept by run, the names of
 * each `part` that did not read, and the bytes free on the store's file system and its size.
 */
export const SERIES = {
  'pass.ms': { kind: 'histogram', bounds: PASS_BOUNDS },
  'pass.phase.ms': { kind: 'histogram', bounds: PASS_BOUNDS },
  'pass.reads': { kind: 'histogram', bounds: READ_BOUNDS },
  'store.runs': { kind: 'gauge' },
  'sessions.queued': { kind: 'gauge' },
  'sessions.admitted': { kind: 'gauge' },
  'admission.wait.ms': { kind: 'gauge' },
  'machine.load': { kind: 'histogram', bounds: LOAD_BOUNDS },
  'check.load': { kind: 'histogram', bounds: LOAD_BOUNDS },
  'quota.used': { kind: 'gauge' },
  'disk.bytes': { kind: 'gauge' },
  'disk.unread': { kind: 'gauge' },
  'disk.free': { kind: 'gauge' },
  'disk.size': { kind: 'gauge' },
} as const satisfies Record<string, { kind: 'gauge' } | { kind: 'histogram'; bounds: readonly number[] }>;
export type SeriesName = keyof typeof SERIES;

/** One sampled value of a series, with its labels. */
export type Sample = { s: SeriesName; l: Labels; v: number };

/** One series over one span (the file's head says each field). */
export type RollupLine = {
  t: string;
  s: string;
  l: Labels;
  n: number;
  sum: number;
  min: number;
  max: number;
  last: number;
  b?: number[];
  p50?: number;
  p95?: number;
};

/** The tiers kept on disk: a line a minute, and a line an hour. */
export const TIERS = ['minute', 'hour'] as const;
export type Tier = (typeof TIERS)[number];

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The start of the span of `size` ms that `ms` falls in, as ISO. */
const floorTo = (ms: number, size: number): string => new Date(Math.floor(ms / size) * size).toISOString();

/** The UTC day of an ISO time or a day: its file's name. */
export const dayOf = (t: string): string => t.slice(0, 10);

/** The label keys of `l` that are not `LABEL_KEYS`, in their order: none for a label set a line may carry. */
export const strangeLabels = (l: Record<string, unknown>): string[] =>
  Object.keys(l).filter((k) => !(LABEL_KEYS as readonly string[]).includes(k));

/**
 * What a reading of the store's disk is sampled into: the bytes of each entry that read, by its part, its kind and its factory where it
 * has one; each part's names that did not read, zero where all did; the bytes free and the size. An entry that did not read has no
 * sample of bytes, never a zero.
 */
const diskSamples = (disk: DiskReading): Sample[] => [
  ...disk.entries.flatMap((entry): Sample[] =>
    entry.bytes === undefined
      ? []
      : [
          {
            s: 'disk.bytes',
            l: {
              part: entry.part,
              ...(entry.kind === undefined ? {} : { kind: entry.kind }),
              ...(entry.factory === undefined ? {} : { factory: entry.factory }),
            },
            v: entry.bytes,
          },
        ],
  ),
  ...unreadByPart(disk.entries).map(({ part, unread }): Sample => ({ s: 'disk.unread', l: { part }, v: unread })),
  { s: 'disk.free', l: {}, v: disk.free },
  { s: 'disk.size', l: {}, v: disk.size },
];

/** What one kept pass is sampled into: every series it carries a figure of, none for a figure an older tick did not keep. */
export const samplesOf = (p: RecentPass): Sample[] => [
  { s: 'pass.ms', l: {}, v: p.ms },
  ...PHASES.map((phase): Sample => ({ s: 'pass.phase.ms', l: { phase }, v: p.phases[phase] })),
  { s: 'pass.reads', l: {}, v: p.reads },
  { s: 'store.runs', l: {}, v: p.runs },
  { s: 'sessions.queued', l: {}, v: p.queued },
  { s: 'sessions.admitted', l: {}, v: p.admitted },
  ...(p.waitMs === undefined ? [] : [{ s: 'admission.wait.ms', l: {}, v: p.waitMs } satisfies Sample]),
  ...(p.load === undefined ? [] : [{ s: 'machine.load', l: {}, v: p.load } satisfies Sample]),
  ...(p.load === undefined ? [] : (p.checks ?? []).map((l): Sample => ({ s: 'check.load', l, v: p.load! }))),
  ...Object.entries(p.quota ?? {}).flatMap(([harness, windows]) =>
    Object.entries(windows).map(([window, v]): Sample => ({ s: 'quota.used', l: { harness, window }, v })),
  ),
  ...(p.disk === undefined ? [] : diskSamples(p.disk)),
];

/** A series and its labels as one key, the labels in `LABEL_KEYS`' order. */
const keyOf = (s: string, l: Labels): string => JSON.stringify([s, ...LABEL_KEYS.map((k) => l[k] ?? null)]);

/** The bounds of a series, none for a gauge or a name not kept. */
const boundsOf = (s: string): readonly number[] | undefined => {
  const series = (SERIES as Record<string, { kind: string; bounds?: readonly number[] }>)[s];
  return series?.kind === 'histogram' ? series.bounds : undefined;
};

/** The value at `q` of sorted `values`, by nearest rank. */
const rank = (sorted: readonly number[], q: number): number => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/** The counts of `values` in the buckets of `bounds`, each in the first whose bound it does not pass, one past the last for the rest. */
export const bucketsOf = (values: readonly number[], bounds: readonly number[]): number[] => {
  const b = Array.from({ length: bounds.length + 1 }, () => 0);
  for (const v of values) {
    const at = bounds.findIndex((le) => v <= le);
    b[at < 0 ? bounds.length : at]++;
  }
  return b;
};

/** One line of `values` (in their order) over the span from `t`: exact percentiles and its buckets for a histogram. */
const lineOf = (t: string, s: string, l: Labels, values: readonly number[]): RollupLine => {
  const sorted = [...values].sort((a, b) => a - b);
  const bounds = boundsOf(s);
  return {
    t,
    s,
    l,
    n: values.length,
    sum: values.reduce((n, v) => n + v, 0),
    min: sorted[0],
    max: sorted.at(-1)!,
    last: values.at(-1)!,
    ...(bounds ? { b: bucketsOf(values, bounds), p50: rank(sorted, 0.5), p95: rank(sorted, 0.95) } : {}),
  };
};

/** `items` grouped by `key`, in the order each key was first met. */
const grouped = <T>(items: readonly T[], key: (item: T) => string): T[][] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.values()];
};

/** The passes of `ring` in the minutes `due`, rolled into a line per minute, series and label set, oldest minute first. */
export const rollMinutes = (ring: readonly RecentPass[], due: readonly string[]): RollupLine[] =>
  due.flatMap((minute) =>
    grouped(ring.filter((p) => floorTo(Date.parse(p.at), MINUTE) === minute).flatMap(samplesOf), (x) => keyOf(x.s, x.l)).map((xs) =>
      lineOf(
        minute,
        xs[0].s,
        xs[0].l,
        xs.map((x) => x.v),
      ),
    ),
  );

/**
 * The minutes of `ring` due to roll at `now`, oldest first: each a pass of the ring is in, after `last` (the last minute rolled, none
 * before any) and before the minute `now` is in, which is not done. With the ring full (`kept`), its first minute is left out, since the
 * passes before it that were in it are gone.
 */
export const minutesDue = (ring: readonly RecentPass[], last: string | undefined, now: number, kept: number): string[] => {
  const current = floorTo(now, MINUTE);
  const minutes = [...new Set(ring.map((p) => floorTo(Date.parse(p.at), MINUTE)))].sort();
  const partial = ring.length >= kept ? minutes[0] : undefined;
  return minutes.filter((m) => m !== partial && m < current && (last === undefined || m > last));
};

/**
 * The hours due to roll at `now`, given the last minute line kept before this pass rolled (`lastMinute`) and the last hour line
 * (`lastHour`): every whole hour after `lastHour` and before the hour `now` is in, once the hour of `lastMinute` is done and has no line.
 * Null while nothing is due, so a pass reads no minute file to learn there is none.
 */
export const hoursDue = (
  lastMinute: string | undefined,
  lastHour: string | undefined,
  now: number,
): { after: string | undefined; before: string } | null => {
  if (lastMinute === undefined) return null;
  const hour = floorTo(Date.parse(lastMinute), HOUR);
  const current = floorTo(now, HOUR);
  return hour < current && (lastHour === undefined || hour > lastHour) ? { after: lastHour, before: current } : null;
};

/** The value at `q` of a merged line, from its buckets: interpolated inside the bucket it falls in, within its `min` and `max`. */
export const percentileOf = (b: readonly number[], bounds: readonly number[], min: number, max: number, q: number): number => {
  const n = b.reduce((x, y) => x + y, 0);
  const target = q * n;
  let below = 0;
  for (let k = 0; k < b.length; k++) {
    if (b[k] > 0 && below + b[k] >= target) {
      const lo = Math.max(min, k > 0 ? bounds[k - 1] : min);
      const hi = Math.min(max, k < bounds.length ? bounds[k] : max);
      return lo + (hi - lo) * Math.min(1, Math.max(0, (target - below) / b[k]));
    }
    below += b[k];
  }
  return max;
};

/** Lines of one series and label set merged into one over the span from `t`: counts and sums added, extremes folded, buckets added. */
const merged = (t: string, lines: readonly RollupLine[]): RollupLine => {
  const [first] = lines;
  const min = Math.min(...lines.map((x) => x.min));
  const max = Math.max(...lines.map((x) => x.max));
  const bounds = boundsOf(first.s);
  const buckets =
    bounds && lines.every((x) => x.b?.length === bounds.length + 1)
      ? Array.from({ length: bounds.length + 1 }, (_, k) => lines.reduce((n, x) => n + x.b![k], 0))
      : undefined;
  return {
    t,
    s: first.s,
    l: first.l,
    n: lines.reduce((n, x) => n + x.n, 0),
    sum: lines.reduce((n, x) => n + x.sum, 0),
    min,
    max,
    last: lines.at(-1)!.last,
    ...(bounds && buckets
      ? { b: buckets, p50: percentileOf(buckets, bounds, min, max, 0.5), p95: percentileOf(buckets, bounds, min, max, 0.95) }
      : {}),
  };
};

/** `lines` merged into spans of `size` ms (an hour, a day), a line per span, series and label set, in the order they are met. */
export const mergeLines = (lines: readonly RollupLine[], size: number): RollupLine[] =>
  grouped(lines, (x) => `${floorTo(Date.parse(x.t), size)}${keyOf(x.s, x.l)}`).map((xs) => merged(floorTo(Date.parse(xs[0].t), size), xs));

/** The minute lines of the hours `due`: merged into an hour a line, after `due.after` and before `due.before`. */
export const rollHours = (minutes: readonly RollupLine[], due: { after: string | undefined; before: string }): RollupLine[] =>
  mergeLines(
    minutes.filter((x) => x.t < due.before && (due.after === undefined || floorTo(Date.parse(x.t), HOUR) > due.after)),
    HOUR,
  );

/** The days of `days` past a retention of `keep` days at `now`: before the day `keep` days back. None when `keep` is undefined. */
export const daysPast = (days: readonly string[], now: number, keep: number | undefined): string[] => {
  if (keep === undefined) return [];
  const oldest = dayOf(new Date(Date.parse(dayOf(new Date(now).toISOString())) - keep * DAY).toISOString());
  return days.filter((d) => d < oldest);
};

/** The ranges a read takes, each with how far back it reaches, the tier it reads and the span of a point. */
export const RANGES = {
  '24h': { back: DAY, tier: 'minute', span: MINUTE },
  '7d': { back: 7 * DAY, tier: 'hour', span: HOUR },
  '30d': { back: 30 * DAY, tier: 'hour', span: HOUR },
  all: { back: Infinity, tier: 'hour', span: DAY },
} as const satisfies Record<string, { back: number; tier: Tier; span: number }>;
export type Range = keyof typeof RANGES;

/** Whether `text` names a range. */
export const isRange = (text: string): text is Range => Object.hasOwn(RANGES, text);

/** The days of `days` a reach of `back` milliseconds at `now` reads, oldest first: every one for an endless reach. */
const daysBack = (back: number, days: readonly string[], now: number): string[] =>
  Number.isFinite(back) ? days.filter((d) => d >= dayOf(new Date(now - back).toISOString())) : [...days];

/** The days a range reads at `now`, oldest first, of those its tier holds: every one for `all`. */
export const daysOfRange = (range: Range, days: readonly string[], now: number): string[] => daysBack(RANGES[range].back, days, now);

/**
 * The days of `tier` a memo may keep at `now`, of those its tier holds (`days`): the ones its widest range reaches (`RANGES`), so a day
 * leaves by age alone. Every hour day, since `all` reaches back without end, as a period's health does; the minute days of the last 24h.
 */
export const memoDays = (tier: Tier, days: readonly string[], now: number): string[] =>
  daysBack(Math.max(...Object.values(RANGES).flatMap((r) => (r.tier === tier ? [r.back] : []))), days, now);

/** One point of a series: its span's start, and of the samples in it how many, their mean, least, most and last, and its percentiles. */
export type SeriesPoint = { t: string; n: number; mean: number; min: number; max: number; last: number; p50?: number; p95?: number };

/** What `nemia series` and `GET /api/series` answer: a range, the span of its points, and each series and label set's points in time. */
export type SeriesRead = {
  range: Range;
  span: 'minute' | 'hour' | 'day';
  from: string;
  to: string;
  series: Array<{ s: string; l: Labels; points: SeriesPoint[] }>;
};

const SPAN_WORD = { [MINUTE]: 'minute', [HOUR]: 'hour', [DAY]: 'day' } as Record<number, SeriesRead['span']>;

/** A line as a point. */
const pointOf = (x: RollupLine): SeriesPoint => ({
  t: x.t,
  n: x.n,
  mean: x.n ? x.sum / x.n : 0,
  min: x.min,
  max: x.max,
  last: x.last,
  ...(x.p50 === undefined ? {} : { p50: x.p50, p95: x.p95 }),
});

/** The read of `range` at `now` from the lines of its tier's days: those in the range, merged to its span, a series per label set. */
export const seriesOf = (range: Range, lines: readonly RollupLine[], now: number): SeriesRead => {
  const { back, span } = RANGES[range];
  const from = Number.isFinite(back) ? new Date(now - back).toISOString() : (lines[0]?.t ?? new Date(now).toISOString());
  const inRange = lines.filter((x) => x.t >= from).sort((a, b) => a.t.localeCompare(b.t));
  const points = span === DAY ? mergeLines(inRange, DAY) : inRange;
  return {
    range,
    span: SPAN_WORD[span],
    from,
    to: new Date(now).toISOString(),
    series: grouped(points, (x) => keyOf(x.s, x.l)).map((xs) => ({ s: xs[0].s, l: xs[0].l, points: xs.map(pointOf) })),
  };
};

/** A figure of a period's health: null where nothing was kept. */
type Figure = number | null;

/**
 * The system's health over a period, from its hour lines: a pass's time (p50, p95), the most runs in the store, journal reads a pass (p95),
 * the machine's load per core (p95, max), the most sessions queued and the longest a queued session waited, the load at a check's start
 * (p50), and each harness's quota window, its latest and its peak use.
 */
export type Health = {
  pass: { p50: Figure; p95: Figure };
  runs: Figure;
  reads: Figure;
  load: { p95: Figure; max: Figure };
  queued: Figure;
  waitMs: Figure;
  checkLoad: Figure;
  quota: Array<{ harness: string; window: string; latest: number; peak: number }>;
};

/** The lines of one series, every label set, merged into one, or none. */
const whole = (lines: readonly RollupLine[], s: SeriesName): RollupLine | undefined => {
  const of = lines.filter((x) => x.s === s);
  return of.length
    ? merged(
        of[0].t,
        of.map((x) => ({ ...x, l: {} })),
      )
    : undefined;
};

/** The period's health (`Health`) from its lines, oldest first. */
export const healthOf = (lines: readonly RollupLine[]): Health => {
  const pass = whole(lines, 'pass.ms');
  const load = whole(lines, 'machine.load');
  return {
    pass: { p50: pass?.p50 ?? null, p95: pass?.p95 ?? null },
    runs: whole(lines, 'store.runs')?.max ?? null,
    reads: whole(lines, 'pass.reads')?.p95 ?? null,
    load: { p95: load?.p95 ?? null, max: load?.max ?? null },
    queued: whole(lines, 'sessions.queued')?.max ?? null,
    waitMs: whole(lines, 'admission.wait.ms')?.max ?? null,
    checkLoad: whole(lines, 'check.load')?.p50 ?? null,
    quota: grouped(
      lines.filter((x) => x.s === 'quota.used'),
      (x) => keyOf(x.s, x.l),
    ).map((xs) => ({
      harness: xs[0].l.harness ?? '',
      window: xs[0].l.window ?? '',
      latest: xs.at(-1)!.last,
      peak: Math.max(...xs.map((x) => x.max)),
    })),
  };
};

const round = (v: number): string => (Math.abs(v) >= 100 ? `${Math.round(v)}` : v.toFixed(2));

/** A label set as a person reads it: `phase=place`, nothing for none. */
const labelWords = (l: Labels): string =>
  LABEL_KEYS.filter((k) => l[k] !== undefined)
    .map((k) => `${k}=${l[k]}`)
    .join(' ');

/** `nemia series`' lines: the range, then a line a series and label set, its points' count, and its latest and highest. */
export const seriesLines = (read: SeriesRead): string[] =>
  read.series.length
    ? [
        `${read.range}, a point a ${read.span}, from ${read.from} to ${read.to}:`,
        ...read.series.map(({ s, l, points }) => {
          const latest = points.at(-1)!;
          const top = Math.max(...points.map((p) => p.max));
          return `  ${[s, labelWords(l)].filter(Boolean).join(' ')}: ${points.length} points, latest ${round(latest.p95 ?? latest.last)}, highest ${round(top)}`;
        }),
      ]
    : [`nothing is kept for ${read.range} yet: nemia up, or the api, ticks the store and keeps its series a minute at a time`];

/**
 * What a process that serves keeps of the series' days between reads: each day's lines, while the day's file stands as it was read and a
 * read of its tier can reach it (`memoDays`), whichever read came last.
 */
export type SeriesMemo = Map<string, { stamp: string; lines: RollupLine[] }>;

/** A memo with nothing kept. */
export const seriesMemo = (): SeriesMemo => new Map();
