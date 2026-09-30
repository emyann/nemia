/**
 * The one transcript reader behind every harness's `transcript`: a JSONL file read from a cursor, whole lines
 * only, and the cursor to ask again with. What a line means is the harness's — Claude Code's lines are read in
 * `harness/claude/transcript.ts`, Codex's rollout in `harness/codex/transcript.ts`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Transcript, TranscriptCursor, TranscriptEvent } from './seam.ts';

/**
 * How much of a file, before a cursor's offset, its hash covers. Past the end of what every line of one
 * session repeats — its cwd, session id, version and branch come to a few hundred bytes — so the hash
 * covers the line's own id and time.
 */
const CURSOR_TAIL_BYTES = 4096;
const cursorAt = (offset: number, tail: Uint8Array): TranscriptCursor =>
  `${offset}.${createHash('sha256').update(tail).digest('hex').slice(0, 16)}`;
const START: TranscriptCursor = cursorAt(0, new Uint8Array());

/** Whether `after` is a cursor a transcript read could have given. */
export const isTranscriptCursor = (after: string): boolean => /^(0|[1-9]\d*)\.[0-9a-f]{16}$/.test(after);

/** No conversation to read yet: no events, and a cursor that reads from the start. */
export const noTranscript = (): Transcript => ({ events: [], cursor: START });

/** A record's own time as ISO 8601, or `undefined` when it has none that parses. */
export const isoTime = (t: unknown): string | undefined => {
  const ms = typeof t === 'string' ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

/**
 * The events in a JSONL file from `after` on, and where to ask again. The one reader behind every
 * harness's `transcript`; what a line means is `eventsOf`'s, given the line parsed, the byte offset
 * it starts at (an id for a record that has none), and the file, for a refusal to name.
 *
 * Only whole lines are read: a line still being written waits for the next read, and the cursor stops
 * before it. Lines are cut at a newline byte, which never occurs inside a UTF-8 character, so a cut
 * never splits one. A cursor is taken only while the file still holds, just before its offset, the bytes it
 * was given at — so a file that shrank, or was replaced, is read again from the start, rather than from
 * the middle of something else or as nothing for ever. A line that is not JSON is passed over. No file
 * is no events and a cursor at the start. A cursor no read gave is refused: it is somebody's bug.
 */
export const readTranscript = async (
  file: string | undefined,
  after: TranscriptCursor | undefined,
  eventsOf: (entry: unknown, offset: number, file: string) => TranscriptEvent[],
): Promise<Transcript> => {
  if (after !== undefined && !isTranscriptCursor(after)) {
    throw new Error(
      `\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`,
    );
  }
  if (!file) return noTranscript();
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return noTranscript();
    throw e;
  }
  try {
    const { size } = await handle.stat();
    const bytes = async (from: number, to: number) => {
      const buf = Buffer.alloc(Math.max(0, to - from));
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await handle.read(buf, got, buf.length - got, from + got);
        if (bytesRead === 0) break;
        got += bytesRead;
      }
      return buf.subarray(0, got);
    };
    const tailBefore = (offset: number) => bytes(Math.max(0, offset - CURSOR_TAIL_BYTES), offset);
    const asked = after === undefined ? 0 : Number(after.slice(0, after.indexOf('.')));
    const from = asked > 0 && asked <= size && cursorAt(asked, await tailBefore(asked)) === after ? asked : 0;
    const chunk = await bytes(from, size);
    const events: TranscriptEvent[] = [];
    let read = 0;
    for (let end = chunk.indexOf(0x0a); end !== -1; end = chunk.indexOf(0x0a, read)) {
      let entry: unknown;
      try {
        entry = JSON.parse(chunk.toString('utf8', read, end));
      } catch {
        entry = undefined;
      }
      if (entry !== undefined) events.push(...eventsOf(entry, from + read, file));
      read = end + 1;
    }
    const offset = from + read;
    return { events, cursor: offset === 0 ? START : cursorAt(offset, await tailBefore(offset)) };
  } finally {
    await handle.close();
  }
};
