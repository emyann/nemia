/** Whether a `wf up` ticks the store (`GET /api/daemon`, apps/api/src/factory/daemon.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { getUndecoded } from './read.ts';

/**
 * Mirrors `Daemon` in apps/api/src/factory/daemon.ts: whether a `wf up` ticks the store, as the package judges `daemon.json` — `ticking`
 * alone moves the runs; `none`, `unreadable`, `stopped`, `gone` and `stalled` (alive, silent past `staleAfterMs`) do not. Times are ISO,
 * null where the file says none; `lastHeardAt` is the latest of its start, its last pass and its beat. `line` is `wf ls`'s own sentence.
 */
export type Daemon = {
  kind: 'none' | 'unreadable' | 'stopped' | 'gone' | 'stalled' | 'ticking';
  ticking: boolean;
  pid: number | null;
  cwd: string | null;
  every: number | null;
  startedAt: string | null;
  passedAt: string | null;
  lastHeardAt: string | null;
  stoppedAt: string | null;
  staleAfterMs: number | null;
  identity: 'same' | 'other' | 'unknown' | 'gone' | null;
  line: string;
};

/**
 * Whether a daemon ticks the store: polled at `pace`, the same fallback as the cap's, since the feed carries no pass of the daemon — a pass
 * writes a feed line only where a word changed, so the feed is no heartbeat.
 */
export const daemonQuery = queryOptions({
  queryKey: ['daemon'],
  queryFn: () => getUndecoded<Daemon>('/api/daemon'),
  refetchInterval: () => pace(5_000),
});
