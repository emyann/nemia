/**
 * The repository's files as a test that reads all of them sees them: `names.test.ts`, `others.test.ts` and `local-paths.test.ts`; and
 * its workspaces as the root `package.json` names them, for the guards that hold every workspace alike (`suite.test.ts` and the others
 * that import `workspaces`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every file the repository holds, tracked or not yet added, ignored ones left out: git's list, as a path from the root. */
export const files = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO,
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

/** What is not ours to rewrite, by path from the root: the lockfile, and the vendored skill (a folder, `/` at its end). */
export const NOT_OURS = ['package-lock.json', '.claude/skills/shadcn/'];

/** Whether `file`, a path from the root, is ours to read and rewrite: not the lockfile, nor under the vendored skill. */
export const ours = (file: string): boolean => !NOT_OURS.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

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
      throw new Error(`the root package.json's workspace ${glob} is a glob repo-files.ts does not read: write it as dir/* or a folder`);
    const at = path.join(root, dir);
    if (!fs.existsSync(at)) return [];
    return fs
      .readdirSync(at)
      .filter((name) => fs.existsSync(path.join(at, name, 'package.json')))
      .sort()
      .map((name) => `${dir}/${name}`);
  });
};
