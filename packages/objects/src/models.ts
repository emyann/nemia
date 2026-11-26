/**
 * `GET /api/models`: the models each harness lists for a session, by canonical id, as the daemon last recorded what the harness itself
 * answered. A harness the daemon has recorded nothing for, or that lists none, is absent: a model named for it is not checked.
 */
import { Schema } from 'effect';

const OrNull = <S extends Schema.Top>(s: S, description: string) => Schema.NullOr(s).annotate({ description });

/** One model a harness lists, by its canonical id. */
export const ListedModelRead = Schema.Struct({
  id: Schema.String.annotate({ description: "The model's canonical id, the one an agent, a step or a card names it by." }),
  aliases: Schema.Array(Schema.String).annotate({ description: 'The other words that resolve to it, which are refused.' }),
  name: Schema.String.annotate({ description: "The harness's display name for the model." }),
  keepsAuto: OrNull(Schema.Boolean, "Whether the model keeps the harness's auto mode; null where the harness does not say."),
  efforts: OrNull(Schema.Array(Schema.String), 'The effort levels the model takes; null where the harness does not say.'),
}).annotate({ identifier: 'ListedModel', description: 'A model its harness lists, by canonical id, with what the harness says of it.' });
export type ListedModelRead = typeof ListedModelRead.Type;

/** The models one harness listed, and when it was asked. */
export const HarnessModelList = Schema.Struct({
  harness: Schema.String.annotate({ description: "The harness's name." }),
  at: Schema.String.annotate({ description: 'When the daemon asked the harness, as an ISO 8601 time.' }),
  models: Schema.Array(ListedModelRead).annotate({ description: 'The models the harness listed, in its order.' }),
}).annotate({ identifier: 'HarnessModelList', description: 'The models one harness lists and when it was last asked.' });
export type HarnessModelList = typeof HarnessModelList.Type;

/** `GET /api/models`: every harness the daemon has recorded a list for. */
export const HarnessModels = Schema.Struct({
  harnesses: Schema.Array(HarnessModelList).annotate({ description: 'Each harness with a recorded list, in the order recorded.' }),
}).annotate({ identifier: 'HarnessModels', description: 'The models each harness lists for a session, as the daemon last recorded them.' });
export type HarnessModels = typeof HarnessModels.Type;
