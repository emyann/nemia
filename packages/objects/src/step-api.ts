/**
 * A run's step's reads, the `Api`'s `steps` group (`StepsGroup`): its tries, one try, a try's closeout, a page of what a try's check
 * printed (`CheckOutput`) and what it was told — the run object's sub-resources — and the board's reads of it: the end of its session output (`StepLog`), a file it wrote, by its path (its
 * files directory's, `artifacts/:file`, and a folder step's own folder's, `files/:file`, each a path under it encoded whole), its
 * task's path through the runtime's lifecycle (`StepPath`), and its conversation read once from a cursor (`StepTranscript`) or followed
 * as server-sent events (`StepStreamEvent`).
 * Each under `/api/runs/:runId/steps/:step/`, found among the runs the store lists, in any namespace. Served by the api's step handlers
 * (`apps/api/src/steps/steps.ts`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { BadRequest, Gone, Invalid, Missing, ReadFailed, Unjudged } from './api-errors.ts';
import { CheckOutput, StepLog } from './run.ts';
import { StepTries, StepTry, TryCloseout } from './run-tries.ts';
import { StepTold } from './run-told.ts';
import { describedNumber, describedOne } from './meta.ts';
import { LIFECYCLE_STATES, OUTPUT_STREAMS, SAID_AFTER, TRANSCRIPT_ORIGINS, TRANSCRIPT_ROLES } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const State = Schema.Literals(LIFECYCLE_STATES);

/**
 * One thing said in a session's conversation, in the same shape for every harness (`TranscriptEvent`, agent-runtime's seam.ts): unique
 * by its `id` and `kind` together, since a `tool_result` carries its call's `id`; `at` the time on the harness's own record. A tool's
 * `input` is absent where the harness recorded the call without one.
 */
export const TranscriptEvent = Schema.Struct({
  id: Schema.String.annotate({ description: "The event's id, which a tool_result shares with its call; unique with its kind." }),
  at: Schema.String.annotate({ description: "When it was said, the time on the harness's own record." }),
  role: Schema.Literals(TRANSCRIPT_ROLES).annotate({ description: "Who said it: assistant, user (a tool's result is user) or system." }),
  kind: Schema.Literals(SAID_AFTER).annotate({ description: 'What kind of event it is: text, thinking, tool_use, tool_result or system.' }),
  text: Schema.optionalKey(Schema.String.annotate({ description: 'The words of the event; absent for one with none.' })),
  tool: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String.annotate({ description: 'The tool called.' }),
      input: Schema.optionalKey(
        describedOne(
          Schema.Unknown,
          'What the tool was called with, as the harness recorded it; absent where it recorded the call without one.',
        ),
      ),
    }).annotate({ description: 'The tool call, of a tool_use event.' }),
  ),
  result: Schema.optionalKey(
    Schema.Struct({
      text: Schema.String.annotate({ description: "The tool's result, in words." }),
      isError: Schema.Boolean.annotate({ description: 'Whether the tool failed.' }),
    }).annotate({ description: "The tool's result, of a tool_result event." }),
  ),
  origin: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(TRANSCRIPT_ORIGINS).annotate({
        description: "Where a user event's words came from, as the harness said it; unknown for a word the runtime has not named.",
      }),
    }).annotate({ description: "Where a user event's words came from." }),
  ),
});
export type TranscriptEvent = typeof TranscriptEvent.Type;

/**
 * A read of a step's conversation: a page of the engine's events from the cursor asked with (`TRANSCRIPT_PAGE`), the cursor to pass as
 * `after` on the next read (null for a step with no task to read), whether something of its task runs or is to (`live`), whether it may
 * yet say more (`open`): a task that has not settled, one held open on a person's word among them — and whether events said already are
 * left after this page (`more`), to read on from `cursor` at once; absent from an answer that holds every event after its cursor.
 */
export const StepTranscript = Schema.Struct({
  events: List(TranscriptEvent).annotate({
    description: "A page of the engine's events of the step's conversation, from the cursor asked with.",
  }),
  cursor: Schema.NullOr(Schema.String).annotate({
    description: 'The cursor to pass as after on the next read; null for a step with no task to read.',
  }),
  live: Schema.Boolean.annotate({ description: 'Whether something of its task runs, or is to.' }),
  open: Schema.Boolean.annotate({
    description: "Whether it may yet say more: a task that has not settled, one held open on a person's word among them.",
  }),
  more: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        'Whether events said already are left after this page, to read on from cursor at once; absent where the answer holds every one.',
    }),
  ),
}).annotate({ identifier: 'StepTranscript' });
export type StepTranscript = typeof StepTranscript.Type;

