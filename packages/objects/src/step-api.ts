/**
 * A run's step's reads, the `Api`'s `steps` group (`StepsGroup`): its tries, one try, a try's closeout and what it was told — the run
 * object's sub-resources — and the board's reads of it: the end of its session output (`StepLog`), a file it wrote, by name (its files
 * directory's, `artifacts/:file`, and a folder step's own folder's, `files/:file`), its task's path through the runtime's lifecycle
 * (`StepPath`), and its conversation read once from a cursor (`StepTranscript`) or followed as server-sent events (`StepStreamEvent`).
 * Each under `/api/runs/:runId/steps/:step/`, found among the runs the store lists, in any namespace. Served by the api's step handlers
 * (`apps/api/src/steps/steps.ts`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { BadRequest, Gone, Invalid, Missing, ReadFailed, Unjudged } from './api-errors.ts';
import { StepLog, StepTries, StepTry, TryCloseout } from './run.ts';
import { StepTold } from './run-told.ts';
import { LIFECYCLE_STATES, SAID_AFTER, TRANSCRIPT_ORIGINS, TRANSCRIPT_ROLES } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const State = Schema.Literals(LIFECYCLE_STATES);

/**
 * One thing said in a session's conversation, in the same shape for every harness (`TranscriptEvent`, agent-runtime's seam.ts): unique
 * by its `id` and `kind` together, since a `tool_result` carries its call's `id`; `at` the time on the harness's own record. A tool's
 * `input` is absent where the harness recorded the call without one.
 */
export const TranscriptEvent = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  role: Schema.Literals(TRANSCRIPT_ROLES),
  kind: Schema.Literals(SAID_AFTER),
  text: Schema.optionalKey(Schema.String),
  tool: Schema.optionalKey(Schema.Struct({ name: Schema.String, input: Schema.optionalKey(Schema.Unknown) })),
  result: Schema.optionalKey(Schema.Struct({ text: Schema.String, isError: Schema.Boolean })),
  origin: Schema.optionalKey(Schema.Struct({ kind: Schema.Literals(TRANSCRIPT_ORIGINS) })),
});
export type TranscriptEvent = typeof TranscriptEvent.Type;

/**
 * A read of a step's conversation: a page of the engine's events from the cursor asked with (`TRANSCRIPT_PAGE`), the cursor to pass as
 * `after` on the next read (null for a step with no task to read), whether something of its task runs or is to (`live`), whether it may
 * yet say more (`open`): a task that has not settled, one held open on a person's word among them — and whether events said already are
 * left after this page (`more`), to read on from `cursor` at once; absent from an answer that holds every event after its cursor.
 */
export const StepTranscript = Schema.Struct({
  events: List(TranscriptEvent),
  cursor: Schema.NullOr(Schema.String),
  live: Schema.Boolean,
  open: Schema.Boolean,
  more: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'StepTranscript' });
export type StepTranscript = typeof StepTranscript.Type;

/** One state of a task's path: the lifecycle state its journal says once an entry is on it, the entry's kind and its `at`. */
export const LifecycleTransition = Schema.Struct({ state: State, event: Schema.String, at: Schema.String });
export type LifecycleTransition = typeof LifecycleTransition.Type;

/** One edge of the lifecycle: the state it leaves, on what event, under which guard, the state it reaches, and what it does. */
export const LifecycleEdge = Schema.Struct({
  from: State,
  event: Schema.String,
  guard: Schema.optionalKey(Schema.String),
  to: State,
  action: Schema.String,
});
export type LifecycleEdge = typeof LifecycleEdge.Type;

/**
 * A verb a person writes to a task from outside the lifecycle: the entry it journals, who writes it, the states it is taken from, the
 * state the next pass reads, and the guard its refusal asks.
 */
export const LifecycleVerb = Schema.Struct({
  verb: Schema.String,
  entry: Schema.String,
  by: Schema.Literal('person'),
  from: List(State),
  to: State,
  guard: Schema.String,
});
export type LifecycleVerb = typeof LifecycleVerb.Type;

