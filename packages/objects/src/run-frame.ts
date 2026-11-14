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
  wallMs: Schema.Finite.annotate({ description: "The run's wall time in milliseconds, the sum of the five below." }),
  sessionsMs: Schema.Finite.annotate({ description: 'The milliseconds its sessions were at work.' }),
  checksMs: Schema.Finite.annotate({ description: 'The milliseconds its checks were at work.' }),
  personMs: Schema.Finite.annotate({ description: "The milliseconds it waited on a person's turn." }),
  slotMs: Schema.Finite.annotate({ description: 'The milliseconds it waited for a run slot.' }),
  restMs: Schema.Finite.annotate({ description: 'The rest of its wall time, none of the four above.' }),
}).annotate({ identifier: 'RunClock' });
export type RunClock = typeof RunClock.Type;

/**
 * A RunList's metadata (`ListMeta`) and, on a list asked by state alone, how many runs of its namespace and labels are in each state
 * (`counts`), counted before its `fieldSelector` and its page, which a paged list cannot otherwise give, and the instant its runs'
 * durations are measured to (`asOf`). `asOf` is no key of Kubernetes': a duration needs the instant it is measured to.
 */
export const RunListMeta = Schema.Struct({
  ...ListMeta.fields,
  counts: Schema.optionalKey(
    Schema.Struct({ waiting: Schema.Finite, inFlight: Schema.Finite, finished: Schema.Finite }).annotate({
      description:
        'How many runs of its namespace and labels are in each state, counted before its fieldSelector and its page; on a list asked by state alone.',
    }),
  ),
  asOf: Schema.optionalKey(
    Schema.String.annotate({ description: "The instant its runs' durations are measured to; on a list asked by state alone." }),
  ),
}).annotate({
  identifier: 'RunListMeta',
  description:
    "A page of runs' metadata: where the page stands, and on a list asked by state, its counts per state and the instant it is measured to.",
});
export type RunListMeta = typeof RunListMeta.Type;
