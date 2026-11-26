/**
 * The Factory door's records: a factory, its level, its servers and what the controller last observed of it are records of the keyspace
 * (`src/keyspace/keyspace.store.ts`), `/registry/factories/<name>`, `/registry/levels/<name>`, `/registry/servers/<name>` — the default
 * factory's included, whose servers are its alone — and `/registry/applied/<name>` (`factory-keys.ts`), each holding the text of the file
 * it was, so a key the model does not name is kept. This is the door's layer for them: each method reads the store's factories at once
 * as a snapshot (`FactoryHeld`), judges it by `factory.store.ts` — which writes no record — and writes what that answers, each write of
 * several records in one transaction (`within`), so a level written beside the generation it counts, or a move of the volumes, is
 * all-or-nothing.
 *
 * A store's files from before the keyspace — `factories/<name>.json`, and `level.json`, `servers.json` and `status.json` in a factory's
 * folder — are taken up by the kind's import (`FACTORY_FILES`, `src/keyspace/import.store.ts`), level-triggered, and moved aside under
 * `<root>/imported/`, never deleted. A file whose name is no factory's stays where it is and is said in the log (`strays`).
 *
 * A factory's folder (its tree, its applied base, its rules, its instruction) stays files: the door's `folder` and `rules` and
 * `instruction` are over them (`factories.store.ts`), and removing the folder also removes the three records beside the factory's own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { fromThrow } from '../../door/door.store.ts';
import { asideOf, entriesIn, kindKeyspace, kindKeyspaceHeld, namesIn, type ImportKind } from '../../keyspace/import.store.ts';
import { KeyRefused, type Keyspace, type KeyRecord, type KeyTxn } from '../../keyspace/keyspace.store.ts';
import { Conflict, type Refusal } from '../../refusal/refusal.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import { factoryNameRefusal, type Factory } from '../factory.ts';
import {
  createdFactory,
  factoriesDirAt,
  factoryTaken,
  readFactoriesAt,
  readFactoryAt,
  removedFactory,
  rewriteFactoryAt,
  volumesMovedAt,
  type FactoryHeld,
} from '../factory.store.ts';
import { levelDiffers } from './generation.ts';
import { levelOf, levelText } from '../../level/level.store.ts';
import { serversOf, serversTextOf } from '../servers/servers.store.ts';
import { statusOf, statusText } from '../applied/applied.store.ts';
import type { FactoryLevelFile } from '../../level/level.ts';
import { APPLIED_PREFIX, FACTORIES_PREFIX, appliedKey, factoryKey, levelKey, serversKey } from './factory-keys.ts';
import type { FactoryLayer } from './layer.store.ts';
import type { TreeFile } from '../../archive/archive.ts';

/** Opens the keyspace the records are held in, refused as opening it is. */
type Open = Effect.Effect<Keyspace, Refusal>;

/** The keyspace a read reads, or none where the store holds none yet. */
type Held = Effect.Effect<Keyspace | undefined, Refusal>;

/** A write raced by another, as a refusal. */
const raced = (err: KeyRefused) =>
  new Conflict({ message: `${err.key} was written by another while it was written here: run again.` }) satisfies Refusal as Refusal;

/** What a transaction's body fails with, the keyspace's refusal of a write turned into a `Conflict` that says to run again. */
const racedOn = <A>(body: Effect.Effect<A, Refusal | KeyRefused>) =>
  Effect.mapError(body, (err) => (err instanceof KeyRefused ? raced(err) : err)) satisfies Effect.Effect<A, Refusal>;

/** The records under `prefix` as a listing of the keyspace `keyspace` answers them. */
const listedIn = (keyspace: Keyspace) => (prefix: string) => Effect.map(keyspace.list(prefix), (listing) => listing.records);

/**
 * What the store holds of its factories, read through `list`, one listing of each prefix: the snapshot the judgement of `factory.store.ts`
 * reads.
 */
const snapshotOf = (home: string, list: (prefix: string) => Effect.Effect<readonly KeyRecord[]>) =>
  Effect.gen(function* () {
    const texts = new Map<string, { text: string; revision: number }>();
    for (const r of yield* list(FACTORIES_PREFIX)) texts.set(r.key.slice(FACTORIES_PREFIX.length), { text: r.value, revision: r.revision });
    const statuses = new Map<string, string>();
    for (const r of yield* list(APPLIED_PREFIX)) statuses.set(r.key.slice(APPLIED_PREFIX.length), r.value);
    return { home, texts, statuses } satisfies FactoryHeld;
  });

