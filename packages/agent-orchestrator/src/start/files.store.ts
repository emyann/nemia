/**
 * The files a factory keeps for a start to hand its run's steps (`objects`' `FileObject`, uploaded by `POST
 * /api/namespaces/<namespace>/files`): each under the store's `files/<namespace>/`, its bytes as `<id>` and what it was sent as beside
 * them, `<id>.json`. A file is written first as `<id>.part`, as its bytes come (`fileBegun`, its `write`), then kept whole (`fileKept`)
 * or let go of (`fileDropped`), or written whole at an id the client was given (`filePut`); a start finds one by its id in its own
 * namespace (`fileAt`). Every file no inbox card names is let go of `FILE_KEPT_FOR` after it was last written (`filesPruned`, which
 * each upload and each card's removal asks first, as `fileLetGo` decides): a run copies what it is handed into its own `inputs/`, so a
 * file let go of takes nothing from a run, and a card keeps its files while its text names their ids.
 */
import { Option, Schema } from 'effect';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FILE_ID_PREFIX, FILE_KEPT_FOR, FileObject } from 'objects';
import { FACTORY_NAME } from '../factory/factory.ts';
import { fileLetGo } from '../inbox/card-files.ts';

/** A kept file's record, `<id>.json`, decoded: none where it does not read as a file. */
const fileIn = Schema.decodeUnknownOption(Schema.fromJsonString(FileObject));

/** A file's id: the prefix, then 32 hexadecimal digits of a random number, so no id is guessed from another. */
const FILE_ID = new RegExp(`^${FILE_ID_PREFIX}[0-9a-f]{32}$`);

/** Every File id written anywhere in a text, as the prune finds a card's: the prefix, then 32 hexadecimal digits. */
const FILE_IDS = new RegExp(`${FILE_ID_PREFIX}[0-9a-f]{32}`, 'g');

/**
 * Every File id written in any entry of the store's inbox, a card that does not read included, so a card nobody can parse loses none of
 * its files; read afresh on each prune, nothing carried between them.
 * @param home The store's root.
 */
function namedByCards(home: string) {
  const inbox = path.join(home, 'inbox');
  const named = new Set<string>();
  for (const entry of fs.existsSync(inbox) ? fs.readdirSync(inbox) : []) {
    const at = path.join(inbox, entry);
    if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) continue;
    for (const id of fs.readFileSync(at, 'utf8').match(FILE_IDS) ?? []) named.add(id);
  }
  return named;
}

/** The namespace's name as the store keeps it: `default`, or a factory's. */
const namespaceKept = (namespace: string) => namespace === 'default' || FACTORY_NAME.test(namespace);

/**
 * The folder the files of `namespace` are kept in, under the store's `files/`.
 * @param home The store's root.
 * @param namespace The namespace, a factory's name or `default`.
 */
export const filesDir = (home: string, namespace: string) => path.join(home, 'files', namespace);

/**
 * Every file of every namespace no inbox card names and last written longer ago than `FILE_KEPT_FOR` before `now` (`fileLetGo`), let go
 * of, its bytes, its record and a part never finished alike: the names let go of, as `<namespace>/<file>`.
 * @param home The store's root.
 * @param now The time it is now, in milliseconds.
 */
export function filesPruned(home: string, now: number) {
  const root = path.join(home, 'files');
  const gone: string[] = [];
  const named = namedByCards(home);
  for (const namespace of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, namespace);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      const at = path.join(dir, name);
      const begun = fs.statSync(at, { throwIfNoEntry: false })?.mtimeMs;
      if (begun === undefined) continue;
      const id = name.replace(/\.(json|part)$/, '');
      if (!fileLetGo({ writtenAt: Math.floor(begun), named: named.has(id) }, Math.floor(now), FILE_KEPT_FOR)) continue;
      fs.rmSync(at, { force: true });
      gone.push(`${namespace}/${name}`);
    }
  }
  return gone;
}

/** A file begun: its id, the bytes written to its part as they come (`write`), and its part closed once they have all come (`close`). */
export type FileBegun = {
  readonly id: string;
  readonly write: (chunk: Uint8Array) => void;
  readonly close: () => void;
};

/**
 * A new file of `namespace` begun, the files kept past their day let go of first (`filesPruned`): its id, and its part, `<id>.part`,
 * open for its bytes as they come, which `fileKept` makes the file once it is closed. Undefined for a namespace the store keeps no files
 * under.
 * @param home The store's root.
 * @param namespace The namespace it is uploaded to.
 * @param now The time it is now, in milliseconds.
 */
