/**
 * The board's stories baseline as the tree holds it (`test/baseline/`, held by `stories.test.ts`): one folder per list, and in each one
 * text file per source file that still owes something on that list, at that source file's path under `apps/web/src/` with `.txt`
 * after it, one entry a line. A change that mends a source file deletes its file, so two changes' cuts never meet in one file and git
 * merges them clean (`contracts/baseline-shard.contract.ts`). Paths are from the workspace root.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Astray, BaselineList, Filed, Misfiled, ShardOf } from '../contracts/baseline-shard.contract.ts';

/** The baseline's lists, in the order the stories test holds them. */
export const LISTS: readonly BaselineList[] = ['storyless', 'argless', 'secondSystem', 'handDrawn', 'a11yTodo'];

/** The baseline's folder, from the workspace root. */
export const FOLDER = 'apps/web/test/baseline/';

/** The folder every source path of an entry starts with. */
const SRC = 'apps/web/src/';

/** The source file an entry names: all of it before its first `#`, or all of it where it has none. */
const sourceOf = (entry: string): string => (entry.includes('#') ? entry.slice(0, entry.indexOf('#')) : entry);

/**
 * The file of the baseline that `entry` is filed in on `list`: its source file's path under src, as text, in the list's folder.
 * @param list The list the entry is on.
 * @param entry The entry, a path from the workspace root, with `#` and its key where the list keys one.
 */
export const shardOf: ShardOf = (list, entry) => FOLDER + list + '/' + sourceOf(entry).slice(SRC.length) + '.txt';

/** The file `entry` belongs in on `list`, or none where it names no source file under src. */
const homeOf = (list: BaselineList, entry: string): string | undefined =>
  sourceOf(entry).startsWith(SRC) && sourceOf(entry).length > SRC.length
    ? FOLDER + list + '/' + sourceOf(entry).slice(SRC.length) + '.txt'
    : undefined;

/**
 * What a list's folder holds against its layout: each entry sitting in a file other than its own, and each file with no entry.
 * @param list The list whose folder `files` are.
 * @param files Each file of the list's folder, with its lines.
 */
export const misfiled: Misfiled = (list, files) => ({
  astray: files.flatMap(({ file, entries }) =>
    entries.flatMap((entry): Astray[] => (homeOf(list, entry) === file ? [] : [{ file, entry }])),
  ),
  empty: files.filter(({ entries }) => entries.length === 0).map(({ file }) => file),
});

/** The baseline as the tree holds it: each list's files, and every file under the folder that is no list's text file. */
export type Baseline = { readonly lists: Readonly<Record<BaselineList, readonly Filed[]>>; readonly strays: readonly string[] };

/** Every file under `dir`, by its path from `root`, in a stable order. */
const filesUnder = (root: string, dir: string): string[] =>
  fs.existsSync(path.join(root, dir))
    ? fs
        .readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
        .filter((it) => it.isFile())
        .map((it) => path.relative(root, path.join(it.parentPath, it.name)).split(path.sep).join('/'))
        .sort()
    : [];

/** The list whose text file `file` is, or none where it is not one. */
const listOf = (file: string): BaselineList | undefined =>
  file.endsWith('.txt') ? LISTS.find((list) => file.startsWith(`${FOLDER}${list}/`)) : undefined;

/**
 * Reads the baseline's folder: each list's text files with their lines, a last empty line left out, and each other file as a stray.
 * @param root The workspace root the folder is read under.
 */
export const readBaseline = (root: string): Baseline => {
  const all = filesUnder(root, FOLDER);
  const lines = (file: string): string[] => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    return text === '' ? [] : text.replace(/\n$/, '').split('\n');
  };
  const lists = Object.fromEntries(
    LISTS.map((list) => [list, all.filter((file) => listOf(file) === list).map((file): Filed => ({ file, entries: lines(file) }))]),
  ) as Record<BaselineList, Filed[]>;
  return { lists, strays: all.filter((file) => listOf(file) === undefined) };
};
