/**
 * The repository as a test that reads all of it sees it: its root, its workspaces as the root `package.json` names them, and its files
 * through git. `REPO` and `workspaces` read files and spawn nothing; `files` asks git, so only a test that reads every file calls it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The repository's root: this kit sits at `tools/test-kit`. */
export const REPO = path.join(import.meta.dirname, '..', '..');

/**
 * The workspace folders the root `package.json` of `root` names, by path from it, in the order it lists them: a `dir/*` glob as the
 * folders under `dir` that hold a `package.json`, sorted, as npm reads it; a plain folder as it is. Throws on any other glob, which a
 * guard would otherwise read as nothing.
 */
export const workspaces = (root = REPO): string[] => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { workspaces?: string[] };
  return (manifest.workspaces ?? []).flatMap((glob) => {
    if (!glob.includes('*')) return [glob];
    const dir = glob.slice(0, -2);
    if (!glob.endsWith('/*') || dir.includes('*'))
      throw new Error(
        `the root package.json's workspace ${glob} is a glob the test kit's repo.ts does not read: write it as dir/* or a folder`,
      );
    const at = path.join(root, dir);
    if (!fs.existsSync(at)) return [];
    return fs
      .readdirSync(at)
      .filter((name) => fs.existsSync(path.join(at, name, 'package.json')))
      .sort()
      .map((name) => `${dir}/${name}`);
  });
};

/**
 * Every file the repository at `root` holds, tracked or not yet added, ignored ones left out: git's list, as a path from the root. A test
 * that proves a guard on a planted repository names its root.
 */
export const files = (root = REPO): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 << 20,
  })
    .split('\0')
    .filter(Boolean);

/**
 * Text, not an image: a NUL in its first bytes is a binary file, which says no name a person reads. Undefined for a path that is no file,
 * deleted or not yet staged, or a link.
 */
export const textOf = (file: string): string | undefined => {
  const at = path.join(REPO, file);
  if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) return undefined;
  const bytes = fs.readFileSync(at);
  return bytes.subarray(0, 8000).includes(0) ? undefined : bytes.toString('utf8');
};

/**
 * The paths of `paths`, each from `root`, that are not ours to read or rewrite: what `.gitattributes` marks `linguist-vendored` (another
 * project's files, vendored unchanged) or `linguist-generated` (what a tool writes). Git says it, through `git check-attr`, so no guard
 * keeps a list of its own: a new vendored folder is one line of `.gitattributes`.
 */
export const notOurs = (paths: readonly string[], root = REPO): Set<string> => {
  if (paths.length === 0) return new Set();
  const out = execFileSync('git', ['check-attr', '-z', '--stdin', 'linguist-vendored', 'linguist-generated'], {
    cwd: root,
    input: paths.join('\0') + '\0',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 256 << 20,
  }).split('\0');
  const marked = new Set<string>();
  for (let at = 0; at + 2 < out.length; at += 3) if (out[at + 2] === 'set' || out[at + 2] === 'true') marked.add(out[at] ?? '');
  return marked;
};

let known: { all: Set<string>; marked: Set<string> } | undefined;

/**
 * Whether `file`, a path from the root, is ours to read and rewrite: nothing `.gitattributes` marks vendored or generated. Git's list is
 * asked once; a path it does not hold (one a test plants) is asked of git on its own.
 */
export const ours = (file: string): boolean => {
  if (!known) {
    const all = files();
    known = { all: new Set(all), marked: notOurs(all) };
  }
  return known.all.has(file) ? !known.marked.has(file) : !notOurs([file]).has(file);
};
