/**
 * Every file of `src` that still calls the feed's module spellings — `watchFeed`, `recordFeed`, `recordDaemonLine`, `readFeed`,
 * `readFeedEnds`, `feedSize`, `feedCursorRefusal` and `feedFile`, each the Feed door over the module's root, run where it is called —
 * rather than yielding the door (`FeedDoor`, `src/feed/feed.store.ts`), with how many calls do (`src/feed/feed.store.test.ts`). A debt, and
 * nothing else: a program yields the door, whose reads and appends are checked on every layer and whose memory stand-in a test gives it; a
 * call left is a synchronous caller S6 did not convert — the CLI's watch and its cursors, the tick's note of a feed not written, and the
 * `from` a subscription is filed with, which waits for the Subscription door. S6 moved the feed's verbs and the step's follower
 * (`src/feed/feed.verb.ts`, `src/following/following.verb.ts`).
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the feed's module spellings, comments left out. */
export const FEED_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/cli/main.ts': 4,
  'src/tick/tick.verb.ts': 1,
};
