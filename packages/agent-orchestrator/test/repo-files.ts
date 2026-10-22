/**
 * The repository's files as a test that reads all of them sees them, through git: `names.test.ts`, `others.test.ts` and
 * `local-paths.test.ts`. A test that needs only the root or the workspaces imports `workspaces.ts`, which spawns nothing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './workspaces.ts';

export { REPO, workspaces } from './workspaces.ts';

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
