/**
 * The Factory door's memory stand-in: a fresh layer of `FactoryDoor` per call, its factories and the files the store keeps beside each —
 * its level, rules, instruction and servers — held in maps, built by `factoryDoorOver` as the files layer is, so the writes are checked the
 * one way on both. A test gives it its program — `Effect.provide(program, factoryDoorMemory())` — where it needs a factory to exist and
 * nothing of the disk; the walks of `test/factory-walks.ts` hold it to what the files answer. Its paths are under `MEMORY_ROOT`, named as
 * the files name them under the store's root.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). It renders no tree: a templated factory's wiring is
 * held in its record, as the files hold it in the tree.
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

/** A fresh Factory door over maps: nothing filed, no level, rules, instruction nor servers. */
export function factoryDoorMemory(): Layer.Layer<never> {
  const factories = new Map<string, Factory>();
  const levels = new Map<string, FactoryLevelFile>();
  const rules = new Map<string, string>();
  const instructions = new Map<string, string>();
  const servers = new Map<string, FactoryServers>();
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
  };
  return Layer.succeed(FactoryDoor)(factoryDoorOver(layer));
}
