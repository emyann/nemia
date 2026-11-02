import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { filterOf } from './feed.ts';

/**
 * What a write that changes a run changes on the board beside the run's own record: the whole list of the runs, the light answer the
 * frame reads, a factory's with it, and every page of the finished runs (`filterOf`). Every such write calls it, so the rail's count, the
 * gauges and a factory's bar read again at once, without waiting for the feed.
 *
 * Given the run `id`, its steps' tries and told too, at every stamp (`['runs', id, 'steps']`, by prefix): a
 * write can change a try without moving its step — its files pruned, an answer given — and a step's reads are keyed by its moves alone.
 */
export const runsMoved = (queryClient: QueryClient, id?: string): Promise<void> => {
  const keys: QueryKey[] = [['runs'], ['runs-open'], ['runs-finished'], ...(id === undefined ? [] : [['runs', id, 'steps']])];
  return Promise.all(keys.map((key) => queryClient.invalidateQueries(filterOf(key)))).then(() => undefined);
};
