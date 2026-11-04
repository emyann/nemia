/**
 * A factory's harness settings as a Schema at the door (`HarnessSettings`), read by the factory model and the run's alike, so it is a file
 * of its own: `factory.model.ts` imports `record.model.ts`, and defining it there would make a cycle. Each struct keeps the keys it does
 * not name, as a decode would otherwise strip them, and refuses them by the one judgement (`harnessSettingsRefusal`): a key off the list
 * is refused, never dropped unseen.
 */
import { Schema } from 'effect';
import { harnessSettingsRefusal } from './harness-settings.ts';

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** How a session marks what it writes: `false`, or each mark of `commit`, `pr` and `sessionUrl`. */
const Attribution = Schema.Union([
  Schema.Boolean,
  Schema.StructWithRest(
    Schema.Struct({ commit: Schema.optional(Schema.String), pr: Schema.optional(Schema.String), sessionUrl: Schema.optional(Schema.Boolean) }),
    Rest,
  ),
]);

/** The Claude Code settings a factory names (`CLAUDE_FACTORY_SETTINGS`), each of its type. */
export const ClaudeFactorySettings = Schema.StructWithRest(
  Schema.Struct({
    attribution: Schema.optional(Attribution),
    includeGitInstructions: Schema.optional(Schema.Boolean),
    language: Schema.optional(Schema.String),
  }),
  Rest,
).annotate({ identifier: 'ClaudeFactorySettings' });

/** A factory's harness settings, by harness (`claude` alone), every key off the list refused. */
export const HarnessSettings = Schema.StructWithRest(Schema.Struct({ claude: Schema.optional(ClaudeFactorySettings) }), Rest)
  // No identifier: the model's diagram draws it as a field of the factory and of the run, not as an entity of its own.
  .check(Schema.makeFilter((settings) => harnessSettingsRefusal(settings, '<factory>') ?? true));
export type HarnessSettings = typeof HarnessSettings.Type;
