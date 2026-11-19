/** What the first card's cost line reads of `GET /api/stats`: one workflow's landed runs, their number, their mean cost and time. */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { Stats } from 'objects';
import type { LandedMeasure } from '../../../contracts/first-card.contract.ts';
import { decoded } from './read.ts';
import { call, read } from './objects.ts';

/**
 * The part of the stats the cost line reads. A copy that stays: `objects`' `Stats` carries `all` as JSON (the orchestrator's stats as
 * they print), so the board decodes the totals it draws from it.
 */
const LandedSchema = Schema.Struct({
  all: Schema.Struct({
    total: Schema.Struct({
      landed: Schema.NullOr(Schema.Number),
      costPerLanded: Schema.NullOr(Schema.Number),
      timePerLanded: Schema.NullOr(Schema.Number),
    }),
  }),
});

/**
 * What this store measured of the landed runs of `workflow`, every factory's, by the label every run carries (`workflow=<name>`).
 * @param workflow The workflow's name.
 */
export const workflowStatsQuery = (workflow: string) =>
  queryOptions({
    queryKey: ['stats', 'workflow', workflow],
    queryFn: (): Promise<LandedMeasure> =>
      call((c) => c.server.stats({ query: {} }), read(Stats, { selector: `workflow=${workflow}` })).then(
        (stats) => decoded('GET /api/stats', LandedSchema, stats).all.total,
      ),
  });
