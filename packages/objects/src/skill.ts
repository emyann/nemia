/**
 * The Skill: a skill folder a factory's starts can find, served as an object in the factory's namespace. Its `spec` is what its SKILL.md
 * says: its title, description, tags and examples, whether it is loaded whole every turn (`preload`), and its instructions. Its `status`
 * is what Nemia reads of it: where it was found, its card entry or why it has none, what it costs a turn, the agents that give it, where
 * a builtin one is already found, the command that copies it, and its revision. Its other text files, at any depth in its folder, are in
 * its spec (`files`, where it has any); every file of its folder is served by path alone (`SkillFiles`).
 *
 * Beside it, the body a write is sent (`SkillWrite`). Plain Schemas of JSON.
 */
import { Schema, Struct } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CardSkill, SkillCost, WriteMeta, definitionStatus } from './definition.ts';

const Text = Schema.NullOr(Schema.String);
const Words = Schema.NullOr(Schema.Array(Schema.String));

/**
 * A text file of a skill's folder beside its SKILL.md: its path in the folder, with `/`, at any depth, and its text. A file that is not
 * text — a picture — is never one.
 */
export const SkillFile = Schema.Struct({
  path: Schema.String.annotate({ description: "The file's path in the skill's folder, with / between folders." }),
  text: Schema.String.annotate({ description: "The file's text." }),
});
export type SkillFile = typeof SkillFile.Type;

/**
 * A skill as its SKILL.md says it; a key unset is null or left out. Its `files` are the folder's other text files, served where it holds
 * any; a write that gives them gives the whole set, so one left out is removed, and a file that is not text is never touched.
 */
export const SkillSpec = Schema.Struct({
  title: Schema.optionalKey(Text.annotate({ description: "The skill's title; null or absent where its SKILL.md sets none." })),
  description: Schema.optionalKey(Text.annotate({ description: "The skill's description; null or absent where its SKILL.md sets none." })),
  tags: Schema.optionalKey(Words.annotate({ description: "The skill's tags; null or absent where its SKILL.md sets none." })),
  examples: Schema.optionalKey(Words.annotate({ description: "The skill's examples; null or absent where its SKILL.md sets none." })),
  preload: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether the skill is loaded whole every turn.' })),
  body: Schema.String.annotate({ description: "The skill's instructions: what its SKILL.md says after its keys." }),
  files: Schema.optionalKey(
    Schema.Array(SkillFile).annotate({
      description: "The folder's other text files; a write that gives them gives the whole set, so one left out is removed.",
    }),
  ),
}).annotate({
  description:
    "The skill as its SKILL.md says it: its title, description, tags, examples, whether it is preloaded, its body, and its folder's other text files.",
});
export type SkillSpec = typeof SkillSpec.Type;

/** An agent that gives a skill: its place — the factory's own, in its tree, the repository's or the person's — and its name. */
export const SkillUser = Schema.Struct({
  from: Schema.Literals(['factory', 'repo', 'user']).annotate({
    description: "The agent's place: the factory's own tree, the repository or the person's library (`user`).",
  }),
  name: Schema.String.annotate({ description: "The agent's name." }),
});

/** What Nemia reads of a skill; see the file's head. */
export const SkillStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String.annotate({ description: "The skill's folder." }),
  entry: Schema.NullOr(CardSkill).annotate({ description: 'Its card entry; null where it has none.' }),
  error: Text.annotate({ description: 'Why it has no card entry; null where it has one.' }),
  preload: Schema.Boolean.annotate({ description: 'Whether it is loaded whole every turn.' }),
  cost: Schema.NullOr(SkillCost).annotate({ description: 'What it costs a turn; null where it cannot be counted.' }),
  usedBy: Schema.Array(SkillUser).annotate({ description: 'The agents that give it.' }),
  found: Schema.NullOr(Schema.Literals(['user', 'repo'])).annotate({
    description: 'Where a builtin skill is already found, the user library or the repository; null where it is not.',
  }),
  copyHint: Text.annotate({ description: 'The command that copies it; null where there is none.' }),
}).annotate({
  description:
    'What Nemia reads of the skill: where it was found, its card entry, what it costs a turn, the agents that give it, the command that copies it, and its revision.',
});
export type SkillStatus = typeof SkillStatus.Type;

/** A skill, as an object. Where its SKILL.md does not read as a draft, `spec` is its body alone and `status.error` says why. */
export const Skill = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Skill').annotate({ description: 'What the object is: a Skill, a folder of instructions a session can load.' }),
  metadata: ObjectMeta,
  spec: SkillSpec,
  status: SkillStatus,
});
export type Skill = typeof Skill.Type;

/** A page of a namespace's skills. */
export const SkillListed = Schema.Struct({
  ...Skill.fields,
  spec: SkillSpec.mapFields((fields) => ({
    ...Struct.omit(fields, ['body', 'files']),
    files: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({ path: Schema.String.annotate({ description: "The file's path in the skill's folder, with / between folders." }) }),
      ).annotate({ description: "The folder's other text files, by path alone: a read of the skill answers their text." }),
    ),
  })).annotate({
    description:
      "The skill as its SKILL.md says it, without its body or its files' text, which a read of the skill answers: its title, description, tags, examples, whether it is preloaded, and its folder's other files by path.",
  }),
}).annotate({ description: "A skill as a list serves it, without its files' content (LISTED_WITHOUT)." });
export type SkillListed = typeof SkillListed.Type;

/** A page of skills, each without its files' content. */
export const SkillList = listOf('Skill', SkillListed);
export type SkillList = typeof SkillList.Type;

/**
 * A skill of the person's library made (`POST …/skills`, `metadata.name` its name) or written (`PUT …/skills/<name>`,
 * `metadata.resourceVersion` the version it was read at): its spec whole, or `preload` alone.
 */
export const SkillWrite = Schema.Union([
  Schema.Struct({ metadata: WriteMeta, spec: SkillSpec }),
  Schema.Struct({
    metadata: WriteMeta,
    preload: Schema.Boolean.annotate({ description: 'Whether the skill is loaded whole every turn.' }),
  }),
]);
export type SkillWrite = typeof SkillWrite.Type;

/** A skill's files read into its spec (`POST /api/skills/read`): the name its SKILL.md says, and what its files say. */
export const SkillDrafted = Schema.Struct({
  metadata: Schema.Struct({ name: Schema.String.annotate({ description: 'The name its SKILL.md says.' }) }).annotate({
    description: 'The skill read, by its name.',
  }),
  spec: SkillSpec,
});
export type SkillDrafted = typeof SkillDrafted.Type;

/** The files of a skill's folder, by their path in it: SKILL.md among them. */
export const SkillFiles = Schema.Struct({
  paths: Schema.Array(Schema.String).annotate({ description: "The path of each file of the skill's folder, SKILL.md among them." }),
});
export type SkillFiles = typeof SkillFiles.Type;
