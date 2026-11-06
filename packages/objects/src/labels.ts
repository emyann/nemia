/**
 * A person's labels on a run or a card, Kubernetes' `map[string]string`, an edit of them in kubectl's words and what it answers
 * (`Labels`, `LabelEdit`, `Labelled`).
 */
import { Schema } from 'effect';

/** A person's labels: a key to its value, Kubernetes' `map[string]string`. */
export const Labels = Schema.Record(Schema.String, Schema.String).annotate({ identifier: 'Labels' });

/**
 * An edit of a run's or a card's labels: kubectl's words, `key=value` to set and `key-` to remove, and whether a set may change a
 * value.
 */
export const LabelEdit = Schema.Struct({
  labels: Schema.Array(Schema.String),
  overwrite: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'LabelEdit' });
export type LabelEdit = typeof LabelEdit.Type;

/** What an edit did: the run or the card, by its name, its person labels after (`labels`) and before (`was`). */
export const Labelled = Schema.Struct({
  kind: Schema.Literals(['Run', 'Card']),
  name: Schema.String,
  labels: Labels,
  was: Labels,
}).annotate({ identifier: 'Labelled' });
export type Labelled = typeof Labelled.Type;
