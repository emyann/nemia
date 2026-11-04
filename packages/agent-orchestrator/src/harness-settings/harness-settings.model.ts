/**
 * A factory's harness settings as a Schema at the door (`HarnessSettings`), read by the factory model and the run's alike, so it is a file
 * of its own: `factory.model.ts` imports `record.model.ts`, and defining it there would make a cycle. A record of records, so a decode
 * keeps every key a person wrote, and judged whole by the one judgement (`harnessSettingsRefusal`): a key off the list, or a value of the
 * wrong type, is refused, never dropped unseen as a struct would drop a key it does not name.
 */
import { Schema } from 'effect';
import { harnessSettingsRefusal } from './harness-settings.ts';

/**
 * A factory's harness settings, by harness (the default one alone), every key off the list and every value of the wrong type refused. No
 * identifier: the model's diagram draws it as a field of the factory and of the run, not as an entity of its own.
 */
export const HarnessSettings = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)).check(
  Schema.makeFilter((settings) => harnessSettingsRefusal(settings, '<factory>') ?? true),
);
