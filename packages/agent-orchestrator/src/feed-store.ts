/**
 * The feed (`feed.ts`) over the store's own file: `$WF_ROOT/feed.jsonl`, and this process's one fold of it, which the tick writes through.
 *
 * Beneath `runner.ts`, beside `store.ts`: it imports neither the engine nor `runner.ts`, which re-exports it. Not merged into `feed.ts`, which
 * takes the file as an argument and names its own `feedCursorRefusal(file, after)`.
 */
import path from 'node:path';
import { HOME } from './store.ts';
import { feedCursorRefusal as cursorRefusalIn, freshMemo, readFeedFile, recordFeedFile, watchFeedFile, type FeedLine, type FeedMemo } from './feed.ts';
import type { FeedWords } from './run.ts';

/** The workflow layer's feed (`feed.ts`): beside `runs/`, one for the store, written by the tick alone. */
export const feedFile = (): string => path.join(HOME, 'feed.jsonl');

/** This process's fold of the feed, as far as it has read it: a restarted daemon starts from none, and reads the feed once. */
const feedMemo: FeedMemo = freshMemo();

/**
 * Write what the pass judged of every run in the store, where it is not what the feed said of it last (`recordFeedFile`), and the lines
 * written. `now` is every run the pass read: one the feed still names that is not in it is gone, and gets its `removed`. `memo` is for a
 * test, which starts one afresh to be a restarted daemon.
 */
export const recordFeed = (now: ReadonlyMap<string, FeedWords>, { at = new Date().toISOString(), memo = feedMemo }: { at?: string; memo?: FeedMemo } = {}): FeedLine[] =>
  recordFeedFile(feedFile(), now, at, memo);

/** A fold of nothing, for a test that plays a restarted daemon. */
export const freshFeedMemo = freshMemo;

/** The feed's lines after `after`, and the cursor to read on from (`readFeedFile`): a cursor inside a line, or past the end, is refused by name. */
export const readFeed = (after = 0): { lines: FeedLine[]; cursor: number } => readFeedFile(feedFile(), after);

/** Why `after` cannot be read from — or undefined when it can (`feedCursorRefusal` in feed.ts). */
export const feedCursorRefusal = (after: number): string | undefined => cursorRefusalIn(feedFile(), after);

/** Follow the feed from `from` until `stop()` (`watchFeedFile`), each line with the cursor just after it: refused before anything is watched when the cursor cannot be read from. */
export const watchFeed = (opts: Parameters<typeof watchFeedFile>[1]): { stop(): void } => watchFeedFile(feedFile(), opts);
