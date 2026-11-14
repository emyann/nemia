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
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Event').annotate({ description: 'What the object is: an Event, one line of the feed.' }),
  metadata: ObjectMeta,
  involved: EventInvolved.annotate({
    description:
      "What the line is about: its kind (Run, Step, Daemon, Store, Factory) and name, a run's id, <run>/<step>, a daemon's pid or store.",
  }),
  reason: Schema.Literals(EVENT_REASONS).annotate({
    description: 'What happened, as a code a machine selects on; Unknown for a reason this version does not know.',
  }),
  type: Schema.Literals(EVENT_TYPES).annotate({
    description: 'How serious it is: Normal for routine news, Warning for something gone wrong.',
  }),
  message: Schema.String.annotate({ description: 'What happened, in the words a person reads.' }),
  source: Schema.Literals(EVENT_SOURCES).annotate({
    description: "Whose deed it is: the tick's judgement, the runtime's journal, a person's verb, or a daemon that took the store.",
  }),
  waits: Schema.optionalKey(
    Schema.Literals(EVENT_WAITS).annotate({ description: 'Who the line waits on, where it waits on someone: a person. Absent otherwise.' }),
  ),
  on: Schema.optionalKey(
    Schema.Literals(WAIT_ON).annotate({
      description:
        'What a Waiting line waits on: run (the runs its hold names) or hold (a hold only a person lifts). Absent on any other line.',
    }),
  ),
  via: Schema.optionalKey(
    Schema.Literals(ANSWER_VIA).annotate({
      description: "Where an AwaitingAnswer line's answer is asked: session or closeout. Absent on any other line.",
    }),
  ),
  call: Schema.optionalKey(Schema.String.annotate({ description: 'The call denied, on a ToolDenied line; absent on any other.' })),
  try: Schema.optionalKey(
    Schema.Number.annotate({ description: "The step's try the call was denied in, on a ToolDenied line; absent on any other." }),
  ),
  actor: Schema.optionalKey(Actor),
});
export type Event = typeof Event.Type;

/** A page of the feed's events, in the order they were written. */
export const EventList = listOf('Event', Event);
export type EventList = typeof EventList.Type;