/** The record at `key` in `tx` written as `text` says: made where there is none, replaced where there is one. */
const putIn = (tx: KeyTxn, key: string, text: string) =>
  Effect.flatMap(tx.get(key), (there) =>
    tx.write(key, { verb: there === undefined ? 'create' : 'update', expected: there?.revision ?? null, value: text }),
  );

/** The record at `key` in `tx` deleted: whether there was one. */
const dropIn = (tx: KeyTxn, key: string) =>
  Effect.flatMap(tx.get(key), (there) =>
    there === undefined ? Effect.succeed(false) : Effect.as(tx.write(key, { verb: 'delete', expected: there.revision, value: '' }), true),
  );

/** What each group of the records reads: the store's root, how the keyspace opens, a snapshot of the factories, one record's text. */
type Context = {
  home: string;
  open: Open;
  snapshot: Effect.Effect<FactoryHeld, Refusal>;
  recordOf: (key: string) => Effect.Effect<string | undefined, Refusal>;
  read: (name: string, notDone: string) => Effect.Effect<Factory, Refusal>;
};

/** The factories of the door as records: listed, read, created, rewritten and removed, and the volumes moved, each in one write. */
const factoryRecordsOf = ({ home, open, snapshot, read }: Context) =>
  ({
    list: () => Effect.map(snapshot, (snap) => readFactoriesAt(snap).map((f) => f.name)),
    listed: () => Effect.map(snapshot, readFactoriesAt),
    read: (name) => read(name, 'Nothing was read.'),
    create: (factory) =>
      Effect.gen(function* () {
        const text = yield* fromThrow(() => createdFactory(home, factory));
        const keyspace = yield* open;
        yield* keyspace
          .write(factoryKey(factory.name), { verb: 'create', expected: null, value: text })
          .pipe(Effect.mapError((err) => (err.refusal === 'exists' ? factoryTaken(factory.name) : raced(err))));
        return factoryKey(factory.name);
      }),
    rewrite: (factory) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        return yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              const snap = yield* snapshotOf(home, tx.list);
              const { file, text } = yield* fromThrow(() => rewriteFactoryAt(snap, factory));
              if (text !== undefined)
                yield* tx.write(factoryKey(factory.name), {
                  verb: 'update',
                  expected: snap.texts.get(factory.name)?.revision ?? null,
                  value: text,
                });
              return file;
            }),
          )
          .pipe(racedOn);
      }),
    remove: (name) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        return yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              const snap = yield* snapshotOf(home, tx.list);
              const file = yield* fromThrow(() => removedFactory(snap, name));
              yield* dropIn(tx, factoryKey(name));
              for (const { key } of FOLDER_RECORDS) yield* dropIn(tx, key(name));
              return file;
            }),
          )
          .pipe(racedOn);
      }),
    moveVolumes: () =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        return yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              const snap = yield* snapshotOf(home, tx.list);
              const { moved, left, writes } = volumesMovedAt(snap);
              for (const w of writes)
                yield* tx.write(factoryKey(w.name), {
                  verb: 'update',
                  expected: snap.texts.get(w.name)?.revision ?? null,
                  value: w.text,
                });
              return { moved, left };
            }),
          )
          .pipe(racedOn);
      }),
  }) satisfies FactoryLayer['factories'];

/** The level of the door as records: a write counts the generation, in the same transaction, where the factory is filed. */
const levelRecords = ({ home, open, recordOf }: Context) =>
  ({
    read: (name) => Effect.flatMap(recordOf(levelKey(name)), (text) => fromThrow(() => levelOf(text, name))),
    write: (name, level) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              const before = (yield* tx.get(levelKey(name)))?.value;
              const text = levelText(level);
              if (text === undefined) yield* dropIn(tx, levelKey(name));
              else yield* putIn(tx, levelKey(name), text);
              const snap = yield* snapshotOf(home, tx.list);
              const was = yield* fromThrow(() => levelHeld(before, name));
              const filed = readFactoriesAt(snap).some((f) => f.name === name && !('error' in f));
              if (!levelDiffers(was, level) || !filed) return;
              const { text: counted } = yield* fromThrow(() =>
                rewriteFactoryAt(snap, readFactoryAt(snap, name), 'Nothing was written.', true),
              );
              if (counted !== undefined)
                yield* tx.write(factoryKey(name), {
                  verb: 'update',
                  expected: snap.texts.get(name)?.revision ?? null,
                  value: counted,
                });
            }),
          )
          .pipe(racedOn);
      }),
  }) satisfies FactoryLayer['level'];

