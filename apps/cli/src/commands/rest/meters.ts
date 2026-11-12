/**
 * What the tick costs, as the api keeps it: `nemia passes [--last <n>] [--json]` (`server.passes`), the recent passes, a histogram of
 * their times and where the time went phase by phase; and `nemia series [--range <r>] [--json]` (`server.series`), the system's series
 * over a range. Each prints the whole answer as JSON with `--json`, else in words.
 */
import { type Args, PASSES_WORDS, type PassesRead, SERIES_WORDS, type SeriesRead } from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';

/** A time in milliseconds as a pass's line says it: whole from 100, one decimal from 10, two below. */
const msWord = (ms: number): string => (ms >= 100 ? `${Math.round(ms)}` : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));

/** `n` of a thing, its plural past one. */
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A bucket's bound as a person reads it: `≤ 100 ms`, and `> 5000 ms` for the last. */
const bucketWord = (b: PassesRead['histogram'][number], bounds: readonly number[]): string =>
  b.le === null ? `> ${bounds.at(-1)} ms` : `≤ ${b.le} ms`;

/** `nemia passes`' lines: the summary, the histogram a row a bucket from the first to the last with passes, and the parts. */
export const passesLines = ({ recent, histogram, parts, summary, bounds }: PassesRead): string[] => {
  const [oldest] = recent;
  if (!summary || !oldest) return ['no pass is kept yet: nemia up, or the api, ticks the store and keeps its last passes'];
  const first = histogram.findIndex((b) => b.count > 0);
  const last = histogram.length - 1 - [...histogram].reverse().findIndex((b) => b.count > 0);
  const most = Math.max(...histogram.map((b) => b.count));
  const width = Math.max(...histogram.map((b) => bucketWord(b, bounds).length));
  return [
    `${plural(summary.passes, 'pass', 'passes')} since ${oldest.at}: ${msWord(summary.medianMs)} ms a pass (median), slowest ${msWord(summary.slowestMs)}`,
    `the last pass: ${plural(summary.runs, 'run')} in the store, ${plural(summary.reads, 'journal read')}, ` +
      `${plural(summary.tasks, 'task')} not settled, ${summary.queued} queued, ${summary.admitted} admitted`,
    'passes by time:',
    ...histogram
      .slice(first, last + 1)
      .map((b) => `  ${bucketWord(b, bounds).padStart(width)}  ${'#'.repeat(Math.ceil((b.count / most) * 30))} ${b.count}`),
    'where the time went, a pass on average:',
    ...parts.map((p) => `  ${p.phase.padEnd(8)} ${msWord(p.ms).padStart(7)} ms  ${Math.round(p.share * 100)}%`),
  ];
};

/** The label keys a series line may carry, in the order a line says them. */
const SERIES_LABEL_KEYS = ['factory', 'workflow', 'step', 'agent', 'phase', 'harness', 'window', 'part', 'kind'] as const;

/** A value as a series' line says it: whole from 100, else two decimals. */
const round = (v: number): string => (Math.abs(v) >= 100 ? `${Math.round(v)}` : v.toFixed(2));

/** A label set as a person reads it: `phase=place`, nothing for none; a key no line carries is left out. */
const labelWords = (l: Readonly<Record<string, string>>): string =>
  SERIES_LABEL_KEYS.filter((k) => l[k] !== undefined)
    .map((k) => `${k}=${l[k]}`)
    .join(' ');

/** `nemia series`' lines: the range, then a line a series and label set, its points' count, and its latest and highest. */
export const seriesLines = (read: SeriesRead): string[] =>
  read.series.length
    ? [
        `${read.range}, a point a ${read.span}, from ${read.from} to ${read.to}:`,
        ...read.series.flatMap(({ s, l, points }) => {
          const latest = points.at(-1);
          if (latest === undefined) return [];
          const top = Math.max(...points.map((p) => p.max));
          return `  ${[s, labelWords(l)].filter(Boolean).join(' ')}: ${points.length} points, latest ${round(latest.p95 ?? latest.last)}, highest ${round(top)}`;
        }),
      ]
    : [`nothing is kept for ${read.range} yet: nemia up, or the api, ticks the store and keeps its series a minute at a time`];

/** The answer as `--json` prints it: the whole of it, indented. */
const jsonLines = (answer: unknown): string[] => [JSON.stringify(answer, null, 2)];

/** `nemia passes`' runner: the recent passes, the last `--last` of them where given. */
export async function passes(args: Args): Promise<number> {
  const last = textArg(args, 'last');
  const read = await asked(PASSES_WORDS.name, (c) => c.server.passes({ query: last === undefined ? {} : { last } }));
  said(switchArg(args, 'json') ? jsonLines(read) : passesLines(read));
  return 0;
}

/** `nemia series`' runner: the system's series over `--range`, 24h where none is given. */
export async function series(args: Args): Promise<number> {
  const range = textArg(args, 'range');
  const read = await asked(SERIES_WORDS.name, (c) => c.server.series({ query: range === undefined ? {} : { range } }));
  said(switchArg(args, 'json') ? jsonLines(read) : seriesLines(read));
  return 0;
}
