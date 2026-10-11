/**
 * What removing folders frees on disk (`freedBytes`), read with Node and no process: a walk that follows no link and counts a file
 * hardlinked from elsewhere not at all, since its blocks stay while another name holds them. A store: it reads the disk and nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';

/** The names the walk reads in one go before it lets the process's other work run: a burst of a few milliseconds. */
export const WALK_BURST = 1024;

/** The bytes a block of `lstat` counts, whatever the file system's own block is. */
const BLOCK = 512n;

/** An inode met with more names than one: how many the file system says it has, how many the walk met, and what it holds. */
type Linked = { readonly links: bigint; met: bigint; readonly bytes: number };

/** What the walk has counted so far: the bytes freed with each folder asked, and every inode with names still to meet. */
type Walked = { readonly bytes: number[]; readonly linked: Map<string, Linked> };

/** A folder still to read, of the folder asked `index`. */
type Inside = { readonly dir: string; readonly index: number };

/**
 * Count one name, `at`, into the folder `index`: a folder or a file of one name at once; a file of several names once every one of
 * them was met inside the folders walked, to the folder where the last was. Answers whether it is a folder, to be read in its turn. A
 * name that does not read counts nothing.
 */
function counted(at: string, index: number, walked: Walked): boolean {
  const stat = fs.lstatSync(at, { bigint: true, throwIfNoEntry: false });
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

/** The names in the folder `dir`, each as its path; none for one that does not list. */
function namesIn(dir: string): string[] {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/** `counted`, for a name whose `lstat` throws: it counts nothing. */
function countedOrNot(at: string, index: number, walked: Walked): boolean {
  try {
    return counted(at, index, walked);
  } catch {
    return false;
  }
}

/**
 * The bytes removing each of `dirs` frees, by its place in `dirs`, when all of them go together: the blocks of every folder and of every
 * file all of whose names are inside `dirs`, a link counted as a link and never followed. A file with a name outside `dirs` — a
 * worktree's `node_modules` is main's files hardlinked — counts nothing, since the other name still holds it; one whose names are in
 * two of `dirs` counts once, for the folder its last name was met in. A floor: a path that does not read counts zero, and so does a
 * folder that is gone.
 *
 * The walk reads `WALK_BURST` names at a time and yields between two bursts, so a caller in a daemon holds up nothing for longer.
 *
 * @param dirs The folders that would be removed together, each an absolute path.
 * @returns The bytes each frees, in the order asked.
 */
export const freedBytes = Effect.fn('freedBytes')(function* (dirs: readonly string[]) {
  const walked: Walked = { bytes: dirs.map(() => 0), linked: new Map() };
  const inside: Inside[] = dirs.flatMap((dir, index) => (countedOrNot(dir, index, walked) ? [{ dir, index }] : []));
  let read = 0;
  for (let next = inside.pop(); next; next = inside.pop()) {
    const { dir, index } = next;
    for (const at of namesIn(dir)) {
      if (countedOrNot(at, index, walked)) inside.push({ dir: at, index });
      if (++read % WALK_BURST === 0) yield* Effect.yieldNow;
    }
  }
  return walked.bytes;
});
