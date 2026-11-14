/**
 * The Event: one line of the feed served as an object, in the namespace of the factory it names, or in none for a daemon's and the
 * store's line that name no factory (cluster-scoped). It carries the line's fields as the feed says them — what it is about
 * (`involved`), the `reason` a machine selects on, its `type`, the `message` a person reads, whose deed it is (`source`) — and has no
 * `spec` or `status`, as Kubernetes' Event has none.
 *
 * Where it departs from Kubernetes' `core/v1` Event, on purpose:
 *
 * - `involved` {kind, name} for its involvedObject, the feed's own spelling: what it is about is a run, a step, a daemon or the store,
 *   never an object of another apiVersion.
 * - `source` is a word (`EVENT_SOURCES`), not an EventSource {component, host}.
 * - `reason` is closed (`EVENT_REASONS`): a line whose reason this `nemia` does not know is served as `Unknown`.
 * - No count, firstTimestamp, lastTimestamp or series: each line is one occurrence, and folding repeats is the reader's.
 * - No eventTime: the line's `at` is `metadata.creationTimestamp`.
 * - Its `metadata.name` is the byte of the feed its line starts at, and its `resourceVersion` the cursor just after it, the id the feed's
 *   stream sends it under: the feed only grows, so a name stays its line's.
 * - The fields the feed qualifies a reason with stay beside it: `waits`, `on` (what a `Waiting` line waits on), `via` (where an
 *   `AwaitingAnswer` line's answer is asked), and on a `ToolDenied` line the `call` denied and the step's `try`.
 *
 * Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { Actor } from './token.ts';
import { ANSWER_VIA, EVENT_REASONS, EVENT_SOURCES, EVENT_TYPES, EVENT_WAITS, INVOLVED_KINDS, WAIT_ON } from './words.ts';

/** What an Event is about: its kind, and its name — a run's id, `<run>/<step>`, a daemon's pid, or `store`. */
export const EventInvolved = Schema.Struct({ kind: Schema.Literals(INVOLVED_KINDS), name: Schema.String });
export type EventInvolved = typeof EventInvolved.Type;

/** A line of the feed, as an object. */
export const Event = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Event'),
  metadata: ObjectMeta,
  involved: EventInvolved,
  reason: Schema.Literals(EVENT_REASONS),
  type: Schema.Literals(EVENT_TYPES),
  message: Schema.String,
  source: Schema.Literals(EVENT_SOURCES),
  waits: Schema.optionalKey(Schema.Literals(EVENT_WAITS)),
  on: Schema.optionalKey(Schema.Literals(WAIT_ON)),
  via: Schema.optionalKey(Schema.Literals(ANSWER_VIA)),
  call: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Number),
  actor: Schema.optionalKey(Actor),
});
export type Event = typeof Event.Type;

/** A page of the feed's events, in the order they were written. */
export const EventList = listOf('Event', Event);
export type EventList = typeof EventList.Type;
