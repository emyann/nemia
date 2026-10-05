/**
 * The cap on runs in flight (`GET /api/ceilings`, apps/api/src/factory/ceilings.ts), and what the recent passes of the tick cost
 * (`GET /api/passes`).
 */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { Schema } from 'effect';
import { get } from './read.ts';

/** The phases of a pass (`PHASES` in agent-orchestrator's meter.ts; `PASS_PHASES` in lib/pass.ts keeps their order). */
export type PassPhase = 'records' | 'asks' | 'journals' | 'observe' | 'runtime' | 'git' | 'assess' | 'act';

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
    git: PhaseCostSchema,
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

/** What a pass saw: the runs in the store, the tasks not settled, and the sessions queued and admitted. */
type Seen = { runs: number; tasks: number; queued: number; admitted: number };

/**
 * Mirrors the package's `RecentPass`: one of the recent passes, its time, what it saw and read, and each phase's time; and the machine's
 * load per core and the longest a queued session had waited, absent from a pass an older tick kept.
 */
export type RecentPass = Seen & {
  at: string;
  ms: number;
  records: number;
  rested: number;
  reads: number;
  phases: Record<PassPhase, number>;
  load?: number;
  waitMs?: number;
};

/** Mirrors `PassesRead` (`GET /api/passes`): the recent passes, oldest first; their histogram (`le` null past the last bound); each
 * phase's time a pass on average and share of the whole, heaviest first; their median, slowest and what the latest saw; and the bounds. */
export type PassesRead = {
  recent: RecentPass[];
  histogram: Array<{ le: number | null; count: number }>;
  parts: Array<{ phase: PassPhase; ms: number; share: number }>;
  summary: (Seen & { passes: number; medianMs: number; slowestMs: number; reads: number; at: string }) | null;
  bounds: number[];
};

const PhaseSchema = Schema.Literals(['records', 'asks', 'journals', 'observe', 'runtime', 'git', 'assess', 'act']);

const SeenFields = { runs: Schema.Number, tasks: Schema.Number, queued: Schema.Number, admitted: Schema.Number };

/** Decodes `PassesRead`. */
const PassesReadSchema = Schema.Struct({
  recent: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        ...SeenFields,
        at: Schema.String,
        ms: Schema.Number,
        records: Schema.Number,
        rested: Schema.Number,
        reads: Schema.Number,
        load: Schema.optionalKey(Schema.Number),
        waitMs: Schema.optionalKey(Schema.Number),
        phases: Schema.Struct({
          records: Schema.Number,
          asks: Schema.Number,
          journals: Schema.Number,
          observe: Schema.Number,
          runtime: Schema.Number,
          git: Schema.Number,
          assess: Schema.Number,
          act: Schema.Number,
        }),
      }),
    ),
  ),
  histogram: Schema.mutable(Schema.Array(Schema.Struct({ le: Schema.NullOr(Schema.Number), count: Schema.Number }))),
  parts: Schema.mutable(Schema.Array(Schema.Struct({ phase: PhaseSchema, ms: Schema.Number, share: Schema.Number }))),
  summary: Schema.NullOr(
    Schema.Struct({
      ...SeenFields,
      passes: Schema.Number,
      medianMs: Schema.Number,
      slowestMs: Schema.Number,
      reads: Schema.Number,
      at: Schema.String,
    }),
  ),
  bounds: Schema.mutable(Schema.Array(Schema.Number)),
}) satisfies Schema.Schema<PassesRead>;

/** The recent passes of the tick, read again as the cap is: the Stats page's section on the tick's pass. */
export const passesQuery = queryOptions({
  queryKey: ['passes'],
  queryFn: () => get('/api/passes', PassesReadSchema),
  refetchInterval: () => pace(5_000),
});
