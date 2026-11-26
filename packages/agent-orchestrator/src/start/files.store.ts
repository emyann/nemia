/**
 * The File door: the one way a program reads and writes the files a factory keeps for a start to hand its run's steps (`objects`'
 * `FileObject`, uploaded by `POST /api/namespaces/<namespace>/files`). Each File is a record of the keyspace
 * (`src/keyspace/keyspace.store.ts`) under Kubernetes' registry layout, `/registry/files/<namespace>/<id>`, holding its file object, its
 * `digest` sha256 of its bytes; the bytes stay a file, `files/<namespace>/<id>` under the store's root, which no record holds. A File is
 * written first as `<id>.part`, as its bytes come, hashed as they are written (`begin`), then kept (`keep`: the part renamed to its bytes,
 * then its record made) or let go of (`drop`: its record deleted, then its bytes); a start finds one by its id in its own namespace
 * (`read`), and a record that carries one names it by its pointer (`pointer`, objects' `FilePointer`), which the keyspace holds to a live
 * File.
 *
 * Every File no inbox card names — a card's record, or a card file not yet taken up — is let go of `FILE_KEPT_FOR` after it was
 * uploaded (`pruned`, which each upload and each card's removal asks first, as `fileLetGo` decides): its record deleted through the
 * keyspace, which refuses while a live record points to it (`referenced`, the File kept), then its bytes. The same pass removes bytes and
 * parts no live record names that are older than a day, what a write cut off between its bytes and its record left: read afresh on each
 * pass, nothing carried between them. A run copies what it is handed into its own `inputs/`, so a File let go of takes nothing from a run,
 * and a card keeps its Files while its text names their ids.
 *
 * An Effect service, `FileDoor`, its default rooted (`rootedDoor`) as the Proposal door's is; a test gives it `fileDoorMemory(root)`
 * (`memory.store.ts`), the same code over an in-memory keyspace, its bytes under the root it is given. Both are built by `fileRecords`,
 * and the walks of `test/file-walks.ts` hold both to one table.
 *
 * A store's File records from before the keyspace (`files/<namespace>/<id>.json`) are imported the first time a process opens the store's
 * keyspace through this door, each with the digest of its bytes, then moved aside to `imported/files/<namespace>/<id>.json`, never
 * deleted; a record whose bytes are gone, or that does not read, stays where it is, said in the log.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Option, Schema, Semaphore } from 'effect';
import { FILE_ID_PREFIX, FILE_KEPT_FOR, FileObject, type FilePointer } from 'objects';
import { checked, fromThrow, rootedDoor } from '../door/door.store.ts';
import { FACTORY_NAME } from '../factory/factory.ts';
import { fileLetGo } from '../inbox/index.ts';
import { firstPiece } from '../piece/piece.ts';
import { keyspaceAt, keyspaceFile, type KeyRecord, type Keyspace } from '../keyspace/keyspace.store.ts';
import { Conflict, Missing, type Refusal } from '../refusal/refusal.ts';

/** A File's id: the prefix, then 32 hexadecimal digits of a random number, so no id is guessed from another. */
const FILE_ID = new RegExp(`^${FILE_ID_PREFIX}[0-9a-f]{32}$`);

/** Every File id written anywhere in a text, as the prune finds a card's: the prefix, then 32 hexadecimal digits. */
const FILE_IDS = new RegExp(`${FILE_ID_PREFIX}[0-9a-f]{32}`, 'g');

/** A File's record decoded: none where it does not read as a file object. */
const fileIn = Schema.decodeUnknownOption(Schema.fromJsonString(FileObject));

/** A File's record of before the keyspace, decoded: a file object that may carry no digest, which the import hashes again. */
const formerFileIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ ...FileObject.fields, digest: Schema.optionalKey(Schema.String) })),
);

/** A File kept: written as objects' `FileObject` decodes it. */
const fileChecked = checked(FileObject, (file: FileObject) => `the file ${file.id}`);

/** The keyspace's prefix of every File, and of the namespace `namespace`'s. */
const PREFIX = '/registry/files/';

/**
 * The key of the File `id` of `namespace` in the keyspace, what a record that points to it names in its write's `points`.
 * @param namespace The File's namespace, a factory's name or `default`.
 * @param id The File's id.
 */
