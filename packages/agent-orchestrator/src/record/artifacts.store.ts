/**
 * One file a step left, by name and never by path: a file of its files directory, which its closeout's `artifacts` name
 * (`artifactFile`), or of a folder step's own folder (`fileIn`). Each is read on every call and never kept, since a step that runs
 * again writes its files again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir } from './record.store.ts';
import type { Run } from './record.ts';

/** Whether `name` names a file directly in a folder: a name with a separator of either kind, `..` or a NUL is a path, and names none. */
export const isFileName = (name: string): boolean => Boolean(name) && !/[/\\\0]/.test(name) && !name.includes('..');

/**
 * The bytes of the regular file `name` directly in `dir`, or null where there is none: a name that is a path (`isFileName`), a file not
 * there, a folder, or a link, which is opened without being followed, so what is read is what was looked at.
 */
export function fileIn(dir: string, name: string): Buffer | null {
  if (!isFileName(name)) return null;
  let fd: number;
  try {
    fd = fs.openSync(path.join(dir, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    return fs.fstatSync(fd).isFile() ? fs.readFileSync(fd) : null;
  } finally {
    fs.closeSync(fd);
  }
}

/** The file `name` of the files directory of `step` in `run` (`artifactsDir`), read as `fileIn` reads it. */
export const artifactFile = (run: Pick<Run, 'id'>, step: string, name: string): Buffer | null => fileIn(artifactsDir(run, step), name);
