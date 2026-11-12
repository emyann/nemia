/**
 * The Skill: a skill folder a factory's starts can find, served as an object in the factory's namespace. Its `spec` is what its SKILL.md
 * says: its title, description, tags and examples, whether it is loaded whole every turn (`preload`), and its instructions. Its `status`
 * is what Nemia reads of it: where it was found, its card entry or why it has none, what it costs a turn, the agents that give it, where
 * a builtin one is already found, the command that copies it, and its revision. Its other text files, at any depth in its folder, are in
 * its spec (`files`, where it has any); every file of its folder is served by path alone (`SkillFiles`).
 *
 * Beside it, the body a write is sent (`SkillWrite`). Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CardSkill, SkillCost, WriteMeta, definitionStatus } from './definition.ts';

const Text = Schema.NullOr(Schema.String);
const Words = Schema.NullOr(Schema.Array(Schema.String));

/**
 * A text file of a skill's folder beside its SKILL.md: its path in the folder, with `/`, at any depth, and its text. A file that is not
 * text — a picture — is never one.
 */
export const SkillFile = Schema.Struct({ path: Schema.String, text: Schema.String });
export type SkillFile = typeof SkillFile.Type;

/**
 * A skill as its SKILL.md says it; a key unset is null or left out. Its `files` are the folder's other text files, served where it holds
 * any; a write that gives them gives the whole set, so one left out is removed, and a file that is not text is never touched.
 */
export const SkillSpec = Schema.Struct({
  title: Schema.optionalKey(Text),
  description: Schema.optionalKey(Text),
  tags: Schema.optionalKey(Words),
  examples: Schema.optionalKey(Words),
  preload: Schema.optionalKey(Schema.Boolean),
  body: Schema.String,
  files: Schema.optionalKey(Schema.Array(SkillFile)),
});
export type SkillSpec = typeof SkillSpec.Type;

/** An agent that gives a skill: its place — the factory's own, in its tree, the repository's or yours — and its name. */
export const SkillUser = Schema.Struct({ from: Schema.Literals(['factory', 'repo', 'yours']), name: Schema.String });

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

/** A skill's files read into its spec (`POST /api/skills/read`): the name its SKILL.md says, and what its files say. */
export const SkillDrafted = Schema.Struct({ metadata: Schema.Struct({ name: Schema.String }), spec: SkillSpec });
export type SkillDrafted = typeof SkillDrafted.Type;

/** The files of a skill's folder, by their path in it: SKILL.md among them. */
export const SkillFiles = Schema.Struct({ paths: Schema.Array(Schema.String) });
export type SkillFiles = typeof SkillFiles.Type;
