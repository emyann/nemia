/**
 * Whether the web app in `dist/` is the build of the sources as they stand, so a run of the e2e need not build it again: a session
 * that fixes a page's assertions and runs its pages over and over built the same app each time, sixteen seconds a run.
 *
 * What a build reads is fingerprinted (`inputsOf`): every file of the board but its tests, its pictures and what a build writes, every
 * file of `objects` (which the board imports by its entry, as source), and the lockfile, each by its path, size and time of change. A
 * build leaves that fingerprint in `dist/` (`stamp`), which vite empties before it builds, so a stamp is always of the build beside it.
 * `current` reads it back. Under `CI` nothing is current: nothing a shard decides is read from a cache.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The stamp's name in `dist/`. */
const STAMP = '.e2e-built';

/** The folders of the board no build reads, or that a build or a run writes. */
const NOT_READ = new Set(['dist', 'node_modules', 'test', '.e2e', 'storybook-static', '.turbo', '.tanstack']);

/** Every file under `dir`, by its path from `from`, but those under a folder of `skipped` directly in `dir`. */
function filesOf(dir: string, from: string, skipped: ReadonlySet<string>): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !skipped.has(entry.name))
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return filesOf(file, from, new Set(['node_modules']));
      return entry.isFile() ? [path.relative(from, file)] : [];
    });
}

/**
 * The fingerprint of what a build of the board at `web` reads, in the repository at `repo`: the board's own files, `objects`' and the
 * lockfile, each by path, size and time of change. Two trees with one fingerprint build one app.
 */
export function inputsOf(web: string, repo: string): string {
  const objects = path.join(repo, 'packages', 'objects');
  const lock = path.join(repo, 'package-lock.json');
  const files = [
    ...filesOf(web, repo, NOT_READ),
    ...filesOf(objects, repo, new Set(['node_modules', 'test'])),
    ...(fs.existsSync(lock) ? [path.relative(repo, lock)] : []),
  ].sort();
  const hash = createHash('sha256');
  for (const file of files) {
    const { size, mtimeMs } = fs.statSync(path.join(repo, file));
    hash.update(`${file}\0${size}\0${mtimeMs}\n`);
  }
  return hash.digest('hex');
}

/** Leaves `inputs` in `web`'s `dist/`, as the fingerprint of what that build read. */
export function stamp(web: string, inputs: string): void {
  fs.writeFileSync(path.join(web, 'dist', STAMP), `${inputs}\n`);
}

/** Whether `web`'s `dist/` is the build of `inputs`: it has a page, and its stamp says so. Never under `CI`. */
export function current(web: string, inputs: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CI) return false;
  const file = path.join(web, 'dist', STAMP);
  return fs.existsSync(path.join(web, 'dist', 'index.html')) && fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === inputs;
}
