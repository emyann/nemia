/**
 * The board's frame of a run, as a RunList asked by state (`?fieldSelector=status.state…`) carries it: where a run's wall time went
 * (`RunClock`), and the list's metadata with its counts per state and the instant it is measured to (`RunListMeta`). The keys of the
 * Run's status beside them are `run.ts`'s.
 */
import { Schema } from 'effect';
import { ListMeta } from './meta.ts';

/**
 * Where a run's wall time went, in ms (`RunClock`): its sessions, its checks, a person's turn, waiting for a run slot, and the rest, the
 * five adding up to `wallMs`, measured to the instant the run's own `wallMs` is.
 */
export const RunClock = Schema.Struct({
  wallMs: Schema.Finite,
  sessionsMs: Schema.Finite,
  checksMs: Schema.Finite,
  personMs: Schema.Finite,
  slotMs: Schema.Finite,
  restMs: Schema.Finite,
}).annotate({ identifier: 'RunClock' });
export type RunClock = typeof RunClock.Type;

/**
 * A RunList's metadata (`ListMeta`) and, on a list asked by state alone, how many runs of its namespace and labels are in each state
 * (`counts`), counted before its `fieldSelector` and its page, which a paged list cannot otherwise give, and the instant its runs'
 * durations are measured to (`asOf`). `asOf` is no key of Kubernetes': a duration needs the instant it is measured to.
 */
export const RunListMeta = Schema.Struct({
  ...ListMeta.fields,
  counts: Schema.optionalKey(Schema.Struct({ waiting: Schema.Finite, inFlight: Schema.Finite, finished: Schema.Finite })),
  asOf: Schema.optionalKey(Schema.String),
}).annotate({ identifier: 'RunListMeta' });
export type RunListMeta = typeof RunListMeta.Type;
