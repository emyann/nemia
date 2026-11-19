/**
 * A factory's own folder as a whole, `<home>/factories/<name>/`, on disk: its files read, every one but those that stay with the store
 * (`FOLDER_STAYS`: its proposals and delegations), placed where no folder is — staged in a hidden sibling and renamed into place, so no
 * reader sees half of one and nothing is left of a placing that fails — and removed whole. What the Factory door's files layer is over for
 * its `folder` (`factories.store.ts`); a factory moved between stores reads and places it (`src/factory/move/move.verb.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { TreeFile } from '../../archive/archive.ts';
import { factoryNameRefusal } from '../factory.ts';
import { Conflict, Invalid } from '../../refusal/refusal.ts';
import { FOLDER_STAYS } from '../move/move.ts';
import { firstPiece } from '../../piece/piece.ts';

/** The folder the store `home` keeps the factory `name`'s own files in. Refused (`Invalid`): a name that is no factory's. */
function folderOf(home: string, name: string) {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(home, 'factories', name);
}

/**
 * Why the file `at` cannot be placed in a factory's folder, or undefined: a path is split by `/`, stands under the folder, and names a
 * file there — an empty one, a whole one, one with a backslash or a part that is empty, `.` or `..` is refused.
 * @param at The file's path from the factory's folder, split by `/`.
 */
export function folderPathRefusal(at: string) {
  const parts = at.split('/');
  if (at.startsWith('/') || at.includes('\\') || parts.some((part) => part === '' || part === '.' || part === '..'))
    return `${JSON.stringify(at)} is no path inside a factory's folder: each file is named by its path from the folder, split by /, with no empty, . or .. part. Nothing was placed.`;
  return undefined;
}

/**
 * Whether the file at `at`, a path from a factory's folder, stays with the store (`FOLDER_STAYS`).
 * @param at The file's path from the factory's folder, split by `/`.
 */
export const staysWithStore = (at: string) => (FOLDER_STAYS as readonly string[]).includes(firstPiece(at, '/'));

/** The regular files under `dir`, by their path from `top` split by `/`; a link, a device or a socket is no file of it. */
function filesUnder(top: string, dir: string) {
  // oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): TreeFile[] => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(top, at);
    if (!entry.isFile()) return [];
    return [{ path: path.relative(top, at).split(path.sep).join('/'), mode: fs.statSync(at).mode & 0o777, bytes: fs.readFileSync(at) }];
  });
}

/** A factory's folder as a move reads it: the files that move, by path, sorted, and the folders of `FOLDER_STAYS` it holds, which stay. */
export type FolderRead = { readonly files: readonly TreeFile[]; readonly stays: readonly string[] };

/**
 * The files of the factory `name`'s folder in the store `home`, and what of it stays with the store (`FolderRead`); none for no folder.
 * @param home The store's root.
 * @param name The factory's name.
 */
export function folderReadAt(home: string, name: string) {
  const dir = folderOf(home, name);
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return { files: [], stays: [] } satisfies FolderRead;
  const files = filesUnder(dir, dir)
    .filter((file) => !staysWithStore(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, stays: FOLDER_STAYS.filter((stays) => fs.existsSync(path.join(dir, stays))) } satisfies FolderRead;
}

/**
 * The factory `name`'s folder in the store `home` made of `files`: written in a hidden sibling, then renamed into place, and that sibling
 * removed whatever happens. Refused before anything is written: a path that is no file of it (`Invalid`, `folderPathRefusal`), and a
 * folder already there (`Conflict`, left as it was). Answers the folder.
 * @param home The store's root.
 * @param name The factory's name.
 * @param files The files of the folder, each by its path from it, its mode and its bytes.
 */
export function folderPlacedAt(home: string, name: string, files: readonly TreeFile[]) {
  const dir = folderOf(home, name);
  const refused = files.map((file) => folderPathRefusal(file.path)).find((why) => why !== undefined);
  if (refused !== undefined) throw new Invalid({ message: refused });
  const taken = () =>
    new Conflict({
      message: `${dir} is there already, and a factory's folder is placed only where none is: remove the factory with nemia factory rm ${name}, or move it under another name. Nothing was placed.`,
    });
  if (fs.lstatSync(dir, { throwIfNoEntry: false }) !== undefined) throw taken();
  const staged = path.join(path.dirname(dir), `.${name}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.mkdirSync(staged, { recursive: true });
    for (const file of files) {
      const at = path.join(staged, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, file.bytes, { mode: file.mode & 0o777 });
    }
    try {
      fs.renameSync(staged, dir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') throw taken();
      throw err;
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  return dir;
}

/**
 * The factory `name`'s folder in the store `home` removed whole: whether there was one.
 * @param home The store's root.
 * @param name The factory's name.
 */
export function folderRemovedAt(home: string, name: string) {
  const dir = folderOf(home, name);
  const there = fs.lstatSync(dir, { throwIfNoEntry: false }) !== undefined;
  fs.rmSync(dir, { recursive: true, force: true });
  return there;
}
