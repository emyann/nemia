/**
 * What folders hold on disk that is theirs alone (`walk`), and so what removing them frees (`freedBytes`), read with Node and no
 * process: a walk that follows no link and counts a file hardlinked from elsewhere not at all, since its blocks stay while another name
 * holds them. A store: it reads the disk and nothing else.
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

/**
 * What a walk answers of the folders asked, each list in their order: the `bytes` each holds alone; the names under each that did not
 * read (`unread`: an `lstat` that failed, a folder that did not list), which count no byte and are never taken for empty; whether each
 * folder itself read (`read`); and what the walk cost, the `names` it read or tried to and the `bursts` it yielded after.
 */
export type Walk = {
  readonly bytes: number[];
  readonly unread: number[];
  readonly read: boolean[];
  names: number;
  bursts: number;
};

/** What the walk has counted so far (`Walk`), and every inode with names still to meet. */
type Walked = Walk & { readonly linked: Map<string, Linked> };

/** A folder still to read, of the folder asked `index`. */
type Inside = { readonly dir: string; readonly index: number };

/**
 * Count one name, `at`, into the folder `index`: a folder or a file of one name at once; a file of several names once every one of
 * them was met inside the folders walked, to the folder where the last was. Answers whether it is a folder, to be read in its turn, and
 * undefined for a name that is not there, which counts nothing.
 */
function counted(at: string, index: number, walked: Walked): boolean | undefined {
  const stat = fs.lstatSync(at, { bigint: true, throwIfNoEntry: false });
  if (!stat) return undefined;
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

/** The names in the folder `dir` of the folder asked `index`, each as its path; none for one that does not list, counted unread. */
function namesIn(dir: string, index: number, walked: Walked): string[] {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    walked.unread[index] += 1;
    return [];
  }
}

/** `counted`, one more name of the walk: a name that is not there, or whose `lstat` throws, is undefined and counted unread. */
function countedOrNot(at: string, index: number, walked: Walked): boolean | undefined {
  walked.names += 1;
  let folder: boolean | undefined;
  try {
    folder = counted(at, index, walked);
  } catch {
    folder = undefined;
  }
  if (folder === undefined) walked.unread[index] += 1;
  return folder;
}

/** Whether the walk just read the last name of a burst (`WALK_BURST`), the burst then counted: a plain test, no step of its own. */
const burstEnded = (walked: Walked): boolean => {
  if (walked.names % WALK_BURST !== 0) return false;
  walked.bursts += 1;
  return true;
};

/**
 * What each of `dirs` holds on disk that no name outside `dirs` holds too, by its place in `dirs` (`Walk`): the blocks of every folder
 * and of every file all of whose names are inside `dirs`, a link counted as a link and never followed. A file with a name outside
 * `dirs` — a worktree's `node_modules` is main's files hardlinked — counts nothing, since the other name still holds it; one whose
 * names are in two of `dirs` counts once, for the folder its last name was met in. The bytes are a floor: a name that does not read
 * counts none and is said in `unread`, and a folder asked that is gone is `read: false`.
 *
 * The walk reads `WALK_BURST` names at a time, the folders asked among them, and yields between two bursts, so a caller in a daemon
 * holds up nothing for longer: `bursts` is `names` over `WALK_BURST`, rounded down.
 *
 * @param dirs The folders walked together, each an absolute path.
 * @returns What they hold, what did not read and what the walk cost.
 */
export const walk = Effect.fn('walk')(function* (dirs: readonly string[]) {
  const none = () => dirs.map(() => 0);
  const walked: Walked = { bytes: none(), unread: none(), read: dirs.map(() => false), names: 0, bursts: 0, linked: new Map() };
  const inside: Inside[] = [];
  for (const [index, dir] of dirs.entries()) {
    const folder = countedOrNot(dir, index, walked);
    walked.read[index] = folder !== undefined;
    if (folder) inside.push({ dir, index });
    if (burstEnded(walked)) yield* Effect.yieldNow;
  }
  for (let next = inside.pop(); next; next = inside.pop()) {
    const { dir, index } = next;
    for (const at of namesIn(dir, index, walked)) {
      if (countedOrNot(at, index, walked)) inside.push({ dir: at, index });
      if (burstEnded(walked)) yield* Effect.yieldNow;
    }
  }
  const { bytes, unread, read, names, bursts } = walked;
  return { bytes, unread, read, names, bursts } satisfies Walk;
});

/**
 * The bytes removing each of `dirs` frees, by its place in `dirs`, when all of them go together: `walk`'s bytes. A floor: a path that
 * does not read counts zero, and so does a folder that is gone.
 *
 * @param dirs The folders that would be removed together, each an absolute path.
 * @returns The bytes each frees, in the order asked.
 */
export const freedBytes = Effect.fn('freedBytes')(function* (dirs: readonly string[]) {
  return (yield* walk(dirs)).bytes;
});
