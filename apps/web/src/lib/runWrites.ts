import type { QueryClient } from '@tanstack/react-query';
import { filterOf } from './feed.ts';

/**
 * What a write that changes a run changes on the board beside the run's own record: the whole list of the runs, the light answer the
 * frame reads, a factory's with it, and every page of the finished runs (`filterOf`). Every such write calls it, so the bell, the footer
 * and a factory's bar read again at once, without waiting for the feed.
 */
export const runsMoved = (queryClient: QueryClient): Promise<void> =>
  Promise.all([['runs'], ['runs-open'], ['runs-finished']].map((key) => queryClient.invalidateQueries(filterOf(key)))).then(
    () => undefined,
  );
