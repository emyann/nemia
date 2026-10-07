/**
 * The board's skill library as entries of the command table, each served on the api alone: the skill folders it lists, each read
 * (`SKILLS_LIST`, `skillRead`), one skill read for its page (`SKILLS_READ`), and a skill of yours written from its form or copied from
 * what Nemia ships (`SKILLS_WRITE`, `writeSkill`, `copySkill`). The api resolves which folders a request names, guards each write, and
 * words the board's answer around what each entry answers.
 */
import { tried } from '../runtime-client.ts';
import path from 'node:path';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { skillVersion } from './read.store.ts';
import {
  copySkill,
  skillRead,
  skillText,
  writeSkill,
  type SkillChange,
  type SkillCopied,
  type SkillRead,
  type SkillWritten,
} from './skills.store.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's skills take no ${arg}.`,
});

/** Each skill folder `skills` names read now (`skillRead`, the skill named by its folder), by folder. */
export const SKILLS_LIST: Command<Record<string, SkillRead>> = {
  name: 'skills list',
  usage: '[<skills> ...]',
  help: ['the skill folders named, each read'],
  spec: apiSpec([{ key: 'skills', takes: 'many', kind: 'name' }], []),
  writes: false,
  nemia: 'read',
  route: { method: 'GET', path: '/api/skills', status: 200 },
  only: { side: 'api', why: "the board's skill picker lists every skill by place; at the command line a person lists the folders" },
  handler: (args) =>
    tried(() => {
      const dirs = Array.isArray(args.skills) ? args.skills : [];
      return Object.fromEntries(dirs.map((dir) => [dir, skillRead(path.basename(dir), dir)]));
    }),
  print: () => [],
};

/** One skill read for its page: its reading (`skillRead`), its SKILL.md as written (`text`) and its version (`skillVersion`). */
export type SkillPage = SkillRead & { text: string; version: string | null };

/** The skill `name` whose folder is `dir`, as the api resolved it in the place `from`, read for its page (`SkillPage`). */
export const SKILLS_READ: Command<SkillPage> = {
  name: 'skills read',
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
  nemia: 'read',
  route: { method: 'GET', path: '/api/skills/:from/:name', status: 200 },
  only: {
    side: 'api',
    why: "the board's skill page reads one skill with its form and its users; at the command line a person reads its SKILL.md",
  },
  handler: (args) =>
    tried(() => {
      const dir = textOf(args, 'dir') ?? '';
      return { ...skillRead(textOf(args, 'name') ?? '', dir), text: skillText(dir), version: skillVersion(dir) };
    }),
  print: () => [],
};

/** Why the board's skill writes are served by the api's own routes. */
const WRITE_HAND =
  "the board guards the write, decodes the skill's form in its own words, answers a skill made with 201 and a change with 200, and reads the skill back";

/**
 * A skill of yours written into your library (`library`): copied whole from the folder of skills Nemia ships (`shipped`) under the name
 * `copy` (`copySkill`), or else written from its change (`change`, as JSON text) at the `version` it was read at, none for a skill made
 * (`writeSkill`).
 */
export const SKILLS_WRITE: Command<SkillWritten | SkillCopied> = {
  name: 'skills write',
  usage: '<from> [<name>]',
  help: ['a skill of yours written from its form, or copied from what Nemia ships'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'optional', kind: 'name' },
    ],
    ['library', 'change', 'version', 'copy', 'shipped'],
  ),
  writes: true,
  nemia: 'prompts',
  route: [
    { method: 'POST', path: '/api/skills/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/skills/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  only: { side: 'api', why: "the board's library writes a skill from a form; at the command line a person edits the skill's SKILL.md" },
  handler: (args) =>
    tried(() => {
      const library = textOf(args, 'library') ?? '';
      const copy = textOf(args, 'copy');
      if (copy !== undefined) return copySkill(textOf(args, 'shipped') ?? '', library, copy);
      const change = JSON.parse(textOf(args, 'change') ?? 'null') as SkillChange;
      return writeSkill(library, change, { version: textOf(args, 'version') ?? null });
    }),
  print: () => [],
};

/** The board's skill entries, in the order the table lists them. */
export const SKILL_ENTRIES: readonly Command[] = [SKILLS_LIST, SKILLS_READ, SKILLS_WRITE] as readonly Command[];
