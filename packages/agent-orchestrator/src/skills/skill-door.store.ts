/**
 * The Skill door: the one way a program reads and writes a skill — a folder of a folder of skills, `<skills>/<name>/SKILL.md` — an Effect
 * service, `SkillDoor`, whose methods take a skill's name as `SkillName` and answer an Effect failing with a refusal. Its pattern is the
 * Workflow door's (`src/door/door.store.ts`, `src/workflows/workflows.store.ts`).
 *
 * Two layers: the files (`skillFiles`, over `read.store.ts` and `skills.store.ts` at a store's root, so a skill is the very bytes today's
 * writer writes), and the memory stand-in (`skillDoorMemory`, `skill-memory.store.ts`), which a test gives its program. Both are built by
 * `skillDoorOver`, so each write is checked the one way on both, before the layer acts: the name as `SkillName.OnCreate` checks it, a
 * whole skill drafted through the model's `Skill` — a one-line description, required — or `Invalid` names the check broken and nothing
 * is written; then the write judged against the version it was read at (`definitionVersionRefusal`), refused with the kind it chooses.
 * What stays the layer's: where a skill may be written (the store's `skills/`, or a repository's the store knows), a link, a change of
 * `preload:` alone where no skill is, the card reader's refusal of what a draft renders to, and a copy's source and target.
 *
 * A holder `list` reads is a place, not an entity: a plain path, refused `Invalid` where it is not absolute. `found` takes a workflow's
 * folder and its places, an object, so nothing of it is branded.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was
 * given none (`test/root-given.test.ts`).
 */
import path from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { definitionVersionRefusal, type DefinitionThere, type SkillsFound } from '../agents/agents.ts';
import { Skill, SkillName } from '../agents/agents.model.ts';
import type { VersionRefused } from '../folder/folder.ts';
import type { SkillDraft } from './skills.ts';
import { skillsFor, skillVersion, type Places } from './read.store.ts';
import {
  copySkill,
  skillFolders,
  skillRead,
  skillText,
  skillThere,
  writeSkill,
  type SkillChange,
  type SkillCopied,
  type SkillRead,
  type SkillWritten,
} from './skills.store.ts';

/** One skill read for its page: its reading (`skillRead`), its SKILL.md as written (`text`, empty where none reads) and its version. */
export type SkillPage = SkillRead & { text: string; version: string | null };

/** Where a write or a copy may go: the store's `skills/` or a repository's the store knows, or, with `anywhere`, any `skills/`. */
export type SkillWhere = { readonly anywhere?: boolean };

/**
 * A layer of the Skill door, as plain synchronous methods: the skills a workflow's agents are given, found where a start finds them
 * (`skillsFor`); the skills a folder of skills holds, by name; a skill of a folder of skills (`at`) read for its page, and what is there
 * now (`DefinitionThere`); a skill made or changed (`version` the one it was read at, none for a skill made); and a skill copied whole from
 * one folder of skills into another, under its name.
 */
export type SkillLayer = {
  readonly skills: {
    readonly found: (at: { readonly dir: string; readonly places?: Places }) => SkillsFound;
    readonly list: (holder: string) => readonly string[];
    readonly read: (name: string, at: string) => SkillPage;
    readonly there: (name: string, at: string) => DefinitionThere;
    readonly write: (name: string, change: SkillChange, version: string | undefined, at: string, where?: SkillWhere) => SkillWritten;
    readonly copy: (name: string, from: string, to: string, where?: SkillWhere) => SkillCopied;
  };
};

type Methods = DoorOf<SkillLayer, SkillName>['skills'];

/**
 * The Skill door's shape: each method of `SkillLayer` answering an Effect, a skill's name taken as `SkillName`; but `list`, which takes a
 * holder's plain path.
 */
export type SkillDoorShape = {
  readonly skills: Omit<Methods, 'list'> & {
    readonly list: (holder: string) => Effect.Effect<readonly string[], Refusal>;
  };
};

