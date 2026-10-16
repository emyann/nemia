import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type FeedStatus, filterOf, followFeed, polled } from './feed.ts';
import { animationFrames } from './follow.ts';

/** Where the workflow feed is followed; `?after=` a cursor it gave. */
const FEED_STREAM = '/api/feed/stream';

/**
 * The workflow feed, followed once a page: the root's, so a navigation inside the board keeps its one stream. Each event invalidates the
 * queries it can change (`keysOf`, each as `filterOf` says), and those the board polls slow to `FALLBACK_MS` while the stream is open
 * (`pace`).
 *
 * When it opens or goes down, the polled queries are told at once: react-query reads a query's `refetchInterval` again only when the query
 * changes, so one read at 5 s would otherwise wait out its old timer. Open, they are marked stale, which reads nothing; down, they are read
 * again, which reads what the stream may have missed and puts them back at their own pace.
 */
export function useFeed(): FeedStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedStatus>('connecting');

  useEffect(
    () =>
      followFeed(
        (after) => new EventSource(after === undefined ? FEED_STREAM : `${FEED_STREAM}?after=${encodeURIComponent(after)}`),
        {
          invalidate: (keys) => {
            for (const queryKey of keys) void queryClient.invalidateQueries(filterOf(queryKey));
          },
          status: (next) => {
            setStatus(next);
            const predicate = (query: { queryKey: readonly unknown[] }) => polled(query.queryKey);
            if (next === 'open') void queryClient.invalidateQueries({ predicate, refetchType: 'none' });
            else if (next === 'down') void queryClient.refetchQueries({ predicate, type: 'active' });
          },
        },
        animationFrames,
      ),
    [queryClient],
  );

  return status;
}
