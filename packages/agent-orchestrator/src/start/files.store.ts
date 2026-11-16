/**
 * The files a factory keeps for a start to hand its run's steps (`objects`' `FileObject`, uploaded by `POST
 * /api/namespaces/<namespace>/files`): each under the store's `files/<namespace>/`, its bytes as `<id>` and what it was sent as beside
 * them, `<id>.json`. A file is written first as `<id>.part`, as its bytes come (`fileBegun`, its `write`), then kept whole (`fileKept`)
 * or let go of (`fileDropped`); a start finds one by its id in its own namespace (`fileAt`). Every file is let go of `FILE_KEPT_FOR`
 * after it was last written (`filesPruned`, which each upload asks first): a run copies what it is handed into its own `inputs/`, so a
 * file let go of takes nothing from a run.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FILE_ID_PREFIX, FILE_KEPT_FOR, type FileObject } from 'objects';
import { FACTORY_NAME } from '../factory/factory.ts';

/** A file's id: the prefix, then 32 hexadecimal digits of a random number, so no id is guessed from another. */
const FILE_ID = new RegExp(`^${FILE_ID_PREFIX}[0-9a-f]{32}$`);

/** The namespace's name as the store keeps it: `default`, or a factory's. */
const namespaceKept = (namespace: string): boolean => namespace === 'default' || FACTORY_NAME.test(namespace);

/**
 * The folder the files of `namespace` are kept in, under the store's `files/`.
 * @param home The store's root.
 * @param namespace The namespace, a factory's name or `default`.
 */
export const filesDir = (home: string, namespace: string): string => path.join(home, 'files', namespace);

/**
 * Every file of every namespace last written longer ago than `FILE_KEPT_FOR` before `now`, let go of, its bytes, its record and a part
 * never finished alike: the names let go of, as `<namespace>/<file>`.
 * @param home The store's root.
 * @param now The time it is now, in milliseconds.
 */
export function filesPruned(home: string, now: number): string[] {
  const root = path.join(home, 'files');
  const gone: string[] = [];
  for (const namespace of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, namespace);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      const at = path.join(dir, name);
      const begun = fs.statSync(at, { throwIfNoEntry: false })?.mtimeMs;
      if (begun === undefined || now - begun < FILE_KEPT_FOR) continue;
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
export function fileBegun(home: string, namespace: string, now: number): FileBegun | undefined {
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
  };
}

/**
 * The file `fileBegun` began, kept whole: its bytes moved to `<id>` and what it was sent as written beside them, `<id>.json`.
 * @param home The store's root.
 * @param namespace The namespace it was uploaded to.
 * @param file The file object: its id, name, media type, size and when it was uploaded.
 */
export function fileKept(home: string, namespace: string, file: FileObject): FileObject {
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
export function fileDropped(home: string, namespace: string, id: string): void {
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
export function fileAt(home: string, namespace: string, id: string): { file: FileObject; path: string } | undefined {
  if (!FILE_ID.test(id) || !namespaceKept(namespace)) return undefined;
  const dir = filesDir(home, namespace);
  const bytes = path.join(dir, id);
  let file: FileObject;
  try {
    file = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as FileObject;
  } catch {
    return undefined;
  }
  return fs.statSync(bytes, { throwIfNoEntry: false })?.isFile() ? { file, path: bytes } : undefined;
}
