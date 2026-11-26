/**
 * The Factory door: the one way a program reads and writes a factory — its record (`factories`), its level, its servers and what the
 * controller last observed of it (`status`), which are records of the keyspace (`records.store.ts`), and the files the store keeps beside
 * it, its rules, its instruction and its folder — an Effect service, `FactoryDoor`, whose methods take a factory's name as `FactoryName`
 * and answer an Effect failing with a refusal. Its pattern is the Run door's (`src/door/door.store.ts`, `src/runs/runs.store.ts`).
 *
 * Two halves: the records (`factoryRecords`, `records.store.ts`, over the keyspace at a store's root, or in memory in a test) and the files
 * (`factoryFiles`: `rules.store.ts`, `instruction.store.ts` and `folder.store.ts` at a store's root, so a file is the very bytes it was),
 * and the memory stand-in (`factoryDoorMemory`, `memory.store.ts`), which a test gives its program. All are built by `factoryDoorOver`,
 * so each write is checked the one way on both: a new factory's name as `FactoryName.OnCreate` checks it, and a factory written through
 * the model's `Factory`, whose checks are its invariants — one repository at least, hires and schedules only into a workflow it offers —
 * or `Invalid` names the check broken and nothing is written; a name a level, rules or servers are written under as
 * `FactoryName.OnCreate` checks it. A factory already at a new one's name is `Conflict`. The walks of `test/factory-walks.ts` hold both
 * to one table.
 *
 * The default factory is the door's too, the same on both: it is no record, and the door serves it as one (`DefaultFactory`), listed first
 * and read under its name; every write of it — filed, written back, removed, its rules, its instruction, its level, which is the
 * store's — is refused `Conflict`. Its servers alone are its own record, since every run and card that names no factory runs in it.
 *
 * A factory's own folder is the door's as a whole too (`folder`), for a move between stores: its files read, but those that stay with the
 * store (`FOLDER_STAYS`), placed where none is, and removed — with its level, servers and status records, which are no files of it. The
 * default factory has none to move, and each is refused it `Conflict`.
 *
 * The door's default is rooted (`rootedDoor`): the store at the root the program is given (`StoreRoot`), refused where it was given
 * none, since this door reads no root of its own module's (`test/root-given.test.ts`).
 */
import { Context, Effect, Layer } from 'effect';
import { checked, fromThrow, rootedDoor } from '../../door/door.store.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import { Conflict, Invalid, Missing, type Refusal } from '../../refusal/refusal.ts';
import { labelValuesRefused } from '../../label-spelling/label-spelling.ts';
import type { LabelGiven, LabelValueOffence } from '../../../contracts/label-values.contract.ts';
import { defaultFactoryRefusal, defaultWriteRefusal, instructionAt, type Factory, type FactoryWrite } from '../factory.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { DEFAULT_FACTORY_RECORD, Factory as FactoryModel, FactoryName, isDefaultFactory } from '../factory.model.ts';
import { defaultNamedRefusal, foundFactory, treeChecked } from '../factory.store.ts';
import { folderPlacedAt, folderReadAt, folderRemovedAt } from './folder.store.ts';
import { factoryRecords, isRecordFile, recordsAt } from './records.store.ts';
import type { FactoryDoorShape, FactoryLayer, FactoryRead } from './layer.store.ts';
import { readRules, rulesAtHome, rulesCleared, rulesWritten } from '../rules/rules.store.ts';
import {
  clearInstructionText,
  instructionFileAt,
  readInstructionAt,
  storeKeeps,
  writeInstructionText,
  type FactoryInstruction,
} from '../instruction.store.ts';

