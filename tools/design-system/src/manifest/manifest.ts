/**
 * What a build holds and what changed against the last one: `manifest.json`, each file of `project/` by its path with its sha256 and
 * bytes, and the change of every path against the last build's manifest (`fileChange`), or against a folder's files hashed where it
 * has none, as a download of the published artifact. A person's session publishes only what is added or changed, and removes what is
 * removed.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FileChange } from '../../contracts/produce.contract.ts';
import { fileChange } from '../decide.ts';
import { filesUnder, writeIn } from '../paths.ts';

/** Each file of a build by its path: its sha256 and its bytes. */
export type Manifest = Readonly<Record<string, { readonly sha256: string; readonly bytes: number }>>;

/** What changed against the last build, each list sorted. */
export type Changes = { readonly added: string[]; readonly changed: string[]; readonly removed: string[] };

/**
 * The manifest of a folder's files.
 * @param dir the folder.
 */
export const manifestOf = (dir: string) =>
  Object.fromEntries(
    filesUnder(dir).map((file) => {
      const bytes = fs.readFileSync(path.join(dir, file));
      return [file, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }];
    }),
  ) satisfies Manifest;

/**
 * The change of every path either manifest holds, each list sorted; a path the same in both is in none.
 * @param before the last build's manifest, empty where there was none.
 * @param after this build's manifest.
 */
export const changesSince = (before: Manifest, after: Manifest) => {
  const changes: Record<Exclude<FileChange, 'same'>, string[]> = { added: [], changed: [], removed: [] };
  for (const file of [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted()) {
    const change = fileChange(before[file]?.sha256, after[file]?.sha256);
    if (change !== 'same') changes[change].push(file);
  }
  return changes satisfies Changes;
};

/**
 * The last build's manifest: `since`'s `manifest.json`, or its `project/` or itself hashed when it holds none; empty when there is no
 * last build.
 * @param since the last build's folder, if any.
 */
export const lastManifest = (since: string | undefined) => {
  if (since === undefined || !fs.existsSync(since)) return {};
  const written = path.join(since, 'manifest.json');
  if (fs.existsSync(written)) return JSON.parse(fs.readFileSync(written, 'utf8')) as Manifest;
  const project = path.join(since, 'project');
  return manifestOf(fs.existsSync(project) ? project : since);
};

/**
 * Records `manifest` at `file` as the last build when the build had no fault, and leaves the last good build's there when it had
 * some: the next build is measured against what a session could publish, so a card a failed build changed is still named changed,
 * and a build that stopped early leaves no near-empty manifest to name every file added.
 * @param file the build's `manifest.json`.
 * @param manifest this build's manifest.
 * @param faults this build's faults.
 */
export const recordManifest = (file: string, manifest: Manifest, faults: readonly string[]) => {
  if (faults.length === 0) writeIn(file, `${JSON.stringify(manifest, null, 1)}\n`);
};

/**
 * The build's last lines: the three counts, then each path under its change.
 * @param changes what changed.
 * @param against what it was measured against.
 */
export const changeLines = (changes: Changes, against: string) => [
  `design-system: against ${against}: ${changes.added.length} added, ${changes.changed.length} changed, ${changes.removed.length} removed`,
  ...changes.added.map((file) => `  added ${file}`),
  ...changes.changed.map((file) => `  changed ${file}`),
  ...changes.removed.map((file) => `  removed ${file}`),
];
