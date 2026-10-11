/**
 * The directories the test place works in, read and written with `node:fs` and no process: a checkout's files as a tree (`readTree`),
 * a tree's files put in a directory (`writeChanges`), and the place's own folder in a checkout, `OWN`, which holds the file that says a
 * merge is staged there (`stagedFile`) and marks a tree `export` wrote. A checkout's `node_modules` and the place's own folder are no
 * part of its files; a link is read as no file.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tree } from './world.ts';

/** The place's own folder in a directory it holds. */
export const OWN = '.test-place';

/** The names in a checkout that are no part of its files. */
const SKIPPED = new Set([OWN, 'node_modules']);

/** Whether `dir` is a directory. */
export const isDirectory = (dir: string): boolean => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** `p` with every link on the way followed, as far as it exists. */
export function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(real(parent), path.basename(p));
  }
}

/** Whether `p` lies inside `dir`, and is not `dir` itself. */
export function inside(dir: string, p: string): boolean {
  const rel = path.relative(dir, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The files of `dir` as a tree, in folders too: none where it is no directory. */
export function readTree(dir: string): Tree {
  const tree: Record<string, string> = {};
  const read = (at: string, prefix: string): void => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (prefix === '' && SKIPPED.has(entry.name)) continue;
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) read(path.join(at, entry.name), `${rel}/`);
      else if (entry.isFile()) tree[rel] = fs.readFileSync(path.join(at, entry.name), 'utf8');
    }
  };
  if (isDirectory(dir)) read(dir, '');
  return tree;
}

/** `dir` brought from the files `from` to the files `to`: each path that differs written or taken away, and every other left as it is. */
export function writeChanges(dir: string, from: Tree, to: Tree): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const rel of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[rel] === to[rel]) continue;
    const file = path.join(dir, rel);
    if (to[rel] === undefined) fs.rmSync(file, { force: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, to[rel]);
    }
  }
}

/** The file whose presence says a merge is staged in the checkout `dir`. */
export const stagedFile = (dir: string): string => path.join(dir, OWN, 'staged');

/** The staged file of `dir` written, or taken away with the place's folder when it holds nothing else. */
export function markStaged(dir: string, staged: boolean): void {
  const file = stagedFile(dir);
  if (staged) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    return;
  }
  fs.rmSync(file, { force: true });
  if (fs.existsSync(path.dirname(file)) && !fs.readdirSync(path.dirname(file)).length) fs.rmdirSync(path.dirname(file));
}