/** The servers of the door as records: a write of none holds no record. */
const serversRecords = ({ open, recordOf }: Context) =>
  ({
    read: (name) => Effect.flatMap(recordOf(serversKey(name)), (text) => fromThrow(() => serversOf(text, name))),
    write: (name, servers) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              if (!Object.keys(servers).length) {
                yield* dropIn(tx, serversKey(name));
                return;
              }
              const was = (yield* tx.get(serversKey(name)))?.value;
              yield* putIn(tx, serversKey(name), serversTextOf(was, servers));
            }),
          )
          .pipe(racedOn, Effect.asVoid);
      }),
  }) satisfies FactoryLayer['servers'];

/** The status of the door as records: a write of what is held already is no write. */
const statusRecords = ({ open, recordOf }: Context) =>
  ({
    read: (name) => Effect.map(recordOf(appliedKey(name)), statusOf),
    write: (name, status) =>
      Effect.gen(function* () {
        const keyspace = yield* open;
        const text = statusText(status);
        return yield* keyspace
          .within((tx) =>
            Effect.gen(function* () {
              if ((yield* tx.get(appliedKey(name)))?.value === text) return false;
              yield* putIn(tx, appliedKey(name), text);
              return true;
            }),
          )
          .pipe(racedOn);
      }),
  }) satisfies FactoryLayer['status'];

/**
 * The records of the Factory door over the keyspace `open` opens when a method runs, as the layer's `factories`, `level`, `servers` and
 * `status`, and the factory as a start reads it (`read`), which the files half of the layer asks, and the removal of what a folder's
 * removal takes with it (`dropped`), the records that are files of a folder in a move (`kept`, `placed`). A read asks `held`, and
 * answers none where it answers no keyspace, so a read of a store is not a store made.
 * @param home The store's root, under which a templated factory's tree is.
 * @param open Opens the keyspace the records are held in.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 */
export function factoryRecords(home: string, open: Open, held: Held = open) {
  const snapshot = Effect.gen(function* () {
    const keyspace = yield* held;
    return keyspace === undefined ? { home, texts: new Map(), statuses: new Map() } : yield* snapshotOf(home, listedIn(keyspace));
  });
  const recordOf = (key: string) =>
    Effect.gen(function* () {
      const keyspace = yield* held;
      return keyspace === undefined ? undefined : (yield* keyspace.get(key))?.value;
    });
  const read = (name: string, notDone: string) => Effect.flatMap(snapshot, (snap) => fromThrow(() => readFactoryAt(snap, name, notDone)));
  const context = { home, open, snapshot, recordOf, read };
  const dropped = (name: string) =>
    Effect.gen(function* () {
      const keyspace = yield* held;
      if (keyspace === undefined) return false;
      return yield* keyspace
        .within((tx) =>
          Effect.gen(function* () {
            const gone = [yield* dropIn(tx, levelKey(name)), yield* dropIn(tx, serversKey(name)), yield* dropIn(tx, appliedKey(name))];
            return gone.some(Boolean);
          }),
        )
        .pipe(racedOn);
    });
  const kept = (name: string) =>
    Effect.gen(function* () {
      const found: TreeFile[] = [];
      for (const { file: leaf, key } of MOVING_RECORDS) {
        const text = yield* recordOf(key(name));
        if (text !== undefined) found.push({ path: leaf, mode: 0o644, bytes: new TextEncoder().encode(text) });
      }
      return found;
    });
  const placed = (name: string, files: readonly TreeFile[]) =>
    Effect.gen(function* () {
      const mine = MOVING_RECORDS.flatMap((record) => {
        const file = files.find((f) => f.path === record.file);
        return file === undefined ? [] : [{ key: record.key(name), text: new TextDecoder().decode(file.bytes) }];
      });
      if (mine.length === 0) return;
      const keyspace = yield* open;
      yield* keyspace
        .within((tx) =>
          Effect.gen(function* () {
            for (const { key, text } of mine) yield* putIn(tx, key, text);
          }),
        )
        .pipe(racedOn);
    });
  return {
    factories: factoryRecordsOf(context),
    level: levelRecords(context),
    servers: serversRecords(context),
    status: statusRecords(context),
    read,
    dropped,
    kept,
    placed,
  };
}

