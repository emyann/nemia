/**
 * The cap on runs in flight and what the daemon's last pass cost (`GET /api/ceilings`), read through the objects' client as `objects`
 * says it (`Ceilings`, `PassCost`).
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { Ceilings as CeilingsAnswer, type PassCost as PassCostAnswer } from 'objects';
import { pace } from '../feed.ts';
import { call, read } from './objects.ts';
import { decoded } from './read.ts';

/** The phases of a pass (`PHASES` in agent-orchestrator's meter.ts; `PASS_PHASES` in lib/pass.ts keeps their order). */
export type PassPhase = 'records' | 'asks' | 'journals' | 'revisions' | 'observe' | 'runtime' | 'place' | 'assess' | 'act';

/** One phase's cost. */
const PhaseCost = Schema.Struct({
  ms: Schema.Number,
  calls: Schema.Number,
  bytes: Schema.Number,
  reads: Schema.Number,
  spawned: Schema.Number,
});

/** One harness's observes in a pass, `unread` where it could not read it. */
const HarnessCost = Schema.Struct({
  calls: Schema.Number,
  ms: Schema.Number,
  listed: Schema.Number,
  spawned: Schema.Number,
  unread: Schema.optionalKey(Schema.Number),
});

/**
 * A pass's phases and harnesses, by the keys the board draws. A copy that stays: `objects`' `PassCost` carries both as JSON by any key
 * (the pass writes them; its readers each read their own), and the board's Factory strip reads every phase by its name, so it decodes
 * them here — a pass that leaves a phase out is refused at it.
 */
const PassParts = Schema.Struct({
  phases: Schema.Struct({
    records: PhaseCost,
    asks: PhaseCost,
    journals: PhaseCost,
    revisions: PhaseCost,
    observe: PhaseCost,
    runtime: PhaseCost,
    place: PhaseCost,
    assess: PhaseCost,
    act: PhaseCost,
  }),
  harnesses: Schema.Record(Schema.String, HarnessCost),
});

/** What the last pass cost: `objects`' `PassCost`, its phases and harnesses read by their keys (`PassParts`). */
export type PassCost = Omit<PassCostAnswer, 'phases' | 'harnesses'> & typeof PassParts.Type;

/** The cap and the daemon's last pass (`objects`' `Ceilings`), the pass's parts read by their keys. */
export type Ceilings = Omit<CeilingsAnswer, 'pass'> & { pass: PassCost | null };

/** `answer` with its pass's parts read by their keys. */
const ceilingsOf = (answer: CeilingsAnswer): Ceilings =>
  answer.pass === null
    ? { ...answer, pass: null }
    : { ...answer, pass: { ...answer.pass, ...decoded('GET /api/ceilings', PassParts, answer.pass) } };

/** The cap and the last pass: polled at `pace`, since the feed carries no pass of the daemon. */
export const ceilingsQuery = queryOptions({
  queryKey: ['ceilings'],
  queryFn: () => call((c) => c.server.ceilings(), read(CeilingsAnswer)).then(ceilingsOf),
  refetchInterval: () => pace(5_000),
});
