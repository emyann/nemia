/**
 * The Factory door: the one way a program reads and writes a factory — its file (`factories`), and the files the store keeps beside it,
 * its level, its rules and its servers — an Effect service, `FactoryDoor`, whose methods take a factory's name as `FactoryName` and answer
 * an Effect failing with a refusal. Its pattern is the Run door's (`src/door/door.store.ts`, `src/runs/runs.store.ts`).
 *
 * Two layers: the files (`factoryFiles`, over `factory.store.ts`, `level.store.ts`, `rules.store.ts` and `servers.store.ts` at a store's
 * root, so a file is the very bytes it was and a key the model does not name is kept), and the memory stand-in (`factoryDoorMemory`,
 * `memory.store.ts`), which a test gives its program. Both are built by `factoryDoorOver`, so each write is checked the one way on both:
 * a new factory's name as `FactoryName.OnCreate` checks it, the default factory refused (`Conflict`), and a factory written through the
 * model's `Factory`, whose checks are its invariants — one repository at least, hires and schedules only into a workflow it offers — or
 * `Invalid` names the check broken and nothing is written; a name a level, rules or servers are written under as `FactoryName.OnCreate`
 * checks it. A factory already at a new one's name is `Conflict`. The walks of `test/factory-walks.ts` hold both layers to one table.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was
 * given none, since this door reads no root of its own module's (`test/root-given.test.ts`).
 */
import { Context, Effect, Layer } from 'effect';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, type Invalid } from '../refusal/refusal.ts';
import { defaultFactoryRefusal, DEFAULT_FACTORY, type Factory } from '../factory/factory.ts';
import { Factory as FactoryModel, FactoryName } from '../factory/factory.model.ts';
import { createFactoryAt, readFactoriesAt, readFactoryAt, removeFactoryAt, rewriteFactoryAt } from '../factory/factory.store.ts';
import type { FactoryLevelFile } from '../level/level.ts';
import { readFactoryLevelAt, writeFactoryLevelAt } from '../level/level.store.ts';
import { readRules, rulesAtHome, rulesCleared, rulesWritten, type RulesRead } from '../rules/rules.store.ts';
import type { FactoryServers } from '../servers/index.ts';
import { factoryServers, writeFactoryServers } from '../servers/servers.store.ts';

/**
 * A layer of the Factory door, as plain synchronous methods: the factories (listed by name, read, filed, written back, removed, each
 * write answering the file it wrote), a factory's level (none where it follows the store's), its rules (a read's file, its words or why
 * they do not read; a write's file; whether a clear found any), and its servers (none where it has none).
 */
export type FactoryLayer = {
  readonly factories: {
    readonly list: () => readonly string[];
    readonly read: (name: string) => Factory;
    readonly create: (factory: Factory) => string;
    readonly rewrite: (factory: Factory) => string;
    readonly remove: (name: string) => string;
  };
  readonly level: {
    readonly read: (name: string) => FactoryLevelFile | undefined;
    readonly write: (name: string, level: FactoryLevelFile) => void;
  };
  readonly rules: {
    readonly read: (name: string) => RulesRead & { readonly file: string };
    readonly write: (name: string, words: string) => string;
    readonly clear: (name: string) => boolean;
  };
  readonly servers: {
    readonly read: (name: string) => FactoryServers;
    readonly write: (name: string, servers: FactoryServers) => void;
  };
};

/** The Factory door's shape: each method of `FactoryLayer` answering an Effect, a factory's name taken as `FactoryName`. */
export type FactoryDoorShape = DoorOf<FactoryLayer, FactoryName>;

/** A factory written: what the model's `Factory` refuses of it, its invariants among it. */
const factoryChecked = checked(FactoryModel, (factory: Factory) => `the factory ${factory.name}`);

/** A name a factory, or a file beside one, is written under, as `FactoryName.OnCreate` checks it. */
const nameChecked = checked(FactoryName.OnCreate, (name: string) => `a factory under ${JSON.stringify(name)}`);

/** A new factory's name: as `nameChecked`, and never the default factory's, which is read, never written (`Conflict`). */
const newNameChecked = (name: string): Effect.Effect<string, Conflict | Invalid> =>
  name === DEFAULT_FACTORY ? Effect.fail(new Conflict({ message: defaultFactoryRefusal('add') })) : nameChecked(name);

/** The door over `layer`: each method as `doorOf` makes it, each write's name and factory checked before the layer writes. */
export function factoryDoorOver(layer: FactoryLayer): FactoryDoorShape {
  const door = doorOf<FactoryLayer, FactoryName>(layer);
  return {
    ...door,
    factories: {
      ...door.factories,
      create: (factory) =>
        Effect.gen(function* () {
          yield* newNameChecked(factory.name);
          yield* factoryChecked(factory);
          return yield* door.factories.create(factory);
        }),
      rewrite: (factory) =>
        Effect.gen(function* () {
          yield* factoryChecked(factory);
          return yield* door.factories.rewrite(factory);
        }),
    },
    level: {
      ...door.level,
      write: (name, level) => Effect.andThen(nameChecked(name), door.level.write(name, level)),
    },
    rules: {
      ...door.rules,
      write: (name, words) => Effect.andThen(nameChecked(name), door.rules.write(name, words)),
    },
    servers: {
      ...door.servers,
      write: (name, servers) => Effect.andThen(nameChecked(name), door.servers.write(name, servers)),
    },
  };
}

/**
 * The files of the store `home`, as a layer of the door: today's files, read and written by the store's own functions. A factory's
 * rules are its tree's where it is made from a template, so the rules ask the factory first, refused as a read refuses it.
 */
export function factoryFiles(home: string): FactoryLayer {
  const rulesOf = (name: string, notDone: string) => rulesAtHome(home, readFactoryAt(home, name, notDone));
  return {
    factories: {
      list: () => readFactoriesAt(home).map((f) => f.name),
      read: (name) => readFactoryAt(home, name, 'Nothing was read.'),
      create: (factory) => createFactoryAt(home, factory),
      rewrite: (factory) => rewriteFactoryAt(home, factory),
      remove: (name) => removeFactoryAt(home, name).file,
    },
    level: {
      read: (name) => readFactoryLevelAt(home, name),
      write: (name, level) => writeFactoryLevelAt(home, name, level),
    },
    rules: {
      read: (name) => {
        const file = rulesOf(name, 'There are no rules to read.');
        return { file, ...readRules(file) };
      },
      write: (name, words) => {
        const factory = readFactoryAt(home, name, 'Nothing was written.');
        return rulesWritten(rulesAtHome(home, factory), factory, words);
      },
      clear: (name) => rulesCleared(rulesOf(name, 'Nothing was removed.')),
    },
    servers: {
      read: (name) => factoryServers(home, name),
      write: (name, servers) => writeFactoryServers(home, name, servers),
    },
  };
}

/**
 * The Factory door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at
 * the store's root the program is given, refused `Invalid` where it was given none — so no program's requirements change while the
 * factories' callers move onto it, and a test gives `factoryDoorMemory()` with no root at all (`docs/architecture.md`, *The Factory
 * door*).
 */
export const FactoryDoor = Context.Reference<FactoryDoorShape>('agent-orchestrator/FactoryDoor', {
  defaultValue: () => rootedDoor((root) => factoryDoorOver(factoryFiles(root)), 'Factory door'),
});

/** The Factory door over the files of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`. */
export const factoryDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(FactoryDoor)(factoryDoorOver(factoryFiles(root)));