/** A skill's name a write or a copy is given, as `SkillName.OnCreate` checks it. */
const nameChecked = checked(SkillName.OnCreate, (name: unknown) => `the skill ${JSON.stringify(name)}`);

/** The model's `Skill`, refused `Invalid` naming the invariant it breaks. */
const skillChecked = checked(Skill, (skill: { name: string }) => `skills/${skill.name}`);

/**
 * The skill `name` as the model holds it, from a whole draft: each value as `renderSkill` writes it — its description trimmed, its
 * instructions as given — so a draft one layer refuses the other refuses. Pure.
 */
export const draftedSkill = (name: string, draft: SkillDraft) => ({
  name,
  ...(draft.title !== undefined && { title: draft.title }),
  description: draft.description == null ? '' : String(draft.description).trim(),
  ...(draft.tags !== undefined && { tags: draft.tags }),
  ...(draft.examples !== undefined && { examples: draft.examples }),
  preload: draft.preload ?? false,
  body: String(draft.body ?? ''),
});

/** The refusal `definitionVersionRefusal` chose, as the refusal of its kind. */
const refusalOf = (refused: VersionRefused): Refusal =>
  refused.kind === 'Missing'
    ? new Missing({ message: refused.message })
    : refused.kind === 'Conflict'
      ? new Conflict({ message: refused.message })
      : new Invalid({ message: refused.message });

/** The door over `layer`: each method as `doorOf` makes it, each name and each write checked before the layer acts. */
export function skillDoorOver(layer: SkillLayer): SkillDoorShape {
  const door = doorOf<SkillLayer, SkillName>(layer).skills;
  return {
    skills: {
      found: (at) => door.found(at),
      list: (holder) =>
        path.isAbsolute(holder)
          ? door.list(holder as SkillName)
          : Effect.fail(new Invalid({ message: `${holder} is not absolute: name the folder of skills by its whole path.` })),
      read: (name, at) => door.read(name, at),
      there: (name, at) => door.there(name, at),
      write: (name, change, version, at, where) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          const named = { ...change, name };
          if ('body' in named) yield* skillChecked(draftedSkill(name, named));
          const refused = definitionVersionRefusal('skill', name, 'write', yield* door.there(name, at), version);
          if (refused !== null) return yield* Effect.fail(refusalOf(refused));
          return yield* door.write(name, named, version, at, where);
        }),
      copy: (name, from, to, where) => Effect.andThen(nameChecked(name), door.copy(name, from, to, where)),
    },
  };
}

/** The files of the store `home`, as a layer of the door: today's skill folders, read and written by the skills' own functions. */
export function skillFiles(home: string): SkillLayer {
  return {
    skills: {
      found: ({ dir, places }) => skillsFor(dir, places),
      list: (holder) => skillFolders(holder),
      read: (name, at) => {
        const dir = path.join(at, name);
        return { ...skillRead(name, dir), text: skillText(dir), version: skillVersion(dir) };
      },
      there: (name, at) => skillThere(path.join(at, name)),
      write: (name, change, version, at, where) =>
        writeSkill(home, at, { ...change, name }, { version: version ?? null, anywhere: where?.anywhere }),
      copy: (name, from, to, where) => copySkill(home, from, to, name, where),
    },
  };
}

/**
 * The Skill door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — so a handler that yields it is run through
 * `rooted(home, verb, program)` (`src/wiring/wire.verb.ts`), and a test gives `skillDoorMemory()` with no root at all.
 */
export const SkillDoor = Context.Reference<SkillDoorShape>('agent-orchestrator/SkillDoor', {
  defaultValue: () => rootedDoor((root) => skillDoorOver(skillFiles(root)), 'Skill door'),
});

/** The Skill door over the files of the store `root`, as a layer: for a program that names its root by the door. */
export const skillDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(SkillDoor)(skillDoorOver(skillFiles(root)));
