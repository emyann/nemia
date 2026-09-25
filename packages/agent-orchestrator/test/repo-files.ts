/**
 * The repository's files as a test that reads all of them sees them: `names.test.ts` and `others.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every file the repository holds, tracked or not yet added, ignored ones left out: git's list, as a path from the root. */
export const files = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })
    .split('\0').filter(Boolean);

/** Text, not an image: a NUL in its first bytes is a binary file, which says no name a person reads. */
export const textOf = (file: string): string | undefined => {
  const at = path.join(REPO, file);
  if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) return undefined; // deleted, not yet staged; or a link
  const bytes = fs.readFileSync(at);
  return bytes.subarray(0, 8000).includes(0) ? undefined : bytes.toString('utf8');
};
