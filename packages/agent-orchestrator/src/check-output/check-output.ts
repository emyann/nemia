/**
 * What a check printed, read as a page of numbered lines: the lines of a stream numbered from 1, those a `?match=` text finds kept under
 * their own numbers (`checkOutputLines`), and the page `?from=`, `?limit=` and `?last=` cut of them (`checkOutputCut`, proved by
 * contracts/check-output-page.contract.ts). The text is matched as it is, never as a pattern, so no text a client sends can hold the
 * daemon's loop. Pure.
 */
import type { CheckOutputCut } from '../../contracts/check-output-page.contract.ts';

/** The smaller of two counts. */
const least = (a: number, b: number) => (a < b ? a : b);

/** Whether a `limit` or a `last` is one a read takes: none, or a whole number from 1. */
const taken = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1);

/**
 * The held lines `[from, to)` of the `count` a read holds: the `limit` lines from `start` (the default page where no `limit` is asked, the
 * first line where no `start` is), or the last `last`, never more than `bounds.most`; whether any is left after them; or the refusal of a
 * read that asks `last` with a `start` or a `limit`, or a `limit` or a `last` that is no whole number from 1.
 * @param count How many lines the read holds: the stream's, or those its match found.
 * @param start The index of the first held line at or after the line number `from` asked; null where none was asked.
 * @param limit The lines asked from `start`; null where not asked.
 * @param last The last lines asked; null where not asked.
 * @param bounds The page sizes: the default and the most a page holds.
 */
export const checkOutputCut: CheckOutputCut = (count, start, limit, last, bounds) => {
  if (last !== null && (limit !== null || start !== null)) return { refused: 'both' };
  if (!taken(limit)) return { refused: 'limit' };
  if (!taken(last)) return { refused: 'last' };
  if (last !== null) {
    const size = least(least(last, bounds.most), count);
    return { from: count - size, to: count, more: false };
  }
  const from = start ?? 0;
  const size = least(limit === null ? bounds.byDefault : limit, bounds.most);
  const to = size >= count - from ? count : from + size;
  return { from, to, more: to < count };
};

/** A line of a check's output: its number in the stream, from 1, and its text with no line end. */
export type CheckOutputLine = { readonly n: number; readonly text: string };

/**
 * The lines of `text` numbered from 1, a `\r` before each line end dropped and the end after a last line ending in one not counted as a
 * line; with a `match`, only the lines that contain it, as it is and in any case, each under its number in the stream.
 * @param text What a stream printed, whole.
 * @param match The text a line kept contains; undefined or empty for every line.
 */
export const checkOutputLines = (text: string, match: string | undefined) => {
  const pieces = text.split('\n');
  if (pieces.at(-1) === '') pieces.pop();
  const lines = pieces.map((piece, i) => ({ n: i + 1, text: piece.endsWith('\r') ? piece.slice(0, -1) : piece }));
  if (match === undefined || match === '') return lines satisfies CheckOutputLine[];
  const sought = match.toLowerCase();
  return lines.filter((line) => line.text.toLowerCase().includes(sought)) satisfies CheckOutputLine[];
};
