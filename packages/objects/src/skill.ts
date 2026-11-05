/**
 * The Skill: a skill folder a factory's starts can find, served as an object in the factory's namespace. Its `spec` is what its SKILL.md
 * says: its title, description, tags and examples, whether it is loaded whole every turn (`preload`), and its instructions. Its `status`
 * is what Nemia reads of it: where it was found, its card entry or why it has none, what it costs a turn, the agents that give it, where
 * a builtin one is already found, the command that copies it, and its revision. Its other files are served by path alone (`SkillFiles`).
 *
 * Beside it, the body a write is sent (`SkillWrite`). Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CardSkill, SkillCost, WriteMeta, definitionStatus } from './definition.ts';

const Text = Schema.NullOr(Schema.String);
const Words = Schema.NullOr(Schema.Array(Schema.String));

/** A skill as its SKILL.md says it; a key unset is null or left out. */
export const SkillSpec = Schema.Struct({
  title: Schema.optionalKey(Text),
  description: Schema.optionalKey(Text),
  tags: Schema.optionalKey(Words),
  examples: Schema.optionalKey(Words),
  preload: Schema.optionalKey(Schema.Boolean),
  body: Schema.String,
});
export type SkillSpec = typeof SkillSpec.Type;

/** An agent that gives a skill: its place and its name. */
export const SkillUser = Schema.Struct({ from: Schema.Literals(['repo', 'yours']), name: Schema.String });

/** What Nemia reads of a skill; see the file's head. */
export const SkillStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String,
  entry: Schema.NullOr(CardSkill),
  error: Text,
  preload: Schema.Boolean,
  cost: Schema.NullOr(SkillCost),
  usedBy: Schema.Array(SkillUser),
  found: Schema.NullOr(Schema.Literals(['yours', 'repo'])),
  copyHint: Text,
});
export type SkillStatus = typeof SkillStatus.Type;

/** A skill, as an object. Where its SKILL.md does not read as a draft, `spec` is its body alone and `status.error` says why. */
export const Skill = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Skill'),
  metadata: ObjectMeta,
  spec: SkillSpec,
  status: SkillStatus,
});
export type Skill = typeof Skill.Type;

/** A page of a namespace's skills. */
export const SkillList = listOf('Skill', Skill);
export type SkillList = typeof SkillList.Type;

/**
 * A skill of yours made (`POST …/skills`, `metadata.name` its name) or written (`PUT …/skills/<name>`, `metadata.resourceVersion` the
 * version it was read at): its spec whole, or `preload` alone.
 */
export const SkillWrite = Schema.Union([
  Schema.Struct({ metadata: WriteMeta, spec: SkillSpec }),
  Schema.Struct({ metadata: WriteMeta, preload: Schema.Boolean }),
]);
export type SkillWrite = typeof SkillWrite.Type;

/** The files of a skill's folder, by their path in it: SKILL.md among them. */
export const SkillFiles = Schema.Struct({ paths: Schema.Array(Schema.String) });
export type SkillFiles = typeof SkillFiles.Type;
