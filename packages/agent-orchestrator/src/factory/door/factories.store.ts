/**
 * The Factory door: the one way a program reads and writes a factory — its file (`factories`), and the files the store keeps beside it, its
 * level, its rules, its instruction and its servers — an Effect service, `FactoryDoor`, whose methods take a factory's name as
 * `FactoryName` and answer an Effect failing with a refusal. Its pattern is the Run door's (`src/door/door.store.ts`,
 * `src/runs/runs.store.ts`).
 *
 * Two layers: the files (`factoryFiles`, over `factory.store.ts`, `level.store.ts`, `rules.store.ts`, `instruction.store.ts`,
 * `servers.store.ts` and `folder.store.ts` at a store's root, so a file is the very bytes it was and a key the model does not name is
 * kept), and the memory stand-in (`factoryDoorMemory`, `memory.store.ts`), which a test gives its program. Both are built by
 * `factoryDoorOver`, so each write is checked the one way on both: a new factory's name as `FactoryName.OnCreate` checks it, and a factory
 * written through the model's `Factory`, whose checks are its invariants — one repository at least, hires and schedules only into a
 * workflow it offers — or `Invalid` names the check broken and nothing is written; a name a level, rules or servers are written under as
 * `FactoryName.OnCreate` checks it. A factory already at a new one's name is `Conflict`. The walks of `test/factory-walks.ts` hold both
 * layers to one table.
 *
 * The default factory is the door's too, the same on both layers: it is no file, and the door serves it as a record (`DefaultFactory`),
 * listed first and read under its name; every write of it — filed, written back, removed, its rules, its instruction, its level, which is
 * the store's — is refused `Conflict`. Its servers alone are its own record, since every run and card that names no factory runs in it.
 *
 * A factory's own folder is the door's as a whole too (`folder`), for a move between stores: its files read, but those that stay with the
 * store (`FOLDER_STAYS`), placed where none is, and removed. The default factory has none to move, and each is refused it `Conflict`.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was given
 * none, since this door reads no root of its own module's (`test/root-given.test.ts`).
 */
import { Context, Effect, Layer } from 'effect';
import { checked, doorOf, rootedDoor, type DoorOf } from '../../door/door.store.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import { Conflict, Invalid, Missing, type Refusal } from '../../refusal/refusal.ts';
import { labelValuesRefused } from '../../label-spelling/label-spelling.ts';
import type { LabelGiven, LabelValueOffence } from '../../../contracts/label-values.contract.ts';
import {
  defaultFactoryRefusal,
  defaultWriteRefusal,
  instructionAt,
  type Factory,
  type FactoryListing,
  type FactoryWrite,
} from '../factory.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { DEFAULT_FACTORY_RECORD, Factory as FactoryModel, FactoryName, isDefaultFactory, type FactoryRecord } from '../factory.model.ts';
import {
  createFactoryAt,
  factoryNamesAt,
  readFactoriesAt,
  readFactoryAt,
  removeFactoryAt,
  rewriteFactoryAt,
  startFactoryAt,
  treeChecked,
  volumesMovedAt,
  type VolumesMoved,
} from '../factory.store.ts';
import { levelDiffers } from './generation.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { folderPlacedAt, folderReadAt, folderRemovedAt, type FolderRead } from './folder.store.ts';
import type { FactoryLevelFile } from '../../level/level.ts';
import { readFactoryLevel, writeFactoryLevel } from '../../level/level.store.ts';
import { readRules, rulesAtHome, rulesCleared, rulesWritten, type RulesRead } from '../rules/rules.store.ts';
import type { FactoryServers } from '../servers/index.ts';
import { factoryServers, writeFactoryServers } from '../servers/servers.store.ts';
import {
  clearInstructionText,
  instructionFileAt,
  readInstructionAt,
  storeKeeps,
  writeInstructionText,
  type FactoryInstruction,
} from '../instruction.store.ts';

