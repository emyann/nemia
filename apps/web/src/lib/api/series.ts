/** The system's series (`GET /api/series`, the CLI's `series --json`): what the daemon kept of its passes, over a range. */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { pace } from '../feed.ts';
import { get } from './read.ts';

/** The ranges the api reads: a point a minute over the last day, an hour over 7 or 30 days, and a day over every one kept. */
export type SeriesRange = '24h' | '7d' | '30d' | 'all';

/** Mirrors the package's `SeriesPoint`: a span's start, and of its samples how many, their mean, least, most and last, and percentiles. */
export type SeriesPoint = { t: string; n: number; mean: number; min: number; max: number; last: number; p50?: number; p95?: number };

/** Mirrors the package's `SeriesRead`: a range, the span of its points, and each series and label set's points, oldest first. */
export type SeriesRead = {
  range: SeriesRange;
  span: 'minute' | 'hour' | 'day';
  from: string;
  to: string;
  series: Array<{ s: string; l: Record<string, string>; points: SeriesPoint[] }>;
};

/** Decodes a `SeriesRead`. */
const SeriesReadSchema = Schema.Struct({
  range: Schema.Literals(['24h', '7d', '30d', 'all']),
  span: Schema.Literals(['minute', 'hour', 'day']),
  from: Schema.String,
  to: Schema.String,
  series: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        s: Schema.String,
        l: Schema.Record(Schema.String, Schema.String),
        points: Schema.mutable(
          Schema.Array(
            Schema.Struct({
              t: Schema.String,
              n: Schema.Number,
              mean: Schema.Number,
              min: Schema.Number,
              max: Schema.Number,
              last: Schema.Number,
              p50: Schema.optionalKey(Schema.Number),
              p95: Schema.optionalKey(Schema.Number),
            }),
          ),
        ),
      }),
    ),
  ),
}) satisfies Schema.Schema<SeriesRead>;

/** The series over `range`, read again as the recent passes are: the Stats page's section on the system. */
export const seriesQuery = (range: SeriesRange) =>
  queryOptions({
    queryKey: ['series', range],
    queryFn: () => get(`/api/series?range=${range}`, SeriesReadSchema),
    refetchInterval: () => pace(60_000),
  });
