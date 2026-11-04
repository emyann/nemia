/**
 * A person's labels at the door, as Schemas: the map (`Labels`), an edit of it as the api is sent one (`LabelEdit`, the body of
 * `POST /api/runs/:runId/labels` and `POST /api/inbox/:name/labels`), and what such an edit answers (`Labelled`). Plain JSON, each named,
 * so the run's OpenAPI document (`runDocument`) carries them as components of their own. Its rules are `labels.ts`'s.
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
