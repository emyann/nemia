/**
 * What removing folders frees on disk (`freedBytes`), read with Node and no process: a walk that follows no link and counts a file
 * hardlinked from elsewhere not at all, since its blocks stay while another name holds them. A store: it reads the disk and nothing else.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Effect } from 'effect';

/** The most folders the walk reads at once. */
export const WALK_AT_ONCE = 16;

/** The bytes a block of `lstat` counts, whatever the file system's own block is. */
const BLOCK = 512n;

/** An inode met with more names than one: how many the file system says it has, how many the walk met, and what it holds. */
type Linked = { readonly links: bigint; met: bigint; readonly bytes: number };

/** What the walk has counted so far: the bytes freed with each folder asked, and every inode with names still to meet. */
type Walked = { readonly bytes: number[]; readonly linked: Map<string, Linked> };

/**
 * Count one name, `at`, into the folder `index`: a folder or a file of one name at once; a file of several names once every one of
 * them was met inside the folders walked, to the folder where the last was. Answers whether it is a folder, to be read in its turn. A
 * name that does not read counts nothing.
 */
async function counted(at: string, index: number, walked: Walked): Promise<boolean> {
  const stat = await fs.lstat(at, { bigint: true }).catch(() => undefined);
  if (!stat) return false;
  const bytes = Number(stat.blocks * BLOCK);
  if (stat.isDirectory() || stat.nlink <= 1n) {
    walked.bytes[index] += bytes;
    return stat.isDirectory();
  }
  const key = `${stat.dev}:${stat.ino}`;
  const linked = walked.linked.get(key) ?? { links: stat.nlink, met: 0n, bytes };
  linked.met += 1n;
  walked.linked.set(key, linked);
  if (linked.met === linked.links) walked.bytes[index] += bytes;
  return false;
}

/** Count every name in the folder `dir` of the folder asked `index`, and answer the folders among them. One that does not list has none. */
async function read(dir: string, index: number, walked: Walked): Promise<Array<{ dir: string; index: number }>> {
  const names = await fs.readdir(dir).catch(() => []);
  const inside: Array<{ dir: string; index: number }> = [];
  for (const name of names) {
    const at = path.join(dir, name);
    if (await counted(at, index, walked)) inside.push({ dir: at, index });
  }
  return inside;
}

/**
 * The bytes removing each of `dirs` frees, by its place in `dirs`, when all of them go together: the blocks of every folder and of every
 * file all of whose names are inside `dirs`, a link counted as a link and never followed. A file with a name outside `dirs` — a
 * worktree's `node_modules` is main's files hardlinked — counts nothing, since the other name still holds it; one whose names are in
 * two of `dirs` counts once, for the folder its last name was met in. A floor: a path that does not read counts zero, and so does a
 * folder that is gone.
 *
 * @param dirs The folders that would be removed together, each an absolute path.
 * @returns The bytes each frees, in the order asked.
 */
export const freedBytes = Effect.fn('freedBytes')(function* (dirs: readonly string[]) {
  const walked: Walked = { bytes: dirs.map(() => 0), linked: new Map() };
  const roots = yield* Effect.forEach(dirs, (dir, index) =>
    Effect.promise(async () => ((await counted(dir, index, walked)) ? [{ dir, index }] : [])),
  );
  let level = roots.flat();
  while (level.length) {
    const next = yield* Effect.forEach(level, (d) => Effect.promise(() => read(d.dir, d.index, walked)), { concurrency: WALK_AT_ONCE });
    level = next.flat();
  }
  return walked.bytes;
});
