/** The cap on runs in flight (`GET /api/ceilings`, apps/api/src/ceilings.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { get } from './read.ts';

/**
 * Mirrors `Ceilings` in apps/api/src/ceilings.ts: the cap on runs in flight the daemon's last pass ran with (`last`, null before any pass wrote it),
 * the cap a run is judged by (0 for none), the runs that count against it — null with no cap, when the api reads none — and the runs it holds.
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
};

/** The cap on runs in flight, read again as the runs are, on a run's event: what the Factory says over its floor. */
export const ceilingsQuery = queryOptions({
  queryKey: ['ceilings'],
  queryFn: () => get<Ceilings>('/api/ceilings'),
  refetchInterval: () => pace(5_000),
});
