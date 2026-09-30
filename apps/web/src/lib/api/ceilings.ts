/** The cap on runs in flight (`GET /api/ceilings`, apps/api/src/factory/ceilings.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { getUndecoded } from './read.ts';

/** The phases of a pass (`PHASES` in agent-orchestrator's meter.ts; `PASS_PHASES` in lib/pass.ts keeps their order). */
export type PassPhase = 'records' | 'asks' | 'journals' | 'observe' | 'runtime' | 'git' | 'assess' | 'act';

/**
 * Mirrors the package's `PassCost`: what the last pass cost — its time, and each phase's time, calls, bytes read and processes started;
 * each harness's observes (at once in a pass, so their times overlap); the run records read, the totals, what measuring it took, and the
 * runs at rest it answered from memory.
 */
export type PassCost = {
  at: string;
  ms: number;
  phases: Record<PassPhase, { ms: number; calls: number; bytes: number; reads: number; spawned: number }>;
  harnesses: Record<string, { calls: number; ms: number; listed: number; spawned: number }>;
  records: number;
  bytes: number;
  spawned: number;
  overheadMs: number;
  rested: number;
};

/**
 * Mirrors `Ceilings` in apps/api/src/factory/ceilings.ts: the cap on runs in flight the daemon's last pass ran with (`last`, null before
 * any pass wrote it), the cap a run is judged by (0 for none), the runs that count against it — null with no cap, when the api reads none —
 * the runs it holds, and what the last pass cost (`pass`, null before any pass wrote it).
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
  pass: PassCost | null;
};

/** The cap on runs in flight, read again as the runs are, on a run's event: what the Factory says over its floor. */
export const ceilingsQuery = queryOptions({
  queryKey: ['ceilings'],
  queryFn: () => getUndecoded<Ceilings>('/api/ceilings'),
  refetchInterval: () => pace(5_000),
});
