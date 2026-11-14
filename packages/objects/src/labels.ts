/**
 * A person's labels on a run or a card, Kubernetes' `map[string]string`, an edit of them in kubectl's words and what it answers
 * (`Labels`, `LabelEdit`, `Labelled`).
 */
import { Schema } from 'effect';

/** A person's labels: a key to its value, Kubernetes' `map[string]string`. */
export const Labels = Schema.Record(Schema.String, Schema.String).annotate({
  identifier: 'Labels',
  description: "A person's labels, each a key to its value: what -l key=value finds a run or a card by.",
});

/**
 * An edit of a run's or a card's labels: kubectl's words, `key=value` to set and `key-` to remove, and whether a set may change a
 * value.
 */
export const LabelEdit = Schema.Struct({
  labels: Schema.Array(Schema.String).annotate({
    description: "The edits, in kubectl's words: key=value to set a label, key- to remove one.",
  }),
  overwrite: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Whether a set may change a value the label already has (--overwrite); left out, it may not.' }),
  ),
}).annotate({ identifier: 'LabelEdit' });
export type LabelEdit = typeof LabelEdit.Type;

/** What an edit did: the run or the card, by its name, its person labels after (`labels`) and before (`was`). */
export const Labelled = Schema.Struct({
  kind: Schema.Literals(['Run', 'Card']).annotate({ description: 'What was labelled: a run or a card.' }),
  name: Schema.String.annotate({ description: "Its name: the run's id or the card's name." }),
  labels: Labels,
  was: Labels,
}).annotate({
  identifier: 'Labelled',
  description:
    'What an edit of labels did: the run or the card, by its name, and its person labels after the edit (labels) and before it (was).',
});
export type Labelled = typeof Labelled.Type;
