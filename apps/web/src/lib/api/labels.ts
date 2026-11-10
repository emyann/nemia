/** A run's and a card's labels: the two writes that edit them (apps/api's label routes), and what the label page reads. */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decoded } from './read.ts';
import { selectorKey } from './selector.ts';
import { Labelled, Stats } from 'objects';
import { call, cards, read, runs } from './objects.ts';
import { namespaceOf } from './namespace.ts';

/** A label map: a key, its value. */
export type Labels = Record<string, string>;

/** The keys the store sets on every run, shown and never edited (`CLOSED_LABEL_KEYS` in the orchestrator). */
export const CLOSED_LABEL_KEYS: readonly string[] = ['factory', 'workflow'];

/**
 * Edits `id`'s labels by `edits` (`key=value`, `key-`), as the CLI's label verb for a run does: the Run's `labels` action, in the run's
 * namespace (`namespaceOf`). A changed value needs `overwrite`.
 */
export const labelRun = (namespace: string, id: string, edits: readonly string[], overwrite = false): Promise<Labelled> =>
  runs.labels(namespace, id, { labels: edits, overwrite }, 'The labels may be set: read the run again before sending it again.');

/** Edits `card`'s labels by `edits`, as the CLI's label verb for a card does: the Card's `labels` verb, in the card's namespace. */
export const labelCard = (card: { name: string; factory: string | null }, edits: readonly string[], overwrite = false): Promise<Labelled> =>
  cards.labels(namespaceOf(card.factory), card.name, { labels: edits, overwrite });

/**
 * What the label page reads of `GET /api/stats`: the headline of every run the selector takes, and each step's cost summed over every
 * try of those runs, landed, failed, stopped or in flight, over every day the stats hold (no range asked: from the first fact's day).
 */
export type LabelStats = {
  all: {
    total: { runs: number; landed: number | null; costPerLanded: number | null };
    steps: readonly { costUsd: number | null }[];
  };
};

/**
 * The part of the stats the label page reads. A copy that stays: `objects`' `Stats` carries `all` as JSON (the orchestrator's stats as
 * they print), so the board decodes the totals it shows from it.
 */
const LabelStatsSchema = Schema.Struct({
  all: Schema.Struct({
    total: Schema.Struct({ runs: Schema.Number, landed: Schema.NullOr(Schema.Number), costPerLanded: Schema.NullOr(Schema.Number) }),
    steps: Schema.Array(Schema.Struct({ costUsd: Schema.NullOr(Schema.Number) })),
  }),
});

/** What the runs `stats` covers have spent, every try's cost summed, or null where no try's cost was measured. */
export const spentOf = (stats: LabelStats): number | null => {
  const known = stats.all.steps.flatMap((step) => (step.costUsd === null ? [] : [step.costUsd]));
  return known.length === 0 ? null : known.reduce((sum, cost) => sum + cost, 0);
};

/** The stats of the runs `selector` takes. */
export const labelStatsQuery = (selector: string) =>
  queryOptions({
    queryKey: ['stats', ...selectorKey(selector)],
    queryFn: (): Promise<LabelStats> =>
      call((c) => c.server.stats({ query: {} }), read(Stats, selector.trim() === '' ? undefined : { selector: selector.trim() })).then(
        (stats) => decoded('GET /api/stats', LabelStatsSchema, stats),
      ),
  });

/** The address' label filter, `?l=<selector>`, kept where it says something. */
export const labelSearch = (search: Record<string, unknown>): { l?: string } =>
  typeof search.l === 'string' && search.l.trim() !== '' ? { l: search.l } : {};
