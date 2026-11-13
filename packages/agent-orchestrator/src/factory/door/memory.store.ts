/**
 * The Factory door's memory stand-in: a fresh layer of `FactoryDoor` per call, its factories and the files the store keeps beside each —
 * its level, rules, instruction and servers, and every other file of its folder — held in maps, built by `factoryDoorOver` as the files
 * layer is, so the writes are checked the one way on both. A test gives it its program — `Effect.provide(program, factoryDoorMemory())` —
 * where it needs a factory to exist and nothing of the disk; the walks of `test/factory-walks.ts` hold it to what the files answer. Its
 * paths are under `MEMORY_ROOT`, named as the files name them under the store's root.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). It renders no tree: a templated factory's wiring is
 * held in its record, as the files hold it in the tree. Its folder, read whole, is the files placed in it with its level, servers, rules
 * and instruction as the maps hold them now, at the paths the files keep them at; a folder placed sets those maps from its files.
 */
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../../refusal/refusal.ts';
import { factoryNameRefusal, noFactoryLine, takenFactoryRefusal, unrenderedTreeRefusal, type Factory } from '../factory.ts';
import { factoryRulesRefusal, FACTORY_RULES_FILE } from '../rules/rules.ts';
import { generationWritten, levelDiffers } from './generation.ts';
import type { FactoryLevelFile } from '../../level/level.ts';
import type { FactoryServers } from '../servers/index.ts';
import { FactoryDoor, factoryDoorOver, folderKeptRefusal, instructionRead, type FactoryLayer } from './factories.store.ts';
import { DEFAULT_INSTRUCTION } from '../factory.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { folderPathRefusal, staysWithStore } from './folder.store.ts';
import { FOLDER_STAYS } from '../move/move.ts';

/** Where the stand-in says a factory's files are: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

const factoriesAt = (...parts: string[]): string => path.posix.join(MEMORY_ROOT, 'factories', ...parts);

/** A name that is no factory's, refused (`Invalid`) as the files refuse it, before anything is read or written. */
const named = (name: string): string => {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return name;
};

/** The factory `name` of `factories` counted one change more where its level `now` changes the one it held (`was`); none for no factory. */
const levelCounted = (factories: Map<string, Factory>, name: string, was: FactoryLevelFile | undefined, now: FactoryLevelFile): void => {
  const factory = factories.get(name);
  if (factory !== undefined && levelDiffers(was, now)) factories.set(name, generationWritten(factory, factory, true));
};

/** The rules of `rules`, by factory, each factory as `held` reads it, checked as the files check them. */
function rulesIn(rules: Map<string, string>, held: (name: string, notDone: string) => Factory): FactoryLayer['rules'] {
  return {
    read: (name) => {
      held(name, 'There are no rules to read.');
      return { file: factoriesAt(name, FACTORY_RULES_FILE), words: rules.get(name) ?? null, error: null };
    },
    write: (name, words) => {
      held(name, 'Nothing was written.');
      const file = factoriesAt(name, FACTORY_RULES_FILE);
      if (!words.trim())
        throw new Invalid({
          message: `the rules of ${name} are blank. Write the words every agent hired into it is to be told, or clear them: nemia factory rules ${name} --clear. Nothing was written.`,
        });
      const refused = factoryRulesRefusal(file, words);
      if (refused !== undefined) throw new Invalid({ message: `${refused} Nothing was written.` });
      rules.set(name, words.trim());
      return file;
    },
    clear: (name) => {
      held(name, 'Nothing was removed.');
      return rules.delete(name);
    },
  };
}

/**
 * The instructions of `instructions`, by factory, each factory as `held` reads it: one kept in its first folder reads as none, since the
 * stand-in reads no disk, and takes no text the store keeps.
 */