export const fileKey = (namespace: string, id: string) => `${PREFIX}${namespace}/${id}`;

/** The namespace's name as the store keeps it: `default`, or a factory's. */
const namespaceKept = (namespace: string) => namespace === 'default' || FACTORY_NAME.test(namespace);

/**
 * The folder the bytes of the Files of `namespace` are kept in, under the store's `files/`.
 * @param home The store's root.
 * @param namespace The namespace, a factory's name or `default`.
 */
export const filesDir = (home: string, namespace: string) => path.join(home, 'files', namespace);

/** The names of the entries of `dir`, none where it is not there. */
const entriesOf = (dir: string) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** The keyspace's prefix of every card of the inbox (`src/cards/cards.store.ts`), whose text a prune reads for the Files it names. */
const CARDS = '/registry/cards/';

/**
 * Every File id written in any entry of the store's inbox not yet taken up as a card's record, a card that does not read included, so a
 * card nobody can parse loses none of its Files; read afresh on each prune, nothing carried between them. The cards' records are read
 * beside it, and each points to the Files its text names, which the keyspace keeps while it stands.
 * @param home The store's root.
 */
function namedByCards(home: string) {
  const inbox = path.join(home, 'inbox');
  const named = new Set<string>();
  for (const entry of entriesOf(inbox)) {
    const at = path.join(inbox, entry);
    if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) continue;
    for (const id of fs.readFileSync(at, 'utf8').match(FILE_IDS) ?? []) named.add(id);
  }
  return named;
}

