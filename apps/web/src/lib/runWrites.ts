import type { QueryClient } from '@tanstack/react-query';
import { filterOf } from './feed.ts';

/**
 * What a write that changes a run changes on the board beside the run's own record: the whole list of the runs, and the light answer the
 * frame reads, a factory's with it (`filterOf`). Every such write calls it, so the bell, the footer and a factory's bar read again at
 * once, without waiting for the feed.
 */
export const runsMoved = (queryClient: QueryClient): Promise<void> =>
  Promise.all([queryClient.invalidateQueries(filterOf(['runs'])), queryClient.invalidateQueries(filterOf(['runs-open']))]).then(
    () => undefined,
  );