/** One state of a task's path: the lifecycle state its journal says once an entry is on it, the entry's kind and its `at`. */
export const LifecycleTransition = Schema.Struct({
  state: State.annotate({ description: 'The lifecycle state its journal says.' }),
  event: Schema.String.annotate({ description: 'The kind of the journal entry that put it on the state.' }),
  at: Schema.String.annotate({ description: 'When the entry was written.' }),
});
export type LifecycleTransition = typeof LifecycleTransition.Type;

/** One edge of the lifecycle: the state it leaves, on what event, under which guard, the state it reaches, and what it does. */
export const LifecycleEdge = Schema.Struct({
  from: State.annotate({ description: 'The state the edge leaves.' }),
  event: Schema.String.annotate({ description: 'The event it is taken on.' }),
  guard: Schema.optionalKey(Schema.String.annotate({ description: 'The guard it is taken under; absent for none.' })),
  to: State.annotate({ description: 'The state it reaches.' }),
  action: Schema.String.annotate({ description: 'What it does.' }),
});
export type LifecycleEdge = typeof LifecycleEdge.Type;

/**
 * A verb a person writes to a task from outside the lifecycle: the entry it journals, who writes it, the states it is taken from, the
 * state the next pass reads, and the guard its refusal asks.
 */
export const LifecycleVerb = Schema.Struct({
  verb: Schema.String.annotate({ description: 'The verb, as a person writes it.' }),
  entry: Schema.String.annotate({ description: 'The entry it journals.' }),
  by: Schema.Literal('person').annotate({ description: 'Who writes it: a person.' }),
  from: List(State).annotate({ description: 'The states it is taken from.' }),
  to: State.annotate({ description: 'The state the next pass reads.' }),
  guard: Schema.String.annotate({ description: 'The guard its refusal asks.' }),
});
export type LifecycleVerb = typeof LifecycleVerb.Type;

/** The lifecycle as data a page draws (`lifecycleGraph`, the runtime's): its first state, every state, the final ones, edges and verbs. */
export const LifecycleGraph = Schema.Struct({
  initial: State.annotate({ description: 'The first state of a task.' }),
  states: List(State).annotate({ description: 'Every state of the lifecycle.' }),
  final: List(State).annotate({ description: 'The states that end a task.' }),
  edges: List(LifecycleEdge).annotate({ description: 'Its edges, each from a state on an event to another.' }),
  verbs: List(LifecycleVerb).annotate({ description: 'The verbs a person writes to a task from outside the lifecycle.' }),
});
export type LifecycleGraph = typeof LifecycleGraph.Type;

/**
 * The path of one try of a step: its task (null for a step not filed yet, whose path is empty), the try's number counted from 1, the
 * task's path to the end of that try, and the lifecycle it walks, which the board draws it on.
 */