/** sha256 of the bytes at `at`, as a digest, read a chunk at a time and never held whole. */
function digestOf(at: string) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(at, 'r');
  try {
    const chunk = Buffer.alloc(1 << 20);
    for (let read = fs.readSync(fd, chunk); read > 0; read = fs.readSync(fd, chunk)) hash.update(chunk.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * A File begun: its id, the bytes written to its part as they come (`write`), its part closed once they have all come (`close`), and the
 * digest of what was written (`digest`), read once it is closed.
 */
export type FileBegun = {
  readonly id: string;
  readonly write: (chunk: Uint8Array) => void;
  readonly close: () => void;
  readonly digest: () => string;
};

/** A File kept, and the path of its bytes. */
export type FileHeld = { readonly file: FileObject; readonly path: string };

/** A File as a record names it: its key in the keyspace, and its pointer. */
export type FilePointed = { readonly key: string; readonly pointer: FilePointer };

/** The File door's shape: a File begun, kept, let go of and read; the Files past their day let go of; and a File's pointer. */
export type FileDoorShape = {
  readonly files: {
    readonly begin: (namespace: string, now: number) => Effect.Effect<FileBegun | undefined, Refusal>;
    readonly keep: (namespace: string, file: FileObject) => Effect.Effect<FileObject, Refusal>;
    readonly drop: (namespace: string, id: string) => Effect.Effect<void, Refusal>;
    readonly read: (namespace: string, id: string) => Effect.Effect<FileHeld | undefined, Refusal>;
    readonly pruned: (now: number) => Effect.Effect<readonly string[], Refusal>;
    readonly pointer: (namespace: string, id: string) => Effect.Effect<FilePointed | undefined, Refusal>;
  };
};

/** The File a record holds, by its namespace (the key's), or undefined where it does not read. */
function heldOf(record: KeyRecord) {
  const namespace = firstPiece(record.key.slice(PREFIX.length), '/');
  const file = Option.getOrUndefined(fileIn(record.value));
  return file === undefined ? undefined : { namespace, file };
}

/** The keyspace a door's read reads, or undefined where the store holds none yet. */
type Held = Effect.Effect<Keyspace | undefined, Refusal>;

/** The File `id` of `namespace` the keyspace `held` holds, and the path of its bytes under `home`; undefined where it holds none. */
const readIn = (held: Held, home: string, namespace: string, id: string) =>
  Effect.gen(function* () {
    if (!FILE_ID.test(id) || !namespaceKept(namespace)) return undefined;
    const keyspace = yield* held;
    const record = keyspace === undefined ? undefined : yield* keyspace.get(fileKey(namespace, id));
    const file = record === undefined ? undefined : heldOf(record)?.file;
    if (file === undefined) return undefined;
    const bytes = path.join(filesDir(home, namespace), id);
    return fs.statSync(bytes, { throwIfNoEntry: false })?.isFile() ? ({ file, path: bytes } satisfies FileHeld) : undefined;
  });

/**
 * The record `record` of `keyspace` let go of where `fileLetGo` says, deleted through the keyspace, which refuses while a live record
 * points to it, then its bytes under `home`: the File's name as `<namespace>/<id>` where it was let go of, undefined where it is kept.
 */
const recordPruned = (keyspace: Keyspace, record: KeyRecord, home: string, named: ReadonlySet<string>, now: number) =>
  Effect.gen(function* () {
    const one = heldOf(record);
    if (one === undefined) {
      yield* Effect.logWarning(`the record ${record.key} does not read as a File, and was kept: say so to whoever keeps this nemia`);
      return undefined;
    }
    const at = Date.parse(one.file.createdAt);
    const writtenAt = Number.isNaN(at) ? 0 : at;
    if (!fileLetGo({ writtenAt, named: named.has(one.file.id) }, Math.floor(now), FILE_KEPT_FOR)) return undefined;
    const deleted = yield* Effect.result(keyspace.write(record.key, { verb: 'delete', expected: record.revision, value: '' }));
    if (deleted._tag === 'Failure') return undefined;
    fs.rmSync(path.join(filesDir(home, one.namespace), one.file.id), { force: true });
    return `${one.namespace}/${one.file.id}`;
  });

/**
 * The bytes and parts under `home`'s Files that no live record names (`live`, by key) and last written a day or more before `now`,
 * removed: what a write cut off between its bytes and its record left. Their names, as `<namespace>/<file>`.
 */
function strayPruned(home: string, live: ReadonlySet<string>, now: number) {
  const gone: string[] = [];
  for (const namespace of entriesOf(path.join(home, 'files')).filter(namespaceKept)) {
    const dir = filesDir(home, namespace);
    for (const name of entriesOf(dir)) {
      const id = name.replace(/\.part$/, '');
      if (!FILE_ID.test(id) || (name === id && live.has(fileKey(namespace, id)))) continue;
      const at = path.join(dir, name);
      const written = fs.statSync(at, { throwIfNoEntry: false })?.mtimeMs;
      if (written === undefined || !fileLetGo({ writtenAt: Math.floor(written), named: false }, Math.floor(now), FILE_KEPT_FOR)) continue;
      fs.rmSync(at, { force: true });
      gone.push(`${namespace}/${name}`);
    }
  }
  return gone;
}

/** Every File of `held` past its day let go of (`recordPruned`), then the stray bytes and parts under `home` (`strayPruned`). */
const prunedIn = (held: Held, home: string, now: number) =>
  Effect.gen(function* () {
    const named = namedByCards(home);
    const keyspace = yield* held;
    for (const card of keyspace === undefined ? [] : (yield* keyspace.list(CARDS)).records)
      for (const id of card.value.match(FILE_IDS) ?? []) named.add(id);
    const records = keyspace === undefined ? [] : (yield* keyspace.list(PREFIX)).records;
    const gone: string[] = [];
    const live = new Set<string>();
    for (const record of records) {
      const pruned = keyspace === undefined ? undefined : yield* recordPruned(keyspace, record, home, named, now);
      if (pruned === undefined) live.add(record.key);
      else gone.push(pruned);
    }
    return [...gone, ...(yield* fromThrow(() => strayPruned(home, live, now)))];
  });

/** A new File's part under `home`'s Files of `namespace`, open for its bytes, which are hashed as they are written. */
function partBegun(home: string, namespace: string) {
  const dir = filesDir(home, namespace);
  fs.mkdirSync(dir, { recursive: true });
  const id = `${FILE_ID_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
  const fd = fs.openSync(path.join(dir, `${id}.part`), 'wx');
  const hash = crypto.createHash('sha256');
  let open = true;
  let digest: string | undefined;
  return {
    id,
    write: (chunk) => {
      fs.writeSync(fd, chunk);
      hash.update(chunk);
    },
    close: () => {
      if (open) fs.closeSync(fd);
      open = false;
    },
    digest: () => {
      digest ??= `sha256:${hash.digest('hex')}`;
      return digest;
    },
  } satisfies FileBegun;
}

/**
 * The File `file` begun in `namespace` kept: its part renamed to its bytes under `home`, then its record made in the keyspace `open`
 * opens.
 */
const keptIn = (open: Effect.Effect<Keyspace, Refusal>, home: string, namespace: string, file: FileObject) =>
  Effect.gen(function* () {
    const kept = yield* fileChecked(file);
    yield* fromThrow(() => {
      const dir = filesDir(home, namespace);
      if (!FILE_ID.test(kept.id) || !namespaceKept(namespace) || !fs.existsSync(path.join(dir, `${kept.id}.part`)))
        throw new Missing({
          message: `no file ${kept.id} was begun in ${namespace}, or it was let go of on its way: upload it again, POST /api/namespaces/${namespace}/files.`,
        });
      fs.renameSync(path.join(dir, `${kept.id}.part`), path.join(dir, kept.id));
    });
    const keyspace = yield* open;
    yield* keyspace.write(fileKey(namespace, kept.id), { verb: 'create', expected: null, value: JSON.stringify(kept) }).pipe(
      Effect.mapError(
        (err) =>
          new Conflict({
            message: `${namespace} keeps a file ${kept.id} already (${err.refusal}): upload it again, under an id of its own.`,
          }),
      ),
    );
    return kept;
  });

/**
 * The File `id` of `namespace` let go of: its record deleted from the keyspace `held` holds, refused while a live record points to it,
 * then its part and bytes under `home`.
 */
const droppedIn = (held: Held, home: string, namespace: string, id: string) =>
  Effect.gen(function* () {
    if (!FILE_ID.test(id) || !namespaceKept(namespace)) return;
    const keyspace = yield* held;
    const record = keyspace === undefined ? undefined : yield* keyspace.get(fileKey(namespace, id));
    if (keyspace !== undefined && record !== undefined)
      yield* keyspace.write(record.key, { verb: 'delete', expected: null, value: '' }).pipe(
        Effect.mapError(
          (err) =>
            new Conflict({
              message:
                err.refusal === 'referenced'
                  ? `the file ${id} of ${namespace} is named by the record ${err.pointer ?? 'of another key'}, and was kept: remove that first.`
                  : `the file ${id} of ${namespace} changed while it was let go of: let go of it again.`,
            }),
        ),
      );
    yield* fromThrow(() => {
      for (const name of [`${id}.part`, id]) fs.rmSync(path.join(filesDir(home, namespace), name), { force: true });
    });
  });

/**
 * The Files of the keyspace `open` opens when a method runs, their bytes under `home`, as the door's shape. A read asks `held`, and
 * answers no File where it answers no keyspace, so a store read is not a store made.
 * @param open Opens the keyspace the Files' records are held in, refused as opening it is.
 * @param held The keyspace a read reads, or undefined where the store holds none yet; `open` where every read may make it.
 * @param home The store's root, its Files' bytes under its `files/` and the cards that keep them in its `inbox/`.
 */
export function fileRecords(open: Effect.Effect<Keyspace, Refusal>, held: Held, home: string) {
  return {
    files: {
      begin: (namespace, now) =>
        namespaceKept(namespace)
          ? Effect.flatMap(prunedIn(held, home, now), () => fromThrow(() => partBegun(home, namespace)))
          : Effect.succeed(undefined),
      keep: (namespace, file) => keptIn(open, home, namespace, file),
      drop: (namespace, id) => droppedIn(held, home, namespace, id),
      read: (namespace, id) => readIn(held, home, namespace, id),
      pruned: (now) => prunedIn(held, home, now),
      pointer: (namespace, id) =>
        Effect.map(readIn(held, home, namespace, id), (one) =>
          one === undefined
            ? undefined
            : ({
                key: fileKey(namespace, id),
                pointer: { file: one.file.id, mediaType: one.file.mediaType, size: one.file.size, digest: one.file.digest },
              } satisfies FilePointed),
        ),
    },
  } satisfies FileDoorShape;
}

/** Each File record of before the keyspace in the store `home`, by its namespace and id: every one the import reads. */
const formerFilesOf = (home: string) =>
  entriesOf(path.join(home, 'files'))
    .filter(namespaceKept)
    .sort()
    .flatMap((namespace) =>
      entriesOf(filesDir(home, namespace))
        .filter((n) => n.endsWith('.json') && FILE_ID.test(n.slice(0, -'.json'.length)))
        .sort()
        .map((n) => ({ namespace, id: n.slice(0, -'.json'.length), file: path.join(filesDir(home, namespace), n) })),
    );

/** Where the import moves the record of the File `id` of `namespace`, under the store `home`. */
const importedFile = (home: string, namespace: string, id: string) => path.join(home, 'imported', 'files', namespace, `${id}.json`);

/**
 * The store `home`'s File records of before the keyspace imported into `keyspace`: each one whose bytes are there made a record with
 * the digest of its bytes, where the keyspace holds none at its key, then moved aside under `imported/files/`; one whose bytes are gone,
 * or that does not read, stays, said in the log. Safe to run again: what was moved is not read again, and a key held is not written.
 * @param home The store's root folder.
 * @param keyspace The store's keyspace.
 */
export const filesImported = Effect.fnUntraced(function* (home: string, keyspace: Keyspace) {
  let made = 0;
  for (const former of formerFilesOf(home)) {
    const bytes = path.join(filesDir(home, former.namespace), former.id);
    const read = yield* fromThrow(() => Option.getOrUndefined(formerFileIn(fs.readFileSync(former.file, 'utf8'))));
    if (read === undefined || read.id !== former.id) {
      yield* Effect.logWarning(`${former.file} was not imported: it does not read as a File. Move it aside, and upload the file again.`);
      continue;
    }
    if (!fs.statSync(bytes, { throwIfNoEntry: false })?.isFile()) {
      yield* Effect.logWarning(`${former.file} was not imported: its bytes, ${bytes}, are gone. Upload the file again.`);
      continue;
    }
    const key = fileKey(former.namespace, former.id);
    if ((yield* keyspace.get(key)) === undefined) {
      const file = { ...read, digest: yield* fromThrow(() => digestOf(bytes)) } satisfies FileObject;
      yield* keyspace
        .write(key, { verb: 'create', expected: null, value: JSON.stringify(file) })
        .pipe(Effect.mapError((err) => new Conflict({ message: `${err.key} was written while it was imported: run again.` })));
      made += 1;
    }
    yield* fromThrow(() => {
      const to = importedFile(home, former.namespace, former.id);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(former.file, to);
    });
  }
  return made;
});

/** The stores whose File records this process has imported, by root. */
const IMPORTED = new Set<string>();

/** One import at a time, so two fibers opening one store import it once. */
const IMPORTING = Semaphore.makeUnsafe(1);

/**
 * The keyspace of the store `home`, its File records of before it imported the first time this process opens it (`filesImported`); a
 * failed import is not kept, so the next open imports again.
 * @param home The store's root folder.
 */
export const filesKeyspace = (home: string) =>
  Effect.flatMap(keyspaceAt(keyspaceFile(home)), (keyspace) =>
    IMPORTED.has(home)
      ? Effect.succeed(keyspace)
      : IMPORTING.withPermits(1)(
          Effect.suspend(() =>
            IMPORTED.has(home)
              ? Effect.succeed(keyspace)
              : Effect.map(filesImported(home, keyspace), () => {
                  IMPORTED.add(home);
                  return keyspace;
                }),
          ),
        ),
  );

/**
 * The keyspace of the store `home` a read reads: undefined where the store has no keyspace file and no File record to import, so a read
 * makes no file; else `filesKeyspace`'s.
 * @param home The store's root folder.
 */
const filesKeyspaceHeld = (home: string) =>
  Effect.suspend(() =>
    !fs.existsSync(keyspaceFile(home)) && formerFilesOf(home).length === 0 ? Effect.succeed(undefined) : filesKeyspace(home),
  );

/** The File door, as the service a program yields: rooted, refused `Invalid` where the program was given no store root. */
export const FileDoor = Context.Reference<FileDoorShape>('agent-orchestrator/FileDoor', {
  defaultValue: () => rootedDoor((root) => fileRecords(filesKeyspace(root), filesKeyspaceHeld(root), root), 'File door'),
});

/**
 * The bytes of a kept File, read from disk as they are asked for, never held whole: what the api streams of a File's content.
 * @param at The path of its bytes, as the door's `read` answers it.
 */
export const fileBytes = (at: string) => fs.createReadStream(at) as AsyncIterable<Uint8Array>;