/**
 * The level a record held before a write, as `levelOf` reads it: none where it held none, and none where it does not read, which a write
 * replaces whole, so the write counts as a change.
 */
const levelHeld = (text: string | undefined, name: string) => {
  try {
    return levelOf(text, name) satisfies FactoryLevelFile | undefined;
  } catch {
    return undefined;
  }
};

/**
 * The names of the factories' own folders in the store `home` that a person may hold files in: the folder of each factory, whatever its
 * name, as the import reads them.
 */
const foldersOf = (home: string) =>
  entriesIn(factoriesDirAt(home)).filter((entry) =>
    fs.statSync(path.join(factoriesDirAt(home), entry), { throwIfNoEntry: false })?.isDirectory(),
  );

/** The files of a factory's folder the kind takes up, each the record it becomes. */
const FOLDER_RECORDS = [
  { file: 'level.json', key: levelKey },
  { file: 'servers.json', key: serversKey },
  { file: 'status.json', key: appliedKey },
] as const;

/** The records of a folder that travel with a move: its level and servers, and not its status, which the target's controller writes. */
const MOVING_RECORDS = FOLDER_RECORDS.filter((record) => record.file !== 'status.json');

/**
 * The factory files of a store from before the keyspace: `factories/<name>.json`, the factory, and, in a factory's folder
 * `factories/<name>/`, `level.json`, `servers.json` and `status.json`, each taken up as the text it holds — checked as what it is when
 * it is read, so a file that does not read is listed with why, as it was. A `<name>.json` whose name is no factory's, and the default
 * factory's, which is no file, stay where they are, said in the log (`strays`); a hidden file is not said.
 */
export const FACTORY_FILES: ImportKind = {
  name: 'factories',
  folders: (home) => [factoriesDirAt(home), ...foldersOf(home).map((name) => path.join(factoriesDirAt(home), name))],
  files: (home) => [
    ...namesIn(factoriesDirAt(home), '.json')
      .filter((name) => factoryNameRefusal(name) === undefined && name !== DEFAULT_NAMESPACE)
      .map((name) => {
        const file = path.join(factoriesDirAt(home), `${name}.json`);
        return { file, key: factoryKey(name), aside: asideOf(home, file), read: (text: string) => ({ value: text }) };
      }),
    ...foldersOf(home)
      .filter((name) => factoryNameRefusal(name) === undefined)
      .flatMap((name) =>
        FOLDER_RECORDS.map(({ file: leaf, key }) => {
          const file = path.join(factoriesDirAt(home), name, leaf);
          return { file, key: key(name), aside: asideOf(home, file), read: (text: string) => ({ value: text }) };
        }),
      )
      .filter(({ file }) => fs.statSync(file, { throwIfNoEntry: false })?.isFile()),
  ],
  strays: (home) =>
    namesIn(factoriesDirAt(home), '.json')
      .filter((name) => factoryNameRefusal(name) !== undefined || name === DEFAULT_NAMESPACE)
      .map((name) => ({
        entry: path.join(factoriesDirAt(home), `${name}.json`),
        why: 'is no factory: a factory is named by a slug, and the default factory is no file. Remove the file by hand',
      })),
};

/**
 * The records of the Factory door over the keyspace at the store `root`, its files imported first (`FACTORY_FILES`), a read opening none
 * where the store holds none.
 * @param root The store's root.
 */
export const recordsAt = (root: string) => factoryRecords(root, kindKeyspace(root, FACTORY_FILES), kindKeyspaceHeld(root, FACTORY_FILES));

/**
 * Whether `at`, a path from a factory's folder, is a file that is a record of the keyspace and not a file of the store's folder: an older
 * archive's `status.json` too, which a move drops.
 * @param at The path from the factory's folder.
 */
export const isRecordFile = (at: string) => FOLDER_RECORDS.some((record) => record.file === at);
