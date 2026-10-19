import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type FeedStatus, filterOf, followFeed, polled } from './feed.ts';
import { animationFrames } from './follow.ts';

/** Where the workflow feed is followed; `?after=` a cursor it gave, `?from=end` at the feed's end. */
const FEED_STREAM = '/api/feed/stream';

/**
 * The workflow feed, followed once a page: the root's, so a navigation inside the board keeps its one stream. Each event invalidates the
 * queries it can change (`keysOf`, each as `filterOf` says), and those the board polls slow to `FALLBACK_MS` while the stream is open
 * (`pace`).
 *
 * Every stream opens at the feed's end (`?from=end`) unless it resumes a cursor the api gave: the board holds no history of the feed, and
 * a replay of the whole of it would read every query it holds once a line.
 *
 * When it opens or goes down, the polled queries that are active are read once: react-query reads a query's `refetchInterval` again only
 * when the query changes, so one read at 5 s would otherwise wait out its old timer, and a read hands it the change. Open, the read is
 * also what the stream will not carry — what moved between the page's first reads and the end the stream starts at; down, it is what the
 * stream may have missed.
 */
export function useFeed(): FeedStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedStatus>('connecting');

  useEffect(
    () =>
      followFeed(
        (start) => new EventSource(start === 'end' ? `${FEED_STREAM}?from=end` : `${FEED_STREAM}?after=${encodeURIComponent(start.after)}`),
        {
          invalidate: (keys) => {
            for (const queryKey of keys) void queryClient.invalidateQueries(filterOf(queryKey));
          },
          status: (next) => {
            setStatus(next);
            const predicate = (query: { queryKey: readonly unknown[] }) => polled(query.queryKey);
            if (next !== 'connecting') void queryClient.refetchQueries({ predicate, type: 'active' });
          },
        },
        animationFrames,
      ),
    [queryClient],
  );

  return status;
}
