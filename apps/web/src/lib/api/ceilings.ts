/** The cap on runs in flight and what the daemon's last pass cost (`GET /api/ceilings`, apps/api/src/factory/ceilings.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get } from './read.ts';

/** The phases of a pass (`PHASES` in agent-orchestrator's meter.ts; `PASS_PHASES` in lib/pass.ts keeps their order). */
export type PassPhase = 'records' | 'asks' | 'journals' | 'observe' | 'runtime' | 'place' | 'assess' | 'act';

/**
 * Mirrors the package's `PassCost`: what the last pass cost — its time, and each phase's time, calls, bytes read and processes started;
 * each harness's observes (at once in a pass, so their times overlap); the run records read, the totals, what measuring it took, and the
 * runs at rest it answered from memory; and what it saw — the runs in the store, the tasks not settled, the sessions queued and admitted —
 * absent from a pass an older tick wrote.
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
  runs?: number;
  tasks?: number;
  queued?: number;
  admitted?: number;
};

/** Decodes one phase's cost. */
const PhaseCostSchema = Schema.Struct({
  ms: Schema.Number,
  calls: Schema.Number,
  bytes: Schema.Number,
  reads: Schema.Number,
  spawned: Schema.Number,
});

/** Decodes a `PassCost`: every phase a key of its own, so a pass that leaves one out is refused at it. */
const PassCostSchema = Schema.Struct({
  at: Schema.String,
  ms: Schema.Number,
  phases: Schema.Struct({
    records: PhaseCostSchema,
    asks: PhaseCostSchema,
    journals: PhaseCostSchema,
    observe: PhaseCostSchema,
    runtime: PhaseCostSchema,
    place: PhaseCostSchema,
    assess: PhaseCostSchema,
    act: PhaseCostSchema,
  }),
  harnesses: Schema.Record(
    Schema.String,
    Schema.Struct({ calls: Schema.Number, ms: Schema.Number, listed: Schema.Number, spawned: Schema.Number }),
  ),
  records: Schema.Number,
  bytes: Schema.Number,
  spawned: Schema.Number,
  overheadMs: Schema.Number,
  rested: Schema.Number,
  runs: Schema.optionalKey(Schema.Number),
  tasks: Schema.optionalKey(Schema.Number),
  queued: Schema.optionalKey(Schema.Number),
  admitted: Schema.optionalKey(Schema.Number),
}) satisfies Schema.Schema<PassCost>;

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

/** Decodes `Ceilings`. */
const CeilingsSchema = Schema.Struct({
  last: Schema.NullOr(Schema.Struct({ sessions: Schema.Number, runs: Schema.Number })),
  cap: Schema.Number,
  inFlight: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
  held: Schema.mutable(
    Schema.Array(Schema.Struct({ run: Schema.String, inFlight: Schema.Number, cap: Schema.Number, word: Schema.String })),
  ),
  pass: Schema.NullOr(PassCostSchema),
}) satisfies Schema.Schema<Ceilings>;

/** The cap on runs in flight, read again as the runs are, on a run's event: what the Factory says over its floor. */
export const ceilingsQuery = queryOptions({
  queryKey: ['ceilings'],
  queryFn: () => get('/api/ceilings', CeilingsSchema),
  refetchInterval: () => pace(5_000),
});
