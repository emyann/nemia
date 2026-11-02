/**
 * The skill library as entries of the command table, each through the Skill door (`SkillDoor`, run `rooted` at the store's root the
 * handler is given): the skill folders the board lists, each read (`SKILLS_LIST`), and one skill read for its page (`SKILLS_READ`), on
 * the api alone; and a skill of yours written from its SKILL.md or form, or copied from Nemia's builtin skills (`SKILLS_WRITE`), served on
 * both sides. The api resolves which folders a read names, guards each write, and words the board's answer around what each entry
 * answers.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { apiKey, cliPath, factoryFlag, FROM, versionFlag, writerSpec, writerText, yoursOrRefused } from '../yours/yours.ts';
import { templatedTree } from '../factory/factory.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { SkillName } from '../agents/agents.model.ts';
import { SkillDoor, type SkillPage } from './skill-door.store.ts';
import type { SkillChange, SkillCopied, SkillRead, SkillWritten } from './skills.store.ts';

export type { SkillPage } from './skill-door.store.ts';

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

/** Each skill folder `skills` names read now through the door (the skill named by its folder), by folder. */
export const SKILLS_LIST: Command<Record<string, SkillRead>> = {
  name: 'skills',
  usage: '[<skills> ...]',
  help: ['the skill folders named, each read'],
  spec: apiSpec([{ key: 'skills', takes: 'many', kind: 'name' }], []),
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/skills', status: 200 },
  only: { side: 'api', why: "the board's skill picker lists every skill by place; at the command line a person lists the folders" },
  handler: (args, _env, home) =>
    rooted(
      home,
      'skills',
      Effect.gen(function* () {
        const door = yield* SkillDoor;
        const dirs = Array.isArray(args.skills) ? args.skills : [];
        const reads = yield* Effect.forEach(dirs, (dir) =>
          Effect.map(
            door.skills.read(SkillName.read(path.basename(dir)), path.dirname(dir)),
            ({ text: _text, version: _version, ...read }) => [dir, read] as const,
          ),
        );
        return Object.fromEntries(reads) as Record<string, SkillRead>;
      }),
    ),
  print: () => [],
};

/**
 * The skill `name` whose folder is `dir`, as the api resolved it in the place `from`, read for its page (`SkillPage`) through the door,
 * in the folder of skills `dir` is in.
 */
export const SKILLS_READ: Command<SkillPage> = {
  name: 'skills show',
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
  route: { method: 'GET', path: '/api/skills/:from/:name', status: 200 },
  only: {
    side: 'api',
    why: "the board's skill page reads one skill with its form and its users; at the command line a person reads its SKILL.md",
  },
  handler: (args, _env, home) =>
    rooted(
      home,
      'skills show',
      Effect.gen(function* () {
        const door = yield* SkillDoor;
        return yield* door.skills.read(SkillName.read(textOf(args, 'name') ?? ''), path.dirname(textOf(args, 'dir') ?? ''));
      }),
    ),
  print: () => [],
};

/** Why the board's skill writes are served by the api's own routes. */
const WRITE_HAND =
  "the board guards the write, decodes the skill's form in its own words, answers a skill made with 201 and a change with 200, and reads the skill back";

/** The words a written skill is said in: the files written, and the version it is at now, which a change of it gives. */
const writtenLines = (data: SkillWritten | SkillCopied): string[] => [
  `${data.name} written in ${data.dir}${'version' in data ? `, at version ${data.version}` : ''}: ${data.written.join(', ')}`,
];

/**
 * A skill of yours written into your library (`yourSkillsDir`) through the door: copied whole from the folder of builtin skills
 * (`builtin`) under the name `copy`, or else written from its change (`change`, as JSON text, which the command line reads off `--file`)
 * at the `version` it was read at, none for a skill made. Written to the tree of the factory `--factory` names for the place
 * `factory`. Refused, as `Invalid`, for a place but those two (`yoursOrRefused`).
 */
export const SKILLS_WRITE: Command<SkillWritten | SkillCopied> = {
  name: 'skills write',
  usage: '(yours | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]',
  help: [
    'a skill of yours, or of a templated --factory, written from its',
    'SKILL.md: <name> is the skill it changes, at the --version it was',
    'read at; none, a new one',
  ],
  spec: writerSpec(
    'skills write',
    '(yours | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]',
    [FROM, { key: 'name', takes: 'optional', kind: 'name' }],
    [
      cliPath(
        'skills write',
        'file',
        "the skill's SKILL.md, whose name: is its folder",
        "the api is sent the skill's form, never a path to read",
      ),
      versionFlag('skills write', 'the skill'),
      factoryFlag('skills write'),
      apiKey('change', 'the command line reads the skill off --file, into the form the board sends'),
      apiKey('copy', 'the board copies a builtin skill; the command line writes one a person wrote'),
      apiKey('builtin', 'the board names the folder of builtin skills, where a copy is read from'),
    ],
  ),
  writes: true,
  class: 'ask',
  route: [
    { method: 'POST', path: '/api/skills/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/skills/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  handler: (args, _env, home) =>
    rooted(
      home,
      'skills write',
      Effect.gen(function* () {
        const root = yield* StoreRoot;
        const library = yield* tried(() =>
          yoursOrRefused('nemia skills write', 'skills', writerText(args, 'from') ?? '', writerText(args, 'name') ?? null, '', root, {
            factory: writerText(args, 'factory'),
            treeOf: (factory) => templatedTree(factory, 'nemia skills write'),
          }),
        );
        const door = yield* SkillDoor;
        const copy = writerText(args, 'copy');
        if (copy !== undefined) return yield* door.skills.copy(SkillName.read(copy), writerText(args, 'builtin') ?? '', library);
        const change = yield* tried(() => JSON.parse(writerText(args, 'change') ?? 'null') as SkillChange);
        return yield* door.skills.write(SkillName.read(change?.name), change, writerText(args, 'version'), library);
      }),
    ),
  print: writtenLines,
};

/** The board's skill entries, in the order the table lists them. */
export const SKILL_ENTRIES: readonly Command[] = [SKILLS_LIST, SKILLS_READ, SKILLS_WRITE] as readonly Command[];