export function fileBegun(home: string, namespace: string, now: number) {
  if (!namespaceKept(namespace)) return undefined;
  filesPruned(home, now);
  const dir = filesDir(home, namespace);
  fs.mkdirSync(dir, { recursive: true });
  const id = `${FILE_ID_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
  const fd = fs.openSync(path.join(dir, `${id}.part`), 'wx');
  let open = true;
  return {
    id,
    write: (chunk) => {
      fs.writeSync(fd, chunk);
    },
    close: () => {
      if (open) fs.closeSync(fd);
      open = false;
    },
  } satisfies FileBegun | undefined;
}

/**
 * The file `fileBegun` began, kept whole: its bytes moved to `<id>` and what it was sent as written beside them, `<id>.json`.
 * @param home The store's root.
 * @param namespace The namespace it was uploaded to.
 * @param file The file object: its id, name, media type, size and when it was uploaded.
 */
export function fileKept(home: string, namespace: string, file: FileObject) {
  const dir = filesDir(home, namespace);
  fs.renameSync(path.join(dir, `${file.id}.part`), path.join(dir, file.id));
  fs.writeFileSync(path.join(dir, `${file.id}.json`), JSON.stringify(file));
  return file;
}

/**
 * The file `id` of `namespace` let go of, whatever of it was written: a part refused on its way, or a file no start will take.
 * @param home The store's root.
 * @param namespace The namespace it was uploaded to.
 * @param id The file's id.
 */
export function fileDropped(home: string, namespace: string, id: string) {
  if (!FILE_ID.test(id) || !namespaceKept(namespace)) return;
  for (const name of [`${id}.part`, id, `${id}.json`]) fs.rmSync(path.join(filesDir(home, namespace), name), { force: true });
}

/**
 * The file `id` kept in `namespace`, and the path of its bytes; undefined where it is no id, or no file of that namespace is kept
 * under it (never uploaded, uploaded to another namespace, or let go of after its day).
 * @param home The store's root.
 * @param namespace The namespace a start that names it runs in.
 * @param id The id the start names.
 */
export function fileAt(home: string, namespace: string, id: string) {
  if (!FILE_ID.test(id) || !namespaceKept(namespace)) return undefined;
  const dir = filesDir(home, namespace);
  const bytes = path.join(dir, id);
  let file: FileObject | undefined;
  try {
    file = Option.getOrUndefined(fileIn(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')));
  } catch {
    return undefined;
  }
  if (file === undefined) return undefined;
  return fs.statSync(bytes, { throwIfNoEntry: false })?.isFile() ? { file, path: bytes } : undefined;
}

/** Why a file was not written at an id: the id is no File's, the namespace keeps none, or a File is kept under it already. */
export type FilePutRefused = 'id' | 'namespace' | 'taken';

/** A file begun at an id, or why not. */
type PutOrRefused = FileBegun | { readonly refused: FilePutRefused };

/** A put refused for `refused`. */
const putRefused = (refused: FilePutRefused) => {
  const out: PutOrRefused = { refused };
  return out;
};

/**
 * A new file of `namespace` begun at the id `id` a client was given (MCP's file extension's upload target), the files kept past their day
 * let go of first: its part, `<id>.part`, open for its bytes as they come, made exclusively, which `fileKept` makes the file once closed.
 * Why not, where the id is no File's id, the namespace keeps no files, or a file or a part is there under it already.
 * @param home The store's root.
 * @param namespace The namespace it is written to.
 * @param id The id it is written at.
 * @param now The time it is now, in milliseconds.
 */
export function filePut(home: string, namespace: string, id: string, now: number) {
  if (!FILE_ID.test(id)) return putRefused('id');
  if (!namespaceKept(namespace)) return putRefused('namespace');
  filesPruned(home, now);
  const dir = filesDir(home, namespace);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, id)) || fs.existsSync(path.join(dir, `${id}.json`))) return putRefused('taken');
  let fd: number;
  try {
    fd = fs.openSync(path.join(dir, `${id}.part`), 'wx');
  } catch {
    return putRefused('taken');
  }
  let open = true;
  const begun: FileBegun = {
    id,
    write: (chunk) => {
      fs.writeSync(fd, chunk);
    },
    close: () => {
      if (open) fs.closeSync(fd);
      open = false;
    },
  };
  const put: PutOrRefused = begun;
  return put;
}
