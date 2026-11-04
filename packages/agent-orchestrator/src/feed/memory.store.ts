/**
 * The Feed door's memory stand-in: a fresh layer of `FeedDoor` per call, the feed held as the bytes the file would hold, so a cursor is a
 * byte offset as it is on the files, and built by `feedDoorOver` as the files layer is, so a read's cursor and each appended line are
 * checked the one way on both. A test gives it its program — `Effect.provide(program, feedDoorMemory())` — where it needs the feed and
 * nothing of the disk; the walks (`test/feed-walks.ts`) hold it to what the files answer. Its feed is named under `MEMORY_ROOT`, as the
 * files' is under the store's root, and its generation is its own, one per stand-in: nothing cuts a feed in memory.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { appendedText, cursorRefusalOf, FeedDoor, feedAt, feedDoorOver, linesIn, type FeedLayer } from './feed.store.ts';

/** Where the stand-in says its feed is: the root it is named under, as the files' is under the store's root. */
export const MEMORY_ROOT = '/memory';

/** The generations handed out so far: each stand-in takes the next, so two are never one feed. */
let generations = 0;

/** A fresh Feed door over bytes in memory: no feed written. */
export function feedDoorMemory(): Layer.Layer<never> {
  const generation = ++generations;
  const where = feedAt(MEMORY_ROOT);
  let bytes: Buffer | null = null;
  const size = (): number => bytes?.length ?? 0;
  const layer: FeedLayer = {
    lines: {
      end: () => (bytes === null ? null : { cursor: bytes.length, generation }),
      read: (after) => linesIn(bytes === null || after >= bytes.length ? Buffer.alloc(0) : bytes.subarray(after), after),
      cursorRefusal: (after) => cursorRefusalOf(after, size(), (at) => bytes?.[at] ?? 0, where),
      append: (lines) => {
        const before = size();
        if (!lines.length) return { lines: [...lines], before, after: before, leading: '' };
        const { text, leading } = appendedText(lines, before > 0 ? bytes?.[before - 1] : undefined);
        bytes = Buffer.concat([bytes ?? Buffer.alloc(0), Buffer.from(text)]);
        return { lines: [...lines], before, after: bytes.length, leading };
      },
    },
  };
  return Layer.succeed(FeedDoor)(feedDoorOver(layer));
}