/** The lifecycle as data a page draws (`lifecycleGraph`, the runtime's): its first state, every state, the final ones, edges and verbs. */
export const LifecycleGraph = Schema.Struct({
  initial: State,
  states: List(State),
  final: List(State),
  edges: List(LifecycleEdge),
  verbs: List(LifecycleVerb),
});
export type LifecycleGraph = typeof LifecycleGraph.Type;

/**
 * The path of one try of a step: its task (null for a step not filed yet, whose path is empty), the try's number counted from 1, the
 * task's path to the end of that try, and the lifecycle it walks, which the board draws it on.
 */
export const StepPath = Schema.Struct({
  taskId: Schema.NullOr(Schema.String),
  try: Schema.Number,
  path: List(LifecycleTransition),
  lifecycle: LifecycleGraph,
}).annotate({ identifier: 'StepPath' });
export type StepPath = typeof StepPath.Type;

/** A file a step wrote, its bytes as they are on disk, under the headers that serve an agent's file on the board's origin. */
export const StepFile = HttpApiSchema.WithHeaders(Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), {
  /** Its type by its name's extension: HTML and other markup a browser would run are served as text. */
  'content-type': Schema.String,
  /** Read on each request and never kept: a step that runs again writes its files again. */
  'cache-control': Schema.Literal('no-store'),
  'x-content-type-options': Schema.Literal('nosniff'),
  /** An SVG or an HTML file opened in a tab runs no script of its own. */
  'content-security-policy': Schema.String,
});

/** One event of a step's stream, named `event`, its data the JSON of `data`, and the cursor to resume from as its `id` where it has one. */
const sse = <E extends string, D extends Schema.Top>(event: E, data: D) =>
  Schema.Struct({ id: Schema.optionalKey(Schema.String), event: Schema.Literal(event), data: Schema.fromJsonString(data) });

/**
 * What a step's stream sends, by name: whether its harness pushes the session (`following`); each whole event of its conversation
 * (`transcript`, the read's cursor the id of the last of a read); a piece of the message being written (`partial`: its block's `key`, the
 * text added, `last` once the block is whole); the step's move to another task (`moved`), whose history follows from its start; its task
 * settled (`settled`, the cursor its id), after which the stream ends; why no live stream can be had, read again on a beat
 * (`unreadable`, `retrying`); and that cleared (`readable`). An EventSource sends the last id back as `Last-Event-ID` when it reconnects.
 */
export const StepStreamEvent = Schema.Union([
  sse('following', Schema.Struct({ streamed: Schema.Boolean })),
  sse('transcript', TranscriptEvent),
  sse('partial', Schema.Struct({ key: Schema.String, delta: Schema.String, last: Schema.Boolean })),
  sse('moved', Schema.Struct({ taskId: Schema.String })),
  sse('settled', Schema.Struct({ cursor: Schema.String })),
  sse('unreadable', Schema.Struct({ error: Schema.String, retrying: Schema.Boolean })),
  sse('readable', Schema.Struct({})),
]);
export type StepStreamEvent = typeof StepStreamEvent.Type;

/** A run's step, named in the path. */
const stepParams = { runId: Schema.String, step: Schema.String };

/** A step's try, by its number as the path says it. */
const tryParams = { ...stepParams, try: Schema.String };

/** A file of a step's, by its name, never by a path. */
const fileParams = { ...stepParams, file: Schema.String };

/**
 * The query of a read of a step's tries, a try or its closeout, each closeout read narrowly (`closeoutNarrowed`): `fields`, the fields of
 * the closeout's `output` to answer, comma-separated, as JSON:API's sparse fieldsets spell them, `*` for every one, an empty one naming
 * none; not given, the fields whose JSON is short (`SHORT_FIELD`), the rest named in `outputLeftOut`. And the page of its `body`:
 * `bodyFrom`, the character it starts at (0 where not given), and `bodyLimit`, how many it holds (`BODY_PAGE`), the answer's `bodyNext`
 * where more is left.
 */
