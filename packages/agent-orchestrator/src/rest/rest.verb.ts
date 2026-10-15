/**
 * A memo of runs brought up to the engine's feed (`followedFeed`): what the tick's memo of runs at rest (`RestMemo` in tick.verb.ts), the
 * stats' memo of each run's facts (`StatsMemo` in stats.verb.ts) and the list's memo of runs at rest (`RestingMemo` in resting.verb.ts) all
 * read before they answer a run from memory. A controller, reaching the runtime through the client (`runtime-client.ts`): it reads the
 * feed, and writes nothing.
 */
import { Effect } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { evictedBy } from './rest.ts';

/** A memo of runs by id, and `cursor`, where on the engine's feed it has read to: undefined until it first reads the feed. */
export type FollowedMemo = { cursor?: number; runs: Map<string, unknown> };

/**
 * Whether `memo` was brought up to the engine's feed: every run a task of which appended since is taken out of it (`evictedBy`). A memo
 * that has read nothing reads the feed from its end: it holds no run a line before could concern. A journal with no feed yet answers with
 * the cursor it was given, and the memo then reads from the start on the next call. A feed that went back — a journal replaced or cut —
 * empties the memo; one that cannot be read empties it too, forgets its place on the feed, and answers false. Never fails.
 */
export const followedFeed = Effect.fn('followedFeed')(function* (e: Engine, memo: FollowedMemo) {
  const read = Effect.gen(function* () {
    if (memo.cursor === undefined) {
      memo.runs.clear();
      const { cursor } = yield* e.feed(Number.MAX_SAFE_INTEGER);
      memo.cursor = cursor >= Number.MAX_SAFE_INTEGER ? 0 : cursor;
      return true;
    }
    const { entries, cursor } = yield* e.feed(memo.cursor);
    if (cursor < memo.cursor) memo.runs.clear();
    else {
      for (const id of evictedBy(
        entries.map((f) => f.taskId),
        new Set(memo.runs.keys()),
      ))
        memo.runs.delete(id);
    }
    memo.cursor = cursor;
    return true;
  });
  return yield* read.pipe(
    Effect.catchCause(() =>
      Effect.sync(() => {
        memo.runs.clear();
        memo.cursor = undefined;
        return false;
      }),
    ),
  );
});
