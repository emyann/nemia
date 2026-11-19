/**
 * The person's folder listing, judged: whether a folder may be read (`folderReach`, contracts/folder-reach.contract.ts), what is answered
 * of its entries (`folderNamesShown`, contracts/folder-names.contract.ts), the typed path split into the folder listed and the piece
 * after its last slash (`typedFolder`), and the name of a repository made in the store (`repositoryNameRefusal`). Pure: the disk is read
 * by `folders.verb.ts`.
 */
import path from 'node:path';
import type { FolderEntry, FolderNamesShown, FolderNamesShownOf } from '../../../contracts/folder-names.contract.ts';
import type { FolderReach, FolderReachOf } from '../../../contracts/folder-reach.contract.ts';

export type { FolderEntry, FolderNamesShown } from '../../../contracts/folder-names.contract.ts';
export type { FolderReach } from '../../../contracts/folder-reach.contract.ts';

/** The most names one listing answers. */
export const FOLDER_NAMES_MOST = 50;

/** The folder of the store a new repository is made in, `<WF_ROOT>/repositories/<name>`. */
export const REPOSITORIES = 'repositories';

/** Whether the absolute path `inner` is `outer` or under it, by whole segments. */
const under = (inner: string, outer: string) => inner === outer || inner.startsWith(outer.endsWith('/') ? outer : outer + '/');

/**
 * Where the folder `real` stands for the listing: in a store, under a root, or outside every root.
 * @param real The folder, an absolute path resolved through its links.
 * @param roots The roots the listing reads under.
 * @param stores The stores no listing reads.
 */
export const folderReach: FolderReachOf = (real: string, roots: readonly string[], stores: readonly string[]) => {
  if (stores.some((s) => under(real, s))) return 'store';
  return roots.some((r) => under(real, r)) ? 'within' : 'outside';
};

/**
 * The names of the folders among `entries` that begin with `prefix`, hidden ones only when it opens with a dot, in order, at most `most`,
 * and whether more were left out.
 * @param entries The folder's entries as read: each name, and whether it is a folder.
 * @param prefix What the person typed after the last slash.
 * @param most The most names answered.
 */
export const folderNamesShown: FolderNamesShownOf = (entries: readonly FolderEntry[], prefix: string, most: number) => {
  const found = entries
    .filter((e) => e.folder && e.name.startsWith(prefix) && (!e.name.startsWith('.') || prefix.startsWith('.')))
    .map((e) => e.name);
  const names = [...found].sort().slice(0, most);
  return { names, more: found.some((n) => !names.includes(n)) };
};

/**
 * What the person typed, split into the folder listed and the piece after its last slash that each name answered begins with: a typed
 * path ending in a slash lists that folder whole.
 * @param typed The path as typed, absolute.
 */
export const typedFolder = (typed: string) => {
  const cut = typed.lastIndexOf('/');
  return { dir: path.resolve(typed.slice(0, cut + 1) || '/'), prefix: typed.slice(cut + 1) };
};

/** A repository's name in the store: lowercase letters, digits, dots, dashes and underscores, from a letter or a digit, 64 at most. */
const REPOSITORY_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Why `name` names no repository Nemia makes in its store, or undefined where it does.
 * @param name The name as typed.
 */
export const repositoryNameRefusal = (name: string) =>
  REPOSITORY_NAME.test(name) && !name.includes('..')
    ? undefined
    : `\`${name}\` is not a repository's name: a name is lowercase letters, digits, dots, dashes and underscores, starting with a letter or a digit, 64 at most — acme or my-app, say.`;