const closeoutQuery = {
  fields: Schema.optionalKey(Schema.String),
  bodyFrom: Schema.optionalKey(Schema.String),
  bodyLimit: Schema.optionalKey(Schema.String),
};

/**
 * The query of a read of a step's conversation: `after`, the cursor it reads on from; `limit`, the first events after it, or `last`, the
 * last ones (`TRANSCRIPT_PAGE`), never both; and `kinds`, the kinds of event to answer, comma-separated, every one where not given — the
 * cursor answered still counts every event, so a read without `kinds` from it misses none.
 */
const transcriptQuery = {
  after: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.String),
  last: Schema.optionalKey(Schema.String),
  kinds: Schema.optionalKey(Schema.String),
};

/** What a sub-resource of the run object refuses with: none by that name, a try the package refuses, a run not judged. */
const subResourceErrors = [Missing, Invalid, Unjudged];

/** What a read of a step through the engine refuses with: a cursor or a try it does not take, none there, a read that failed under it. */
const engineReadErrors = [BadRequest, Missing, ReadFailed];

/**
 * A run's step's reads. Each answers `Missing` for a run or a step the run does not have; a file's name that is a path is `BadRequest`;
 * a file `nemia prune --artifacts` removed is `Gone`; a read the engine could not make is `ReadFailed`, naming the command that reads the
 * same from the command line. The stream's refusals are answered before it opens: a refused cursor or a lost task is a status, not an
 * event.
 */
export class StepsGroup extends HttpApiGroup.make('steps').add(
  HttpApiEndpoint.get('tries', '/api/runs/:runId/steps/:step/tries', {
    params: stepParams,
    query: closeoutQuery,
    success: StepTries,
    error: subResourceErrors,
  }),
  HttpApiEndpoint.get('try', '/api/runs/:runId/steps/:step/tries/:try', {
    params: tryParams,
    query: closeoutQuery,
    success: StepTry,
    error: subResourceErrors,
  }),
  HttpApiEndpoint.get('closeout', '/api/runs/:runId/steps/:step/tries/:try/closeout', {
    params: tryParams,
    query: closeoutQuery,
    success: TryCloseout,
    error: subResourceErrors,
  }),
  HttpApiEndpoint.get('told', '/api/runs/:runId/steps/:step/told', {
    params: stepParams,
    success: StepTold,
    error: subResourceErrors,
  }),
  HttpApiEndpoint.get('log', '/api/runs/:runId/steps/:step/log', {
    params: stepParams,
    /** `tail`, how many of its last lines to answer (`LOG_TAIL`). */
    query: { tail: Schema.optionalKey(Schema.String) },
    success: StepLog,
    error: [Missing, ReadFailed],
  }),
  HttpApiEndpoint.get('artifact', '/api/runs/:runId/steps/:step/artifacts/:file', {
    params: fileParams,
    success: StepFile,
    error: [BadRequest, Missing, Gone],
  }),
  HttpApiEndpoint.get('file', '/api/runs/:runId/steps/:step/files/:file', {
    params: fileParams,
    success: StepFile,
    error: [BadRequest, Missing],
  }),
  HttpApiEndpoint.get('path', '/api/runs/:runId/steps/:step/path', {
    params: stepParams,
    query: { try: Schema.optionalKey(Schema.String) },
    success: StepPath,
    error: engineReadErrors,
  }),
  HttpApiEndpoint.get('transcript', '/api/runs/:runId/steps/:step/transcript', {
    params: stepParams,
    query: transcriptQuery,
    success: StepTranscript,
    error: engineReadErrors,
  }),
  HttpApiEndpoint.get('transcriptStream', '/api/runs/:runId/steps/:step/transcript/stream', {
    params: stepParams,
    query: { after: Schema.optionalKey(Schema.String) },
    headers: { 'last-event-id': Schema.optionalKey(Schema.String) },
    success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamSse({ events: StepStreamEvent }), {
      /** Never kept by a proxy between: each event is said once. */
      'cache-control': Schema.Literal('no-cache'),
    }),
    error: engineReadErrors,
  }),
) {}
