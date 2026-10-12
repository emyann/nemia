/**
 * What the store's root holds, listed for a sweep to size (`storeRoots`), and the room left on the file system that holds it
 * (`storeFree`), read with Node and no process. A store: it lists folders and reads no record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from '../record/record.store.ts';
import { partOf, PER_RUN, type DiskPart, type DiskRoot } from './disk.ts';

/** The bytes a block of `lstat` counts, whatever the file system's own block is. */
const BLOCK = 512;

/** A folder counted for itself alone, as a root of `part`: its own blocks, the names under it left to roots of their own. */
const alone = (part: DiskPart, at: string): DiskRoot => ({ part, path: at, own: fs.lstatSync(at).blocks * BLOCK });

/**
 * The roots of a part kept by run, whose folder is `at`: the folder alone, and each name under it a root of its own, by its name. The
 * folder whole as one root where it does not list, so a walk says what did not read of it.
 */
function runRoots(part: DiskPart, at: string): DiskRoot[] {
  try {
    const names = fs.readdirSync(at);
    return [alone(part, at), ...names.map((name): DiskRoot => ({ part, name, path: path.join(at, name) }))];
  } catch {
    return [{ part, path: at }];
  }
}

/**
 * Everything the store's root holds, as the roots of one walk, which together count each name of the store once: the root alone, as
 * `other`; each name under it whole, by its part (`partOf`); and for a part kept by run (`PER_RUN`), its folder alone and each name
 * under it.
 *
 * @returns The roots, the store's own first.
 * @throws When the store's root does not list: there is nothing to size, and a reading of nothing would say the store is empty.
 */
export function storeRoots(): DiskRoot[] {
  const names = fs.readdirSync(HOME);
  return [
    alone('other', HOME),
    ...names.flatMap((name): DiskRoot[] => {
      const part = partOf(name);
      const at = path.join(HOME, name);
      return PER_RUN.includes(part) ? runRoots(part, at) : [{ part, path: at }];
    }),
  ];
}

/**
 * The room on the file system that holds the store: the bytes free to this process, and the file system's size. Inside a virtual
 * machine it is the machine's own disk, whatever the host has left.
 */
export function storeFree(): { free: number; size: number } {
  const stat = fs.statfsSync(HOME);
  return { free: stat.bavail * stat.bsize, size: stat.blocks * stat.bsize };
}
