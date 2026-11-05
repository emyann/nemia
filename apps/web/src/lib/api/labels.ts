/** A run's and a card's labels: the two writes that edit them (apps/api's label routes), and what the label page reads. */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get, send } from './read.ts';
import { selectorKey, withSelector } from './selector.ts';
import { Labelled } from 'objects';
import { cards, namespaceOf } from './objects.ts';

/** A label map: a key, its value. */
export type Labels = Record<string, string>;

/** The keys the store sets on every run, shown and never edited (`CLOSED_LABEL_KEYS` in the orchestrator). */
export const CLOSED_LABEL_KEYS: readonly string[] = ['factory', 'workflow'];

/** Edits `id`'s labels by `edits` (`key=value`, `key-`), as the CLI's label verb for a run does; a changed value needs `overwrite`. */
export const labelRun = (id: string, edits: readonly string[], overwrite = false): Promise<Labelled> =>
  send('POST', `/api/runs/${encodeURIComponent(id)}/labels`, Labelled, {
    body: { labels: edits, overwrite },
    may: 'The labels may be set: read the run again before sending it again.',
  });

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
    queryFn: (): Promise<LabelStats> => get(withSelector('/api/stats', selector), LabelStatsSchema),
  });

/** The address' label filter, `?l=<selector>`, kept where it says something. */
export const labelSearch = (search: Record<string, unknown>): { l?: string } =>
  typeof search.l === 'string' && search.l.trim() !== '' ? { l: search.l } : {};
