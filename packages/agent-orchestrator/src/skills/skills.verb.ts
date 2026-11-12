/**
 * The skill library as entries of the command table, each through the Skill door (`SkillDoor`, run at the store's root (`StoreRoot`) the
 * handler is given): the skill folders the board lists, each read (`SKILLS_LIST`), and one skill read for its page with its other text
 * files (`SKILLS_READ`), on the api alone; and a skill of yours written from its SKILL.md or form, or copied from Nemia's builtin skills
 * (`SKILLS_WRITE`), its words the client's (`objects`' `COMMAND_WORDS`), served through the api. The api resolves which folders a read
 * names, guards each write, and words the board's answer around what each entry answers.
 */
import { SKILLS_WRITE_WORDS } from 'objects';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { yoursOrRefused } from '../yours/yours.ts';
import { templatedTreeOf } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { SkillName } from '../agents/agents.model.ts';
import { SkillDoor, type SkillPage } from './skill-door.store.ts';
import type { SkillChange, SkillCopied, SkillRead, SkillWritten } from './skills.store.ts';
import type { SkillOther } from './skills.ts';

export type { SkillPage } from './skill-door.store.ts';

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's skills take no ${arg}.`,
});

/** What `skills`' handler takes: the skill folders to read. */
export const SkillsInput = Schema.Struct({ skills: Schema.optionalKey(Schema.Array(Schema.String)) });
export type SkillsInput = typeof SkillsInput.Type;

/** Each skill folder `skills` names read now through the door (the skill named by its folder), by folder. */
export const SKILLS_LIST: Command<Record<string, SkillRead>, SkillsInput> = {
  name: 'skills',
  served: [{ endpoint: 'skills.list' }],
  usage: '[<skills> ...]',
  help: ['the skill folders named, each read'],
  spec: apiSpec([{ key: 'skills', takes: 'many', kind: 'name' }], []),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board's skill picker lists every skill by place; at the command line a person lists the folders" },
  input: SkillsInput,
  handler: ({ skills: dirs = [] }) =>
    Effect.gen(function* () {
      const door = yield* SkillDoor;
      const reads = yield* Effect.forEach(dirs, (dir) =>
        Effect.map(
          door.skills.read(SkillName.read(path.basename(dir)), path.dirname(dir)),
          ({ text: _text, version: _version, ...read }) => [dir, read] as const,
        ),
      );
      return Object.fromEntries(reads);
    }),
  print: () => [],
};

/** What `skills show`'s handler takes: the skill's name, and its folder, as the api resolved it. */
export const SkillShowInput = Schema.Struct({ name: Schema.String, dir: Schema.String });
export type SkillShowInput = typeof SkillShowInput.Type;

/** One skill read for its page (`SkillPage`), and the other text files of its folder (`files`, by path, sorted; none where it has none). */
export type SkillShown = SkillPage & { readonly files: readonly SkillOther[] };

/**
 * The skill `name` whose folder is `dir`, as the api resolved it in the place `from`, read for its page (`SkillPage`) through the door,
 * in the folder of skills `dir` is in, with its other text files (`files`).
 */
export const SKILLS_READ: Command<SkillShown, SkillShowInput> = {
  name: 'skills show',
  served: [{ endpoint: 'skills.get' }],
  usage: '<from> <name>',
  help: ['one skill, read for its page'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'required', kind: 'name' },
    ],
    ['dir'],
  ),
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: "the board's skill page reads one skill with its form and its users; at the command line a person reads its SKILL.md",
  },
  input: SkillShowInput,
  handler: ({ name, dir }) =>
    Effect.gen(function* () {
      const door = yield* SkillDoor;
      const page = yield* door.skills.read(SkillName.read(name), path.dirname(dir));
      return { ...page, files: yield* door.skills.others(SkillName.read(name), path.dirname(dir)) };
    }),
  print: () => [],
};

/**
 * A skill of yours written into your library (`yourSkillsDir`) through the door: copied whole from the folder of builtin skills
 * (`builtin`) under the name `copy`, or else written from its change (`change`, as JSON text, which the command line reads off `--file`)
 * at the `version` it was read at, none for a skill made. Written to the tree of the factory `--factory` names for the place
 * `factory`. Refused, as `Invalid`, for a place but those two (`yoursOrRefused`).
 */
/** A skill's change as the writer hands it, read by the command line off its SKILL.md and built by the api from the Skill's spec. */
const SkillChangeValue = Schema.declare(
  (u: unknown): u is SkillChange => typeof u === 'object' && u !== null && typeof (u as { name?: unknown }).name === 'string',
);

/**
 * What `nemia skills write`'s handler takes: the place it writes (`from`, `yours` or `factory`, and the `factory` whose tree), the skill's
 * name on the path where it changes one (`name`), the `version` it was read at, and either its `change` or the builtin skill to `copy`
 * from the folder of builtin skills (`builtin`).
 */
export const SkillWriteInput = Schema.Struct({
  from: Schema.String,
  name: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  change: Schema.optionalKey(SkillChangeValue),
  copy: Schema.optionalKey(Schema.String),
  builtin: Schema.optionalKey(Schema.String),
});
export type SkillWriteInput = typeof SkillWriteInput.Type;

export const SKILLS_WRITE: Command<SkillWritten | SkillCopied, SkillWriteInput> = {
  ...SKILLS_WRITE_WORDS,
  input: SkillWriteInput,
  handler: ({ from, name, factory, version, change, copy, builtin = '' }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const library = yield* tried(() =>
        yoursOrRefused('nemia skills write', 'skills', from, name ?? null, '', root, {
          factory,
          treeOf: (named) => templatedTreeOf(root, named, 'nemia skills write'),
        }),
      );
      const door = yield* SkillDoor;
      if (copy !== undefined) return yield* door.skills.copy(SkillName.read(copy), builtin, library);
      if (change === undefined)
        return yield* Effect.fail(
          new Invalid({
            message: 'nemia skills write takes the skill to write, its SKILL.md: nemia skills write yours --file <SKILL.md>.',
          }),
        );
      return yield* door.skills.write(SkillName.read(change.name), change, version, library);
    }),
  print: () => [],
};

/** The board's skill entries, in the order the table lists them. */
export const SKILL_ENTRIES: readonly Command[] = [SKILLS_LIST, SKILLS_READ, SKILLS_WRITE] as readonly Command[];
