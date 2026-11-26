/**
 * What a watch resumed from a revision asks of a run removed since: the namespace its record held, as a card's record says its own
 * (`cardHeld`). Pure.
 */
import { Option, Schema } from 'effect';
import { runNamespace } from '../run-list/run-list.ts';

/** A run's record as its value reads, its factory alone. */
const factoryIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ factory: Schema.optional(Schema.String) })));

/**
 * The namespace of the run as its record's value held it, or null where the value is no run record that reads: what a watch resumed from a
 * revision asks of a run removed since, to know whether the watcher held it.
 * @param value The value of the run's record (`/registry/runs/<id>`) as of the revision asked.
 */
export const runHeld = (value: string) => {
  const record = factoryIn(value);
  return Option.isNone(record) ? null : { namespace: runNamespace(record.value.factory) };
};
