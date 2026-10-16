/**
 * A watcher's cursor file: where a watch keeps the byte of the feed it has read to, so the next one resumes there (`--cursor-file`).
 *
 * The path is a person's, never one of `$WF_ROOT`: the file is theirs, and its format is the watch's own business — one decimal number
 * and a newline. It is written to a temp name beside it and renamed, so a reader that opens it between two writes never reads half a
 * number. A feed cut under the watch rewrites it to 0 (`cutCursorFile`), the start of the feed there is now.
 *
 * Beneath the controllers, beside `feed.store.ts`: `runner.ts` re-exports it, and the CLI's watch is its one caller.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';

/** What the cursor file holds: one decimal number of bytes, and a newline. */
const cursorText = (cursor: number): string => `${cursor}\n`;

/** The temp name a write goes to before it is renamed over the file: beside it, so the rename stays on one filesystem. */
const tempOf = (file: string): string => `${file}.${process.pid}.tmp`;

/**
 * The cursor `file` holds — or undefined where there is no such file, which is a watch's first: it starts where it was told to, and
 * writes the file as it reads. A file that holds anything but a whole number of bytes is refused by name (exit 2), never read as 0: a
 * watch that read it as 0 would say every line of the feed again.
 */
export function cursorFileStart(file: string): number | undefined {
  if (fs.statSync(file, { throwIfNoEntry: false }) === undefined) return undefined;
  const trimmed = fs.readFileSync(file, 'utf8').trim();
  if (!/^\d+$/.test(trimmed))
    throw new Invalid({
      message:
        `${file} is no cursor file: it holds ${JSON.stringify(trimmed.slice(0, 40))}, and a cursor is a whole number of bytes — ` +
        'delete the file to watch from the start, or write the number a `cursor:` line printed',
    });
  return Number(trimmed);
}

/**
 * Writes `cursor` to `file`, whole: to a temp name beside it, then renamed over it, so a reader never sees half a number and a write
 * that dies leaves the cursor it had. A path whose directory is not there is refused by name (exit 2), before a watch reads a line.
 */
export function keepCursor(file: string, cursor: number): void {
  const dir = path.dirname(file);
  if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true)
    throw new Invalid({ message: `${dir} is no directory, so ${file} cannot be written: make it, or name a cursor file in one that is` });
  const temp = tempOf(file);
  fs.writeFileSync(temp, cursorText(cursor));
  fs.renameSync(temp, file);
}

/** Rewrites `file` to 0: what a watch keeps when the feed was cut under it, and it reads on from the start of the feed there is now. */
export const cutCursorFile = (file: string): void => keepCursor(file, 0);
