/**
 * The orchestrator's entity-relation printer: an `erDiagram` drawn from the model's schemas, so the picture is the code's.
 */
import type { Schema } from 'effect';

/** A layer's model, as the printer reads it. */
export interface ErModel {
  /** Each entity a Struct schema annotated with its `identifier`, drawn in this order. */
  readonly entities: ReadonlyArray<Schema.Top>;
  /** Each id's name → the entity it identifies (`{ RunId: 'Run' }`). An id met on a field but named nowhere here is another layer's. */
  readonly ids: Readonly<Record<string, string>>;
}
