/**
 * A file written whole: to a hidden file beside it, then renamed over it, so a reader never sees half of one and a write that dies leaves
 * what was there. A bottom store: it imports no store file. A mode given is set on the hidden file before the rename, so the file lands
 * at it and is never at another in between. What a caller does beside the write — the folder made first, a time put back — stays at its
 * call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * `text` written whole onto `file`, through a hidden file beside it renamed onto it, at `mode` where one is given (set on the hidden file
 * before the rename: a mode that cannot be set leaves `file` as it was); the hidden file is gone whether or not it was.
 */
export function writeWhole(file: string, text: string, options: { readonly mode?: number } = {}): void {
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, text);
    if (options.mode !== undefined) fs.chmodSync(hidden, options.mode);
    fs.renameSync(hidden, file);
  } finally {
    fs.rmSync(hidden, { force: true });
  }
}
