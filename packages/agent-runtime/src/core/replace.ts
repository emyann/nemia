/**
 * A file replaced whole: the runtime's one write of a file beside another, renamed over it, so a reader of it finds the old file or
 * the new one and never part of either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** How a file is replaced, beyond its text: each absent leaves it to the plain write. */
export type ReplaceOptions = {
  /** Flush the new file to disk before it is renamed over the old, so a crash leaves one of the two whole on disk too. */
  readonly fsync?: boolean;
  /** The new file's mode, as a write gives it (the process's umask applies). */
  readonly mode?: number;
  /** The access and modification times the new file is given, in milliseconds: an old file's, kept across its replacement. */
  readonly times?: { readonly atimeMs: number; readonly mtimeMs: number };
  /** Asked once the new file is written, before the rename: `false` calls the replacement off, the old file left as it is. */
  readonly still?: () => boolean;
};

/**
 * Replaces `file` with `text`, written to a hidden file beside it under this process's name and renamed over it (`options`). Answers
 * whether it was replaced: `false` where `still` called it off. A write that fails throws as it does. Nothing is left beside the file
 * either way.
 */
export const replaceFile = (file: string, text: string | Uint8Array, options: ReplaceOptions = {}): boolean => {
  const beside = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(beside, 'w', options.mode);
    try {
      fs.writeFileSync(fd, text);
      if (options.fsync) fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (options.times) fs.utimesSync(beside, options.times.atimeMs / 1000, options.times.mtimeMs / 1000);
    if (options.still && !options.still()) return false;
    fs.renameSync(beside, file);
    return true;
  } finally {
    fs.rmSync(beside, { force: true });
  }
};
