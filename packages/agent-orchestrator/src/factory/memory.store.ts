/**
 * The Factory door's memory stand-in: a fresh layer of `FactoryDoor` per call, its factories and the files the store keeps beside each —
 * its level, rules and servers — held in maps, built by `factoryDoorOver` as the files layer is, so the writes are checked the one way
 * on both. A test gives it its program — `Effect.provide(program, factoryDoorMemory())` — where it needs a factory to exist and nothing
 * of the disk; the walks of `test/factory-walks.ts` hold it to what the files answer. Its paths are under `MEMORY_ROOT`, named as the
 * files name them under the store's root.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). It renders no tree: a templated factory's wiring is
 * held in its record, as the files hold it in the tree.
 */
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import {
  defaultFactoryRefusal,
  DEFAULT_FACTORY,
  factoryNameRefusal,
  noFactoryLine,
  takenFactoryRefusal,
  unrenderedTreeRefusal,
  type Factory,
} from './factory.ts';
import { factoryRulesRefusal, FACTORY_RULES_FILE } from '../rules/rules.ts';
import type { FactoryLevelFile } from '../level/level.ts';
import type { FactoryServers } from '../servers/servers.ts';
import { FactoryDoor, factoryDoorOver, type FactoryLayer } from './factories.store.ts';

/** Where the stand-in says a factory's files are: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

const factoriesAt = (...parts: string[]): string => path.posix.join(MEMORY_ROOT, 'factories', ...parts);

/** A name that is no factory's, refused (`Invalid`) as the files refuse it, before anything is read or written. */
const named = (name: string): string => {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return name;
};

/** A fresh Factory door over maps: nothing filed, no level, rules nor servers. */
export function factoryDoorMemory(): Layer.Layer<never> {
  const factories = new Map<string, Factory>();
  const levels = new Map<string, FactoryLevelFile>();
  const rules = new Map<string, string>();
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
      read: (name) => structuredClone(held(name, 'Nothing was read.')),
      create: (factory) => {
        const file = factoriesAt(`${factory.name}.json`);
        if (
          factory.template !== undefined &&
          (factory.workflows.length || Object.keys(factory.hires).length || factory.revisions !== undefined)
        )
          throw new Conflict({ message: unrenderedTreeRefusal(factory.name, factoriesAt(factory.name, 'tree'), 'Nothing was filed.') });
        if (factories.has(factory.name)) throw new Conflict({ message: takenFactoryRefusal(factory.name, file) });
        factories.set(factory.name, structuredClone(factory));
        return file;
      },
      rewrite: (factory) => {
        held(factory.name, 'Nothing was written.');
        factories.set(factory.name, structuredClone(factory));
        return factoriesAt(`${factory.name}.json`);
      },
      remove: (name) => {
        if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal('rm') });
        held(name, 'Nothing was removed.');
        factories.delete(name);
        return factoriesAt(`${name}.json`);
      },
    },
    level: {
      read: (name) => structuredClone(levels.get(named(name))),
      write: (name, level) => {
        if (level.level === undefined && level.raise === undefined) levels.delete(named(name));
        else levels.set(named(name), structuredClone(level));
      },
    },
    rules: {
      read: (name) => {
        held(name, 'Nothing was read.');
        return { words: rules.get(name) ?? null, error: null };
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
        held(name, 'Nothing was cleared.');
        return rules.delete(name);
      },
    },
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