export const StepPath = Schema.Struct({
  taskId: Schema.NullOr(Schema.String).annotate({ description: "The try's task; null for a step not filed yet, whose path is empty." }),
  try: describedNumber("The try's number, from 1."),
  path: List(LifecycleTransition).annotate({
    description: "The task's path to the end of that try: each lifecycle state its journal says, the entry's kind and when.",
  }),
  lifecycle: LifecycleGraph.annotate({
    description: 'The lifecycle the path walks, which the board draws it on: its states, edges and verbs.',
  }),
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
  Schema.Struct({
    id: Schema.optionalKey(
      Schema.String.annotate({
        description: 'The cursor to resume from, which an EventSource sends back as Last-Event-ID; absent where the event has none.',
      }),
    ),
    event: Schema.Literal(event).annotate({ description: "The event's name." }),
    data: Schema.fromJsonString(data).pipe(Schema.annotateEncoded({ description: "The event's data, as JSON." })),
  });

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
const stepParams = {
  runId: Schema.String.annotate({ description: "The run's id, found among the runs the store lists in any namespace." }),
  step: Schema.String.annotate({ description: "The step's name." }),
};

/** A step's try, by its number as the path says it. */
const tryParams = { ...stepParams, try: Schema.String.annotate({ description: "The try's number, from 1." }) };

/** A file of a step's, by its path under the step's folder, encoded whole as one segment. */
const fileParams = {
  ...stepParams,
  file: Schema.String.annotate({
    description:
      "The file's path under the step's folder, encoded whole as one segment of the request's path, its `/` as `%2F` (`e2e%2Fbar.png`). One that climbs out (`..`), is absolute, or passes a link is refused.",
  }),
};

/**
 * The query of a read of a step's tries, a try or its closeout, each closeout read narrowly (`closeoutNarrowed`): `fields`, the fields of
 * the closeout's `output` to answer, comma-separated, as JSON:API's sparse fieldsets spell them, `*` for every one, an empty one naming
 * none; not given, the fields whose JSON is short (`SHORT_FIELD`), the rest named in `outputLeftOut`. And the page of its `body`:
 * `bodyFrom`, the character it starts at (0 where not given), and `bodyLimit`, how many it holds (`BODY_PAGE`), the answer's `bodyNext`
 * where more is left.
 */
const closeoutQuery = {
  fields: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The fields of the closeout's output to answer, comma-separated, * for every one, an empty one naming none; not given, the fields whose JSON is short.",
    }),
  ),
  bodyFrom: Schema.optionalKey(Schema.String.annotate({ description: 'The character the closeout body starts at; 0 where not given.' })),
  bodyLimit: Schema.optionalKey(Schema.String.annotate({ description: 'How many characters of the closeout body to answer.' })),
};

/**
 * The query of a read of a step's conversation: `after`, the cursor it reads on from; `limit`, the first events after it, or `last`, the
 * last ones (`TRANSCRIPT_PAGE`), never both; and `kinds`, the kinds of event to answer, comma-separated, every one where not given — the
 * cursor answered still counts every event, so a read without `kinds` from it misses none.
 */
const transcriptQuery = {
  after: Schema.optionalKey(Schema.String.annotate({ description: 'The cursor to read on from.' })),
  limit: Schema.optionalKey(
    Schema.String.annotate({ description: 'How many of the first events after the cursor to answer; never with last.' }),
  ),
  last: Schema.optionalKey(Schema.String.annotate({ description: 'How many of the last events to answer; never with limit.' })),
  kinds: Schema.optionalKey(
    Schema.String.annotate({ description: 'The kinds of event to answer, comma-separated; every one where not given.' }),
  ),
};

/**
 * The query of a read of a try's check's output: `stream`, the stream to read (stdout where not given); `from`, the line number to read on
 * from, or `last`, the last lines, never both; `limit`, how many lines from there (`CHECK_OUTPUT_PAGE`), never with `last`; and `match`,
 * a text the lines answered contain, compared case-insensitively, each line kept under its number in the stream.
 */