function instructionsIn(instructions: Map<string, string>, held: (name: string, notDone: string) => Factory): FactoryLayer['instruction'] {
  const instructionOf = (name: string, notDone: string) =>
    instructionRead(
      held(name, notDone),
      factoriesAt(name, DEFAULT_INSTRUCTION),
      (at) => ({ words: at.in === 'store' ? (instructions.get(name) ?? null) : null, error: null }),
      () => instructions.has(name),
    );
  const storeKept = (name: string, notDone: string) => {
    const before = instructionOf(name, notDone);
    if (!before.store) throw folderKeptRefusal(name, before.file);
    return before;
  };
  return {
    read: (name) => instructionOf(name, 'There is no instruction to read.'),
    write: (name, words) => {
      const { file } = storeKept(name, 'Nothing was written.');
      if (!words.trim())
        throw new Invalid({
          message: `the instruction of ${name} is blank. Write the words Nemia is to know of the factory, or clear it: nemia factory instruct ${name} --clear. Nothing was written.`,
        });
      instructions.set(name, `${words.trim()}\n`);
      return file;
    },
    clear: (name) => {
      storeKept(name, 'Nothing was removed.');
      return instructions.delete(name);
    },
  };
}

/** The files the store keeps beside a factory that the stand-in holds in maps of their own, at the paths the files keep them. */
const LEVEL_FILE = 'level.json';
const SERVERS_FILE = 'servers.json';

/** The bytes of `text` in UTF-8, as a file of a folder holds them. */
const fileOf = (path: string, text: string): TreeFile => ({ path, mode: 0o644, bytes: new TextEncoder().encode(text) });

/** The text of a file of a folder. */
const textOf = (file: TreeFile): string => new TextDecoder().decode(file.bytes);

/** The maps the stand-in keeps a factory's files in, by factory. */
type Kept = {
  readonly folders: Map<string, readonly TreeFile[]>;
  readonly stays: Map<string, readonly string[]>;
  readonly levels: Map<string, FactoryLevelFile>;
  readonly rules: Map<string, string>;
  readonly instructions: Map<string, string>;
  readonly servers: Map<string, FactoryServers>;
};

/** Whether `path` is a file a map of `Kept` holds rather than the folder's own. */
const isMapped = (path: string): boolean => [LEVEL_FILE, SERVERS_FILE, FACTORY_RULES_FILE, DEFAULT_INSTRUCTION].includes(path);

/** The JSON of the file `file` of the folder of `name`, refused `Invalid` where it does not read. */
const jsonOf = (name: string, file: TreeFile): unknown => {
  try {
    return JSON.parse(textOf(file)) as unknown;
  } catch {
    throw new Invalid({ message: `${factoriesAt(name, file.path)} is not JSON. Nothing was placed.` });
  }
};

