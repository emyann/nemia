/**
 * What the three definitions — the Workflow, the Agent and the Skill — share: where one was read from (`origin`) and the origin that
 * shadows it in its namespace, the ledger's revision of it, and the A2A card entry a skill gives. Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { DEFINITION_ORIGINS } from './words.ts';

/** One of `DEFINITION_ORIGINS`. */
export const Origin = Schema.Literals(DEFINITION_ORIGINS);

/**
 * Where a definition is read from, and what the namespace does with it: `origin`; `shadowedBy`, the origin that holds its name first in
 * the namespace, absent where none does (the definition is the one the namespace resolves); and `revision`, the ledger's number for what
 * it holds now (decision 25), read without a write, absent where the ledger cannot number it.
 */
export const definitionStatus = {
  origin: Origin,
  shadowedBy: Schema.optionalKey(Origin),
  revision: Schema.optionalKey(Schema.Number),
};

/** A skill as an A2A Agent Card entry: what a card says an agent can do. */
export const CardSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  examples: Schema.optionalKey(Schema.Array(Schema.String)),
  inputModes: Schema.optionalKey(Schema.Array(Schema.String)),
  outputModes: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type CardSkill = typeof CardSkill.Type;

/** What a skill costs a turn, about: whether it is loaded whole, and its listing, its body and a turn's cost, in tokens. */
export const SkillCost = Schema.Struct({ preload: Schema.Boolean, listed: Schema.Number, body: Schema.Number, perTurn: Schema.Number });
export type SkillCost = typeof SkillCost.Type;

/** The metadata a write hands back: the `resourceVersion` it read, which the write is refused on where the files hold another. */
export const WriteMeta = Schema.Struct({ name: Schema.optionalKey(Schema.String), resourceVersion: Schema.optionalKey(Schema.String) });
export type WriteMeta = typeof WriteMeta.Type;