export type { FactoryDoorShape, FactoryLayer } from './layer.store.ts';

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
 * The door over `layer`: each method as the layer makes it, each write's name and factory checked before the layer writes; the default
 * factory answered by the door itself — listed first, read as its record, its servers its own, its level none (the store's), and every
 * other write of it, or a read of the rules and instruction it keeps none of, refused `Conflict`.
 * @param layer The layer of reads and writes the door is over: the store's records and files, or memory in a test.
 */
export function factoryDoorOver(layer: FactoryLayer) {
  return {
    ...layer,
    factories: {
      list: () => Effect.map(layer.factories.list(), (names) => [DEFAULT_NAMESPACE, ...names.filter((name) => !isDefault(name))]),
      listed: layer.factories.listed,
      read: (name) => (isDefault(name) ? Effect.succeed(DEFAULT_FACTORY_RECORD) : layer.factories.read(name)),
      create: (factory) =>
        notDefaultBy(
          factory.name,
          'add',
          Effect.gen(function* () {
            yield* nameChecked(factory.name);
            yield* factoryChecked(factory);
            return yield* layer.factories.create(factory);
          }),
        ),
      rewrite: (factory) =>
        notDefault(
          factory.name,
          defaultWriteRefusal('spec'),
          Effect.gen(function* () {
            yield* factoryChecked(factory);
            return yield* layer.factories.rewrite(factory);
          }),
        ),
      remove: (name) => notDefaultBy(name, 'rm', layer.factories.remove(name)),
      moveVolumes: layer.factories.moveVolumes,
    },
    level: {
      read: (name) => (isDefault(name) ? Effect.succeed(undefined) : layer.level.read(name)),
      write: (name, level) =>
        notDefault(name, defaultWriteRefusal('level'), Effect.andThen(nameChecked(name), layer.level.write(name, level))),
    },
    rules: {
      read: (name) => notDefaultBy(name, 'rules', layer.rules.read(name)),
      write: (name, words) => notDefaultBy(name, 'rules', Effect.andThen(nameChecked(name), layer.rules.write(name, words))),
      clear: (name) => notDefaultBy(name, 'rules', layer.rules.clear(name)),
    },
    instruction: {
      read: (name) => notDefaultBy(name, 'instruction', layer.instruction.read(name)),
      write: (name, words) => notDefaultBy(name, 'instruct', layer.instruction.write(name, words)),
      clear: (name) => notDefaultBy(name, 'instruct', layer.instruction.clear(name)),
    },
    servers: {
      ...layer.servers,
      write: (name, servers) => Effect.andThen(nameChecked(name), layer.servers.write(name, servers)),
    },
    status: layer.status,
    folder: {
      read: (name) => notDefault(name, DEFAULT_FOLDER_REFUSAL, layer.folder.read(name)),
      place: (name, files) => notDefault(name, DEFAULT_FOLDER_REFUSAL, Effect.andThen(nameChecked(name), layer.folder.place(name, files))),
      remove: (name) => notDefault(name, DEFAULT_FOLDER_REFUSAL, layer.folder.remove(name)),
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
 * The files of the store `home` the door keeps beside a factory's records, as a layer's `rules`, `instruction` and `folder`: today's
 * files, read and written by the store's own functions. A factory's rules are its tree's where it is made from a template, so the rules
 * ask the factory first (`read`, the records' own), refused as a read refuses it. A folder's removal answers whether there was one.
 * @param home The store's root.
 * @param read Reads the factory `name` as a start reads it, refused with `notDone` said where there is none.
 */
function factoryFiles(home: string, read: FactoryRead) {
  const rulesOf = (name: string, notDone: string) => Effect.map(read(name, notDone), (factory) => rulesAtHome(home, factory));
  const instructionOf = (name: string, notDone: string) =>
    Effect.flatMap(read(name, notDone), (factory) =>
      fromThrow(
        () =>
          instructionRead(factory, instructionFileAt(home, name), readInstructionAt, (file) =>
            storeKeeps(home, name, file),
          ) satisfies FactoryInstruction,
      ),
    );
  const storeKept = (name: string, notDone: string) =>
    Effect.flatMap(instructionOf(name, notDone), (before) =>
      before.store ? Effect.succeed(before) : Effect.fail(folderKeptRefusal(name, before.file)),
    );
  return {
    rules: {
      read: (name) =>
        Effect.flatMap(rulesOf(name, 'There are no rules to read.'), (file) => fromThrow(() => ({ file, ...readRules(file) }))),
      write: (name, words) =>
        Effect.flatMap(read(name, 'Nothing was written.'), (factory) =>
          fromThrow(() => rulesWritten(rulesAtHome(home, factory), factory, words)),
        ),
      clear: (name) => Effect.flatMap(rulesOf(name, 'Nothing was removed.'), (file) => fromThrow(() => rulesCleared(file))),
    },
    instruction: {
      read: (name) => instructionOf(name, 'There is no instruction to read.'),
      write: (name, words) =>
        Effect.flatMap(storeKept(name, 'Nothing was written.'), ({ file }) =>
          fromThrow(() => writeInstructionText(home, name, words, file, instructionFileAt(home, name))),
        ),
      clear: (name) =>
        Effect.flatMap(storeKept(name, 'Nothing was removed.'), ({ file }) => fromThrow(() => clearInstructionText(home, name, file))),
    },
    folder: {
      read: (name) => fromThrow(() => folderReadAt(home, name)),
      place: (name, files) => fromThrow(() => folderPlacedAt(home, name, files)),
      remove: (name) => fromThrow(() => folderRemovedAt(home, name)),
    },
  } satisfies Pick<FactoryLayer, 'rules' | 'instruction' | 'folder'>;
}

/**
 * The layer of the records `records` and the files `files` together: a folder's removal removes its files and then the records beside
 * them, answering whether there was either.
 * @param records The records half, from `factoryRecords`.
 * @param files The files half, from `factoryFiles` or the stand-in's.
 */
export const factoryLayerOf = (records: ReturnType<typeof factoryRecords>, files: Pick<FactoryLayer, 'rules' | 'instruction' | 'folder'>) =>
  ({
    factories: records.factories,
    level: records.level,
    servers: records.servers,
    status: records.status,
    rules: files.rules,
    instruction: files.instruction,
    folder: {
      read: (name) =>
        Effect.gen(function* () {
          const folder = yield* files.folder.read(name);
          const asRecords = yield* records.kept(name);
          const held = new Set(asRecords.map((file) => file.path));
          const all = [...folder.files.filter((file) => !held.has(file.path)), ...asRecords];
          return { ...folder, files: all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) };
        }),
      place: (name, placing) =>
        Effect.gen(function* () {
          const where = yield* files.folder.place(
            name,
            placing.filter((file) => !isRecordFile(file.path)),
          );
          yield* records.placed(name, placing);
          return where;
        }),
      remove: (name) =>
        Effect.gen(function* () {
          const files_ = yield* files.folder.remove(name);
          const kept = yield* records.dropped(name);
          return files_ || kept;
        }),
    },
  }) satisfies FactoryLayer;

/** The Factory door over the store at `root`: its records in the keyspace, its files where they are. */
const filesAt = (root: string) => {
  const records = recordsAt(root);
  return factoryDoorOver(factoryLayerOf(records, factoryFiles(root, records.read)));
};

/**
 * The Factory door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the store at
 * the root the program is given, refused `Invalid` where it was given none — and a test gives `factoryDoorMemory()` with no root at all
 * (`docs/architecture.md`, *The Factory door*).
 */
export const FactoryDoor = Context.Reference<FactoryDoorShape>('agent-orchestrator/FactoryDoor', {
  defaultValue: () => rootedDoor(filesAt, 'Factory door'),
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
const labelValuesRefusal = (factory: string, offences: readonly LabelValueOffence[], notDone: string) => {
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
 * The factories of the store `home`, as the door lists each with its record or why it does not read: for a program that names its
 * store's root.
 * @param home The store's root.
 */
export const listedAt = (home: string) => doorAt(home, (door) => door.factories.listed());

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
 * The factory a start goes to, through the door: the factory `named`, read as a run reads it, else the one factory of the store a
 * repository of which holds the folder `at` (`foundFactory`), with that repository; none, the default factory, only where none holds it
 * and `defaultStarts` lets it. Refused as `foundFactory` refuses it, and the default factory named (`Invalid`).
 * @param named The factory's name the start gives, or undefined where it names none.
 * @param at The folder the start is made from, whose repository finds the factory where none is named.
 * @param fix The start's words for naming a factory, `<name>` in them: `--factory <name>`, or `?factory=<name>`.
 * @param defaultStarts Whether a start that finds no factory goes to the default one.
 */
export const startFactory = Effect.fn('startFactory')(function* (
  named: string | undefined,
  at: string,
  fix: string,
  defaultStarts: boolean,
) {
  const door = yield* FactoryDoor;
  const listing = yield* door.factories.listed();
  if (named === DEFAULT_NAMESPACE) return yield* Effect.fail(defaultNamedRefusal(listing, fix));
  if (named !== undefined) {
    const read = yield* door.factories
      .read(FactoryName.read(named))
      .pipe(
        Effect.catchTag('Missing', (miss) =>
          Effect.fail(new Missing({ message: miss.message.replace(/Nothing was read\.$/, 'Nothing was started.') })),
        ),
      );
    const atName: { factory?: Factory; repo?: string } = { factory: read as Factory };
    return atName;
  }
  const found: { factory?: Factory; repo?: string } = yield* fromThrow(() => foundFactory(listing, at, fix, defaultStarts));
  return found;
});

/**
 * The templated factory `name`, read through the door, and its tree for `who` to write into: refused as `treeChecked` refuses a factory
 * with no tree, the default among them, or one not rendered yet.
 * @param name The factory's name.
 * @param who The command that writes into the tree, named in a refusal.
 */
export const templatedOf = Effect.fn('templatedOf')(function* (name: string, who: string) {
  const filed = yield* factoryOrNone(name);
  const factory = yield* fromThrow(() => treeChecked(name, filed, who));
  return { factory, tree: factory.tree };
});

/**
 * The Factory door over the store `root`, as a layer: for a program that names its root by the door, not by `StoreRoot`.
 * @param root The store's root.
 */
export const factoryDoorAt = (root: string) => Layer.succeed(FactoryDoor)(filesAt(root)) satisfies Layer.Layer<never>;
