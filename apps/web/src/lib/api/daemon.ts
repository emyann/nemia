/**
 * Whether a daemon — the api's process or the headless one — ticks the store (`GET /api/daemon`), read through the objects' client as
 * `objects` says it (`Daemon`): `ticking` alone moves the runs.
 */
import { queryOptions } from '@tanstack/react-query';
import { Daemon } from 'objects';
import { pace } from '../feed.ts';
import { call, read } from './objects.ts';

export type { Daemon } from 'objects';

/**
 * Whether a daemon ticks the store: polled at `pace`, the same fallback as the cap's, since the feed carries no pass of the daemon — a pass
 * writes a feed line only where a word changed, so the feed is no heartbeat.
 */
export const daemonQuery = queryOptions({
  queryKey: ['daemon'],
  queryFn: () => call((c) => c.server.daemon(), read(Daemon)),
  refetchInterval: () => pace(5_000),
});