/** The folders of `kept`, as a layer's: read with what its maps hold, placed into them, removed from them. */
function foldersIn(kept: Kept): FactoryLayer['folder'] {
  const there = (name: string) =>
    kept.folders.has(name) || kept.levels.has(name) || kept.rules.has(name) || kept.instructions.has(name) || kept.servers.has(name);
  return {
    read: (name) => {
      const level = kept.levels.get(named(name));
      const servers = kept.servers.get(name);
      const rules = kept.rules.get(name);
      const instruction = kept.instructions.get(name);
      const files = [
        ...(kept.folders.get(name) ?? []).map((file) => structuredClone(file)),
        ...(level === undefined ? [] : [fileOf(LEVEL_FILE, `${JSON.stringify(level)}\n`)]),
        ...(servers === undefined ? [] : [fileOf(SERVERS_FILE, `${JSON.stringify({ servers })}\n`)]),
        ...(rules === undefined ? [] : [fileOf(FACTORY_RULES_FILE, `${rules}\n`)]),
        ...(instruction === undefined ? [] : [fileOf(DEFAULT_INSTRUCTION, instruction)]),
      ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { files, stays: [...(kept.stays.get(name) ?? [])] };
    },
    place: (name, files) => {
      const refused = files.map((file) => folderPathRefusal(file.path)).find((why) => why !== undefined);
      if (refused !== undefined) throw new Invalid({ message: refused });
      if (there(named(name)))
        throw new Conflict({
          message: `${factoriesAt(name)} is there already, and a factory's folder is placed only where none is. Nothing was placed.`,
        });
      const byPath = new Map(files.map((file) => [file.path, file] as const));
      const level = byPath.get(LEVEL_FILE);
      const servers = byPath.get(SERVERS_FILE);
      const read = {
        level: level === undefined ? undefined : (jsonOf(name, level) as FactoryLevelFile),
        servers: servers === undefined ? undefined : (jsonOf(name, servers) as { servers?: FactoryServers }).servers,
      };
      kept.folders.set(name, structuredClone(files.filter((file) => !isMapped(file.path) && !staysWithStore(file.path))));
      kept.stays.set(
        name,
        FOLDER_STAYS.filter((stays) => files.some((file) => staysWithStore(file.path) && file.path.startsWith(`${stays}/`))),
      );
      if (read.level !== undefined) kept.levels.set(name, read.level);
      if (read.servers !== undefined) kept.servers.set(name, read.servers);
      const rules = byPath.get(FACTORY_RULES_FILE);
      if (rules !== undefined) kept.rules.set(name, textOf(rules).trim());
      const instruction = byPath.get(DEFAULT_INSTRUCTION);
      if (instruction !== undefined) kept.instructions.set(name, textOf(instruction));
      return factoriesAt(name);
    },
    remove: (name) => {
      const was = there(named(name));
      for (const map of [kept.folders, kept.stays, kept.levels, kept.rules, kept.instructions, kept.servers]) map.delete(name);
      return was;
    },
  };
}

/** A fresh Factory door over maps: nothing filed, no level, rules, instruction, servers nor folder. */
export function factoryDoorMemory(): Layer.Layer<never> {
  const factories = new Map<string, Factory>();
  const levels = new Map<string, FactoryLevelFile>();
  const rules = new Map<string, string>();
  const instructions = new Map<string, string>();
  const servers = new Map<string, FactoryServers>();
  const folders = new Map<string, readonly TreeFile[]>();
  const names = () => [...factories.keys()].sort();
  const missing = (name: string, notDone: string) => new Missing({ message: `${noFactoryLine(name, names())} ${notDone}` });
  const held = (name: string, notDone: string): Factory => {
    const factory = factories.get(named(name));
    if (factory === undefined) throw missing(name, notDone);
    return factory;
  };
  const layer: FactoryLayer = {
    factories: {
      list: names,
      listed: () => names().map((name) => ({ ...structuredClone(held(name, 'Nothing was read.')), file: factoriesAt(`${name}.json`) })),
      read: (name) => structuredClone(held(name, 'Nothing was read.')),
      create: (factory) => {
        const file = factoriesAt(`${factory.name}.json`);
        if (
          factory.template !== undefined &&
          (factory.workflows.length || Object.keys(factory.hires).length || factory.revisions !== undefined)
        )
          throw new Conflict({ message: unrenderedTreeRefusal(factory.name, factoriesAt(factory.name, 'tree'), 'Nothing was filed.') });
        if (factories.has(factory.name)) throw new Conflict({ message: takenFactoryRefusal(factory.name, file) });
        factories.set(factory.name, structuredClone({ ...factory, generation: 1 }));
        return file;
      },
      rewrite: (factory) => {
        const was = held(factory.name, 'Nothing was written.');
        factories.set(factory.name, structuredClone(generationWritten(was, factory)));
        return factoriesAt(`${factory.name}.json`);
      },
      remove: (name) => {
        held(name, 'Nothing was removed.');
        factories.delete(name);
        return factoriesAt(`${name}.json`);
      },
    },
    level: {
      read: (name) => structuredClone(levels.get(named(name))),
      write: (name, level) => {
        const was = levels.get(named(name));
        if (level.level === undefined && level.raise === undefined) levels.delete(named(name));
        else levels.set(named(name), structuredClone(level));
        levelCounted(factories, name, was, level);
      },
    },
    rules: rulesIn(rules, held),
    instruction: instructionsIn(instructions, held),
    servers: {
      read: (name) => structuredClone(servers.get(named(name)) ?? {}),
      write: (name, kept) => {
        if (!Object.keys(kept).length) servers.delete(named(name));
        else servers.set(named(name), structuredClone(kept));
      },
    },
    folder: foldersIn({ folders, stays: new Map(), levels, rules, instructions, servers }),
  };
  return Layer.succeed(FactoryDoor)(factoryDoorOver(layer));
}