const checkOutputQuery = {
  stream: Schema.optionalKey(
    Schema.Literals(OUTPUT_STREAMS).annotate({ description: 'The stream to read, stdout or stderr; stdout where not given.' }),
  ),
  from: Schema.optionalKey(
    Schema.String.annotate({ description: "The line number to read on from, from 1, as a page's next says it; never with last." }),
  ),
  limit: Schema.optionalKey(Schema.String.annotate({ description: 'How many lines to answer from there; never with last.' })),
  last: Schema.optionalKey(Schema.String.annotate({ description: 'How many of the last lines to answer; never with from or limit.' })),
  match: Schema.optionalKey(
    Schema.String.annotate({
      description: 'A text the lines answered contain, as it is, compared case-insensitively; every line where not given.',
    }),
  ),
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
  }).annotate(
    OpenApi.Description,
    "Reads a run's step's tries, earliest first and the current one last, each with its task, where it stands, its attempts, check and closeout, the closeout's output narrowed to the fields asked. Answers StepTries.",
  ),
  HttpApiEndpoint.get('try', '/api/runs/:runId/steps/:step/tries/:try', {
    params: tryParams,
    query: closeoutQuery,
    success: StepTry,
    error: subResourceErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one try of a run's step whole: its round, its task, where it stands, its attempts, its check, its closeout or why that does not read, and a person's answer to it. Answers StepTry.",
  ),
  HttpApiEndpoint.get('closeout', '/api/runs/:runId/steps/:step/tries/:try/closeout', {
    params: tryParams,
    query: closeoutQuery,
    success: TryCloseout,
    error: subResourceErrors,
  }).annotate(
    OpenApi.Description,
    "Reads what one try of a run's step signed off with, its output narrowed to the fields asked and its body a page at a time, or why it does not read. Answers TryCloseout.",
  ),
  HttpApiEndpoint.get('checkOutput', '/api/runs/:runId/steps/:step/tries/:try/check/output', {
    params: tryParams,
    query: checkOutputQuery,
    success: CheckOutput,
    error: [...subResourceErrors, ReadFailed],
  }).annotate(
    OpenApi.Description,
    "Reads a page of what one try of a run's step's check printed on stdout or stderr, read whole from the runtime while the check runs and after it ended: the lines from a line number or the last ones, or only those containing a text, each under its number in the stream. Answers CheckOutput, with the line to read on from.",
  ),
  HttpApiEndpoint.get('told', '/api/runs/:runId/steps/:step/told', {
    params: stepParams,
    success: StepTold,
    error: subResourceErrors,
  }).annotate(
    OpenApi.Description,
    "Reads what a run's step was told: its own body in the workflow, its brief by layer, and its task by part. Answers StepTold.",
  ),
  HttpApiEndpoint.get('log', '/api/runs/:runId/steps/:step/log', {
    params: stepParams,
    query: { tail: Schema.optionalKey(Schema.String.annotate({ description: 'How many of its last lines to answer.' })) },
    success: StepLog,
    error: [Missing, Invalid, ReadFailed],
  }).annotate(
    OpenApi.Description,
    "Reads the end of a run's step's session output, its last lines as tail asks. Answers StepLog, with whether there were more.",
  ),
  HttpApiEndpoint.get('artifact', '/api/runs/:runId/steps/:step/artifacts/:file', {
    params: fileParams,
    success: StepFile,
    error: [BadRequest, Missing, Gone],
  }).annotate(
    OpenApi.Description,
    "Reads a file a run's step left in its files directory, at its top or in a folder beneath it, by its path there (encoded whole as one segment, its `/` as `%2F`), as the bytes on disk with the headers that serve an agent's file safely. Answers the file, or Gone where a prune removed it.",
  ),
  HttpApiEndpoint.get('file', '/api/runs/:runId/steps/:step/files/:file', {
    params: fileParams,
    success: StepFile,
    error: [BadRequest, Missing],
  }).annotate(
    OpenApi.Description,
    "Reads a file of a folder step's own folder, at its top or in a folder beneath it, by its path there (encoded whole as one segment, its `/` as `%2F`), as the bytes on disk with the headers that serve an agent's file safely. Answers the file.",
  ),
  HttpApiEndpoint.get('path', '/api/runs/:runId/steps/:step/path', {
    params: stepParams,
    query: { try: Schema.optionalKey(Schema.String.annotate({ description: "The try's number, from 1; the latest where not given." })) },
    success: StepPath,
    error: engineReadErrors,
  }).annotate(
    OpenApi.Description,
    "Reads the path one try of a run's step walked through the runtime's lifecycle, the latest try where none is asked. Answers StepPath: its task, the task's path and the lifecycle it walks.",
  ),
  HttpApiEndpoint.get('transcript', '/api/runs/:runId/steps/:step/transcript', {
    params: stepParams,
    query: transcriptQuery,
    success: StepTranscript,
    error: [...engineReadErrors, Invalid],
  }).annotate(
    OpenApi.Description,
    "Reads a page of a run's step's conversation from a cursor, the first or the last events after it, of the kinds asked. Answers StepTranscript: the events, the cursor to read on from, and whether the task still runs or may say more.",
  ),
  HttpApiEndpoint.get('transcriptStream', '/api/runs/:runId/steps/:step/transcript/stream', {
    params: stepParams,
    query: { after: Schema.optionalKey(Schema.String.annotate({ description: 'The cursor to stream on from.' })) },
    headers: {
      'last-event-id': Schema.optionalKey(
        Schema.String.annotate({ description: 'The id of the last event received, which an EventSource sends back when it reconnects.' }),
      ),
    },
    success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamSse({ events: StepStreamEvent }), {
      /** Never kept by a proxy between: each event is said once. */
      'cache-control': Schema.Literal('no-cache'),
    }),
    error: [...engineReadErrors, Invalid],
  }).annotate(
    OpenApi.Description,
    "Follows a run's step's conversation from a cursor as server-sent events, each event said once as it is written. Answers a stream of StepStreamEvent; a refused cursor or a lost task is refused before the stream opens.",
  ),
) {}