/**
 * A layer of the Factory door, as plain synchronous methods: the factories filed (listed by name, listed as each reads with its file —
 * or why its file does not read, so one bad file hides no other — read, filed, written back, removed, each write answering the file it
 * wrote, and the files an earlier release wrote moved once into one list of volumes, answering each moved and each left with why), a
 * factory's level (none where it follows the store's), its rules (a read's file, its words or
 * why they do not read; a write's file; whether a clear found any), its instruction (where it is kept and its words; the text the store
 * keeps written, answering its file, or cleared, answering whether there was any), its servers (none where it has none), and its own
 * folder as a whole (its files, by path from it, sorted, but those that stay with the store, which it names; placed where none is,
 * answering the folder, `Conflict` where one is; removed, answering whether there was one). A layer knows no default factory: the door
 * answers it before a layer is asked.
 */
export type FactoryLayer = {
  readonly factories: {
    readonly list: () => readonly string[];
    readonly listed: () => readonly FactoryListing[];
    readonly read: (name: string) => Factory;
    readonly create: (factory: Factory) => string;
    readonly rewrite: (factory: Factory) => string;
    readonly remove: (name: string) => string;
    readonly moveVolumes: () => VolumesMoved;
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
  readonly instruction: {
    readonly read: (name: string) => FactoryInstruction;
    readonly write: (name: string, words: string) => string;
    readonly clear: (name: string) => boolean;
  };
  readonly servers: {
    readonly read: (name: string) => FactoryServers;
    readonly write: (name: string, servers: FactoryServers) => void;
  };
  readonly folder: {
    readonly read: (name: string) => FolderRead;
    readonly place: (name: string, files: readonly TreeFile[]) => string;
    readonly remove: (name: string) => boolean;
  };
};

/** The door's methods as `doorOf` makes them of a layer's. */
type Doored = DoorOf<FactoryLayer, FactoryName>;

/**
 * The Factory door's shape: each method of `FactoryLayer` answering an Effect, a factory's name taken as `FactoryName`; a factory read
 * answers its record (`FactoryRecord`), the default factory's among them.
 */
export type FactoryDoorShape = Omit<Doored, 'factories'> & {
  readonly factories: Omit<Doored['factories'], 'read'> & {
    readonly read: (name: FactoryName) => Effect.Effect<FactoryRecord, Refusal>;
  };
};

/** A factory written: what the model's `Factory` refuses of it, its invariants among it. */
const factoryChecked = checked(FactoryModel, (factory: Factory) => `the factory ${factory.name}`);

/** A name a factory, or a file beside one, is written under, as `FactoryName.OnCreate` checks it. */
const nameChecked = checked(FactoryName.OnCreate, (name: string) => `a factory under ${JSON.stringify(name)}`);

/** Whether `name` is the default factory's. */
const isDefault = (name: string) => name === DEFAULT_NAMESPACE;

/** `act` on the factory `name`, or, the default factory's, `Conflict` in `refusal`'s words: what the door refuses of the default. */
const notDefault = <A>(name: string, refusal: string, act: Effect.Effect<A, Refusal>) =>
  isDefault(name) ? Effect.fail(new Conflict({ message: refusal })) : act;

/** The refusal of the default factory's folder, which no move takes: it is no file, and its runs and cards are the store's own. */
const DEFAULT_FOLDER_REFUSAL = `\`${DEFAULT_NAMESPACE}\` is the default factory: it holds every run and card that names no factory, and has no folder of its own to move. Move a factory nemia factory ls lists. Nothing was moved.`;

/** `act` on the factory `name`, refused for the default factory as `nemia factory <verb>` is (`defaultFactoryRefusal`). */
const notDefaultBy = <A>(name: string, verb: FactoryWrite, act: Effect.Effect<A, Refusal>) =>
  notDefault(name, defaultFactoryRefusal(verb), act);

/**
 * The door over `layer`: each method as `doorOf` makes it, each write's name and factory checked before the layer writes; the default
 * factory answered by the door itself — listed first, read as its record, its servers its own, its level none (the store's), and every
 * other write of it, or a read of the rules and instruction it keeps none of, refused `Conflict`.
 * @param layer The layer of reads and writes the door is over: the store's files, or memory in a test.
 */
export function factoryDoorOver(layer: FactoryLayer) {
  const door = doorOf<FactoryLayer, FactoryName>(layer);
  return {
    ...door,
    factories: {
      list: () => Effect.map(door.factories.list(), (names) => [DEFAULT_NAMESPACE, ...names.filter((name) => !isDefault(name))]),
      listed: door.factories.listed,
      read: (name) => (isDefault(name) ? Effect.succeed(DEFAULT_FACTORY_RECORD) : door.factories.read(name)),
      create: (factory) =>
        notDefaultBy(
          factory.name,
          'add',
          Effect.gen(function* () {
            yield* nameChecked(factory.name);
            yield* factoryChecked(factory);
            return yield* door.factories.create(factory);
          }),
        ),
      rewrite: (factory) =>
        notDefault(
          factory.name,
          defaultWriteRefusal('spec'),
          Effect.gen(function* () {
            yield* factoryChecked(factory);
            return yield* door.factories.rewrite(factory);
          }),
        ),
      remove: (name) => notDefaultBy(name, 'rm', door.factories.remove(name)),
      moveVolumes: door.factories.moveVolumes,
    },
    level: {
      read: (name) => (isDefault(name) ? Effect.succeed(undefined) : door.level.read(name)),
      write: (name, level) =>
        notDefault(name, defaultWriteRefusal('level'), Effect.andThen(nameChecked(name), door.level.write(name, level))),
    },
    rules: {
      read: (name) => notDefaultBy(name, 'rules', door.rules.read(name)),
      write: (name, words) => notDefaultBy(name, 'rules', Effect.andThen(nameChecked(name), door.rules.write(name, words))),
      clear: (name) => notDefaultBy(name, 'rules', door.rules.clear(name)),
    },
    instruction: {
      read: (name) => notDefaultBy(name, 'instruction', door.instruction.read(name)),
      write: (name, words) => notDefaultBy(name, 'instruct', door.instruction.write(name, words)),
      clear: (name) => notDefaultBy(name, 'instruct', door.instruction.clear(name)),
    },
    servers: {
      ...door.servers,
      write: (name, servers) => Effect.andThen(nameChecked(name), door.servers.write(name, servers)),
    },
    folder: {
      read: (name) => notDefault(name, DEFAULT_FOLDER_REFUSAL, door.folder.read(name)),
      place: (name, files) => notDefault(name, DEFAULT_FOLDER_REFUSAL, Effect.andThen(nameChecked(name), door.folder.place(name, files))),
      remove: (name) => notDefault(name, DEFAULT_FOLDER_REFUSAL, door.folder.remove(name)),
    },
  } satisfies FactoryDoorShape;
}

/**
 * The Conflict of a write of the text the store keeps for the factory `name`, whose file keeps its instruction at `file`, in its first
 * folder: the store writes no file there.
 * @param name The factory's name.
 * @param file The file in the factory's first folder its instruction is read from.
 */
export const folderKeptRefusal = (name: string, file: string) =>
  new Conflict({
    message: `${name}'s instruction is read from ${file}, in the factory's first folder, and the store writes no file there: edit it in the folder, or keep it in the store first — nemia factory instruction ${name} --store. Nothing was written.`,
  });

/**
 * The instruction of `factory` as it reads, `storeFile` the file the store keeps for it, `words` how the words kept at a place are read,
 * and `stored` whether the store keeps text at a file: where it is kept (`instructionAt`), the path its file names, and what is there.
 * @param factory The factory whose instruction is read.
 * @param storeFile The file the store keeps the factory's instruction in.
 * @param words Reads the words kept where the instruction is, or why they do not read.
 * @param stored Whether the store keeps text at a file, by its path.
 */
export function instructionRead(
  factory: Factory,
  storeFile: string,
  words: (at: ReturnType<typeof instructionAt>) => { words: string | null; error: string | null },
  stored: (file: string) => boolean,
) {
  const at = instructionAt(factory, storeFile);
  return {
    name: factory.name,
    path: at.in === 'folder' && factory.instruction !== undefined ? at.path : null,
    store: at.in === 'store',
    file: at.file,
    ...words(at),
    stored: stored(factory.tree === undefined ? storeFile : at.file),
  } satisfies FactoryInstruction;
}

/**
 * The level a factory's file held before a write, as `read` reads it: none where it held none, and none where it does not read, which a
 * write replaces whole, so the write counts as a change.
 */
const levelHeld = (read: () => FactoryLevelFile | undefined) => {
  try {
    return read() satisfies FactoryLevelFile | undefined;
  } catch {
    return undefined;
  }
};

/**
 * The files of the store `home`, as a layer of the door: today's files, read and written by the store's own functions. A factory's
 * rules are its tree's where it is made from a template, so the rules ask the factory first, refused as a read refuses it. Its
 * generation is counted by the file's writes: filed at 1 (`createFactoryAt`), one more by a write back that changes its spec
 * (`rewriteFactoryAt`) and by a level written that changes it, of a factory that has a file.
 * @param home The store's root.
 */
export function factoryFiles(home: string) {
  const rulesOf = (name: string, notDone: string) => rulesAtHome(home, readFactoryAt(home, name, notDone));
  const instructionOf = (name: string, notDone: string) =>
    instructionRead(readFactoryAt(home, name, notDone), instructionFileAt(home, name), readInstructionAt, (file) =>
      storeKeeps(home, name, file),
    ) satisfies FactoryInstruction;
  const storeKept = (name: string, notDone: string) => {
    const before = instructionOf(name, notDone);
    if (!before.store) throw folderKeptRefusal(name, before.file);
    return before satisfies FactoryInstruction;
  };
  return {
    factories: {
      list: () => readFactoriesAt(home).map((f) => f.name),
      listed: () => readFactoriesAt(home),
      read: (name) => readFactoryAt(home, name, 'Nothing was read.'),
      create: (factory) => createFactoryAt(home, factory),
      rewrite: (factory) => rewriteFactoryAt(home, factory),
      remove: (name) => removeFactoryAt(home, name).file,
      moveVolumes: () => volumesMovedAt(home),
    },
    level: {
      read: (name) => readFactoryLevel(home, name),
      write: (name, level) => {
        const was = levelHeld(() => readFactoryLevel(home, name));
        writeFactoryLevel(home, name, level);
        if (levelDiffers(was, level) && factoryNamesAt(home).includes(name))
          rewriteFactoryAt(home, readFactoryAt(home, name), 'Nothing was written.', true);
      },
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
    instruction: {
      read: (name) => instructionOf(name, 'There is no instruction to read.'),
      write: (name, words) =>
        writeInstructionText(home, name, words, storeKept(name, 'Nothing was written.').file, instructionFileAt(home, name)),
      clear: (name) => clearInstructionText(home, name, storeKept(name, 'Nothing was removed.').file),
    },
    servers: {
      read: (name) => factoryServers(home, name),
      write: (name, servers) => writeFactoryServers(home, name, servers),
    },
    folder: {
      read: (name) => folderReadAt(home, name),
      place: (name, files) => folderPlacedAt(home, name, files),
      remove: (name) => folderRemovedAt(home, name),
    },
  } satisfies FactoryLayer;
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

/**
 * The factory `name` filed, read through the door: what a verb that changes a factory reads, the default factory, which `nemia factory
 * <verb>` does not take, refused `Conflict` as the door refuses its writes. A write asked it, so a miss says nothing was changed.
 * @param name The factory's name, as the person typed it.
 * @param verb The `nemia factory` verb that asks, named in the default factory's refusal.
 */
export const filedFactory = (name: string, verb: FactoryWrite) =>
  Effect.gen(function* () {
    const record = yield* (yield* FactoryDoor).factories
      .read(FactoryName.read(name))
      .pipe(
        Effect.catchTag('Missing', (miss) =>
          Effect.fail(new Missing({ message: miss.message.replace(/Nothing was read\.$/, 'Nothing was changed.') })),
        ),
      );
    return isDefaultFactory(record) ? yield* Effect.fail(new Conflict({ message: defaultFactoryRefusal(verb) })) : record;
  });

/**
 * The factory `name` filed, read through the door; none for no name and for the default, which has no spec of its own.
 * @param name The factory's name, or undefined where none is named.
 */
export const factoryOrNone = (name: string | undefined) =>
  name === undefined
    ? Effect.succeed(undefined)
    : Effect.gen(function* () {
        const record = yield* (yield* FactoryDoor).factories.read(FactoryName.read(name));
        return isDefaultFactory(record) ? undefined : record;
      });

/**
 * The refusal of `offences` in the factory `factory`: each label refused with the values its key takes, what to type instead, then what
 * was not done.
 * @param factory The factory's name.
 * @param offences The labels refused, each with the values its key takes.
 * @param notDone What the caller did not do, said last.
 */
export const labelValuesRefusal = (factory: string, offences: readonly LabelValueOffence[], notDone: string) => {
  const each = offences.map((o) => `${o.key}=${o.value}: the factory ${factory} takes ${o.key}=${o.takes.join('|')}`).join('; ');
  const first = offences[0];
  const again =
    first === undefined
      ? ''
      : ` Give ${first.key} one of those values, as in ${first.key}=${first.takes[0] ?? '<value>'}, or leave it out, and type it again.`;
  return `${each}.${again} ${notDone}`;
};

/**
 * Refuses `Invalid` the labels of `given` the factory `factory` does not take (`labelValuesRefused`), naming each and the values its key
 * takes, then `notDone`. Silent for no factory, the default, a factory not filed or one that does not read, and a label set empty, which
 * takes the key's value away: a write is never refused for a factory the start or the pass judges.
 * @param factory The factory the cards or runs written are of, by name; none for the default.
 * @param given The labels the write gives, by key: only these are judged.
 * @param notDone What the caller did not do, said at the end of the refusal, as `Nothing was filed.`.
 */
export const labelValuesJudged = Effect.fn('labelValuesJudged')(function* (
  factory: string | undefined,
  given: Readonly<Record<string, string>>,
  notDone: string,
) {
  const labels: readonly LabelGiven[] = Object.entries(given)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({ key, value }));
  if (factory === undefined || labels.length === 0) return;
  const filed = yield* factoryOrNone(factory).pipe(Effect.orElseSucceed(() => undefined));
  const values = filed?.labelValues;
  if (values === undefined) return;
  const rules = Object.entries(values).map(([key, taken]) => ({ key, values: taken }));
  const offences = labelValuesRefused(rules, labels);
  if (offences.length) return yield* Effect.fail(new Invalid({ message: labelValuesRefusal(factory, offences, notDone) }));
});

/**
 * `use` of the Factory door the program is given, its default's root `home`: for a program that names its store's root rather than
 * being given `StoreRoot`.
 * @param home The store's root the door's default is rooted at.
 * @param use What to do with the door.
 */
export const doorAt = <A>(home: string, use: (door: FactoryDoorShape) => Effect.Effect<A, Refusal>) =>
  Effect.provideService(
    Effect.gen(function* () {
      return yield* use(yield* FactoryDoor);
    }),
    StoreRoot,
    home,
  );

/**
 * `use` of the Factory door over the files of the store `home`, run at once, its refusal thrown: for a synchronous caller that names its
 * root and is no program yet, so its reads and writes are the door's, checked as the door checks them.
 * @param home The store's root.
 * @param use What to do with the door.
 */
export const doorAtOnce = <A>(home: string, use: (door: FactoryDoorShape) => Effect.Effect<A, Refusal>) =>
  Effect.runSync(use(factoryDoorOver(factoryFiles(home)))) satisfies A;

/** A tree's check, said beside the door that reads the factory it is of. */
export { treeChecked };

/**
 * What the factories' store judges and names without reading a factory, said through the door so no file of `src` but the door's
 * imports the store (`factories.store.test.ts`): a name's check, a factory's repositories, where the factories are, a wiring's and a
 * schedule's judgement.
 */
export {
  clonesOf,
  factoriesDirAt,
  refuseName,
  scheduleOf,
  scheduleRefused,
  volumesGiven,
  wiringChecked,
  wiringNamesRefused,
} from '../factory.store.ts';

/**
 * Every factory of the store `home` as its file reads, or why it does not, through the door at once: the default, which is no file, left
 * out.
 * @param home The store's root.
 */
export const listedAtOnce = (home: string) => doorAtOnce(home, (door) => door.factories.listed());

/**
 * The factory a start in the store `home` goes to, named or found from the folder `at` (`startFactoryAt`), the default factory only where
 * `defaultStarts` lets it.
 * @param home The store's root.
 * @param named The factory's name the start gives, or undefined where it names none.
 * @param at The folder the start is made from, whose repository finds the factory where none is named.
 * @param fix The start's words for naming a factory, `<name>` in them: `--factory <name>`, or `?factory=<name>`.
 * @param defaultStarts Whether a start that finds no factory goes to the default one.
 */
export const startFactoryAtOnce = (home: string, named: string | undefined, at: string, fix: string, defaultStarts: boolean) =>
  startFactoryAt(home, named, at, fix, defaultStarts) satisfies { factory?: Factory; repo?: string } as {
    factory?: Factory;
    repo?: string;
  };

/**
 * The factory `name` of the store `home`, as a start or a filing in it reads it: refused as `readFactoryAt` refuses it, `notDone` saying
 * what the caller did not do. For a caller that is no program and names what it did not do.
 * @param home The store's root.
 * @param name The factory's name.
 * @param notDone What the caller did not do, said at the end of a refusal.
 */
export const readFactoryAtOnce = (home: string, name: string, notDone: string) => readFactoryAt(home, name, notDone) satisfies Factory;

/**
 * The factory `name` filed in the store `home`, read through the door at once; none for the default, which has no spec of its own.
 * @param home The store's root.
 * @param name The factory's name.
 */
export const filedAtOnce = (home: string, name: string) =>
  doorAtOnce(home, (door) =>
    Effect.map(door.factories.read(FactoryName.read(name)), (record) => (isDefaultFactory(record) ? undefined : record)),
  );

/**
 * The templated factory `name` in the store `home`, read through the door, and its tree for `who` to write into: refused as
 * `treeChecked` refuses a factory with no tree, the default among them, or one not rendered yet.
 * @param home The store's root.
 * @param name The factory's name.
 * @param who The command that writes into the tree, named in a refusal.
 */
export const templatedAtOnce = (home: string, name: string, who: string) => {
  const factory = treeChecked(name, filedAtOnce(home, name), who);
  return { factory, tree: factory.tree };
};

/**
 * The tree of the factory `name` in the store `home`, as `templatedAtOnce` reads it.
 * @param home The store's root.
 * @param name The factory's name.
 * @param who The command that writes into the tree, named in a refusal.
 */
export const templatedTreeOf = (home: string, name: string, who: string) => templatedAtOnce(home, name, who).tree;

/**
 * The Factory door over the files of the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`.
 * @param root The store's root.
 */
export const factoryDoorFiles = (root: string) =>
  Layer.succeed(FactoryDoor)(factoryDoorOver(factoryFiles(root))) satisfies Layer.Layer<never>;

/**
 * The factory `name` filed in the store `home`, read through the door at once, for `verb`: refused as `filedFactory` refuses it, the
 * default factory among it, which has no spec of its own.
 * @param home The store's root.
 * @param name The factory's name.
 * @param verb The `nemia factory` verb that asks, named in the default factory's refusal.
 */
export const factoryAtOnce = (home: string, name: string, verb: FactoryWrite) =>
  Effect.runSync(Effect.provide(filedFactory(name, verb), factoryDoorFiles(home)));
