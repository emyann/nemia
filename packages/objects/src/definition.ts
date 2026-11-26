/**
 * What the three definitions — the Workflow, the Agent and the Skill — share: where one was read from (`origin`) and the origin that
 * shadows it in its namespace, and the A2A card entry a skill gives. Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { describedNumber } from './meta.ts';
import { DEFINITION_ORIGINS } from './words.ts';

/** One of `DEFINITION_ORIGINS`. */
export const Origin = Schema.Literals(DEFINITION_ORIGINS);

/**
 * Where a definition is read from, and what the namespace does with it: `origin`; `shadowedBy`, the origin that holds its name first in
 * the namespace, absent where none does (the definition is the one the namespace resolves).
 */
export const definitionStatus = {
  origin: Origin.annotate({ description: "Where it was read from: the factory, the repository, the person's library or a builtin." }),
  shadowedBy: Schema.optionalKey(
    Origin.annotate({ description: 'The origin that holds its name first in the namespace; absent where none does.' }),
  ),
  factories: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        "On a library definition read at the store's level, the factories that use it: each that has added it or fills a step with it.",
    }),
  ),
  builtinChanged: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "On the person's copy of a builtin, true where the builtin has changed since the copy was made; absent otherwise.",
    }),
  ),
};

/** A skill as an A2A Agent Card entry: what a card says an agent can do. */
export const CardSkill = Schema.Struct({
  id: Schema.String.annotate({ description: "The skill's id." }),
  name: Schema.String.annotate({ description: "The skill's name." }),
  description: Schema.String.annotate({ description: 'What the skill does, as the card says it.' }),
  tags: Schema.Array(Schema.String).annotate({ description: "The skill's tags." }),
  examples: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'Examples of what to ask it.' })),
  inputModes: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The media types it takes in.' })),
  outputModes: Schema.optionalKey(Schema.Array(Schema.String).annotate({ description: 'The media types it gives back.' })),
});
export type CardSkill = typeof CardSkill.Type;

/** What a skill costs a turn, about: whether it is loaded whole, and its listing, its body and a turn's cost, in tokens. */
export const SkillCost = Schema.Struct({
  preload: Schema.Boolean.annotate({ description: 'Whether the skill is loaded whole every turn.' }),
  listed: describedNumber("The cost of the skill's listing, in tokens."),
  body: describedNumber("The cost of the skill's body, in tokens."),
  perTurn: describedNumber('What every turn carries: the listing, and the body too when it is preloaded, in tokens.'),
});
export type SkillCost = typeof SkillCost.Type;

/** The metadata a write hands back: the `resourceVersion` it read, which the write is refused on where the files hold another. */
export const WriteMeta = Schema.Struct({
  name: Schema.optionalKey(Schema.String.annotate({ description: 'The name of the object written.' })),
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The resourceVersion the write read, which the write is refused on where the files hold another.',
    }),
  ),
}).annotate({ description: 'The metadata a write hands back: its name and the resourceVersion it read.' });
export type WriteMeta = typeof WriteMeta.Type;
