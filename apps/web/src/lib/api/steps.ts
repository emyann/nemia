/**
 * A step's conversation, read and followed (`/api/runs/:id/steps/:step/transcript`), and its task's path through the runtime's lifecycle
 * (`/api/runs/:id/steps/:step/path`), both in apps/api/src/steps/steps.ts, each type with the schema `get` decodes it with.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { SAID_AFTER, type SaidAfter } from 'objects';
import { decodes } from './decodes.ts';
import { get } from './read.ts';
import { UnreadableSchema, type StreamUnreadable } from './stream.ts';

/**
 * Mirrors `TranscriptEvent` in agent-runtime, as the api passes it on: one thing said in a session's conversation, its `kind` one of
 * `objects`' `SAID_AFTER`. A `tool_result` carries its call's `id`, so an event is unique by `id` and `kind` together. A tool's `input` is
 * absent where the harness recorded the call without one (Claude Code's `input` is optional).
 */
export type TranscriptEvent = {
  id: string;
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: SaidAfter;
  text?: string;
  tool?: { name: string; input?: unknown };
  result?: { text: string; isError: boolean };
  /**
   * Where a `user` event's words came from, as the harness said it: `human` where a person wrote them into the session itself, one of the
   * Agent SDK's other words for an origin, or `unknown` for a word it has not named.
   */
  origin?: { kind: TranscriptOriginKind };
};

/** The words of a transcript event's origin, the runtime's `ORIGIN_KINDS` and `unknown`. */
const ORIGIN_KINDS = [
  'human',
  'channel',
  'peer',
  'task-notification',
  'coordinator',
  'unclassified',
  'observer',
  'auto-continuation',
  'observer-activity',
  'unknown',
] as const;
export type TranscriptOriginKind = (typeof ORIGIN_KINDS)[number];

/** Decodes a `TranscriptEvent`: a tool's input is read as it came. */
const TranscriptEventSchema = decodes<TranscriptEvent>()(
  Schema.Struct({
    id: Schema.String,
    at: Schema.String,
    role: Schema.Literals(['assistant', 'user', 'system']),
    kind: Schema.Literals(SAID_AFTER),
    text: Schema.optionalKey(Schema.String),
    tool: Schema.optionalKey(Schema.Struct({ name: Schema.String, input: Schema.optionalKey(Schema.Unknown) })),
    result: Schema.optionalKey(Schema.Struct({ text: Schema.String, isError: Schema.Boolean })),
    origin: Schema.optionalKey(Schema.Struct({ kind: Schema.Literals(ORIGIN_KINDS) })),
  }),
);

/**
 * Mirrors `StepTranscript` in apps/api/src/steps/steps.ts: the events from a cursor, the cursor to ask again from, whether something of
 * the task runs or is to (`live`), and whether it may yet say more — a task that has not settled, one held on a person's word among them
 * (`open`).
 */
export type StepTranscript = { events: TranscriptEvent[]; cursor: string | null; live: boolean; open: boolean };

/** Decodes a `StepTranscript`. */
const StepTranscriptSchema = decodes<StepTranscript>()(
  Schema.Struct({
    events: Schema.mutable(Schema.Array(TranscriptEventSchema)),
    cursor: Schema.NullOr(Schema.String),
    live: Schema.Boolean,
    open: Schema.Boolean,
  }),
);

/** A piece of the message being written: its text block's `key`, the text added (`delta`), and whether the block is now whole (`last`). */
export type StreamPartial = { key: string; delta: string; last: boolean };

/** The data of each event a step's stream sends that the board reads, by the event's name. */
export type StreamData = {
  transcript: TranscriptEvent;
  partial: StreamPartial;
  moved: { taskId: string };
  following: { streamed: boolean };
  unreadable: StreamUnreadable;
};

/** Decodes the data of each event of `StreamData`, by its name, for `streamDataOf` (`stream.ts`). */
export const STEP_STREAM_SCHEMAS: { readonly [K in keyof StreamData]: Schema.Decoder<StreamData[K]> } = {
  transcript: TranscriptEventSchema,
  partial: decodes<StreamPartial>()(Schema.Struct({ key: Schema.String, delta: Schema.String, last: Schema.Boolean })),
  moved: decodes<StreamData['moved']>()(Schema.Struct({ taskId: Schema.String })),
  following: decodes<StreamData['following']>()(Schema.Struct({ streamed: Schema.Boolean })),
  unreadable: UnreadableSchema,
};

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** One read of a step's conversation, from the start. */
export const readTranscript = (runId: string, step: string, signal?: AbortSignal) =>
  get(transcriptPath(runId, step), StepTranscriptSchema, { signal });

/**
 * Mirrors the runtime's `LifecycleTransition`: the lifecycle state a task's journal says once an entry is on it, the entry's kind and its
 * `at`.
 */
export type LifecycleTransition = { state: string; event: string; at: string };

/** Decodes a `LifecycleTransition`. */
const LifecycleTransitionSchema = decodes<LifecycleTransition>()(
  Schema.Struct({
    state: Schema.String,
    event: Schema.String,
    at: Schema.String,
  }),
);

/** Mirrors the runtime's `LifecycleEdge`: one edge, where it leaves from, on what event, under which guard, to where, doing what. */
export type MachineEdge = { from: string; event: string; guard?: string; to: string; action: string };

/** Decodes a `MachineEdge`: an edge under no guard has no `guard`. */
const MachineEdgeSchema = decodes<MachineEdge>()(
  Schema.Struct({
    from: Schema.String,
    event: Schema.String,
    guard: Schema.optionalKey(Schema.String),
    to: Schema.String,
    action: Schema.String,
  }),
);

/**
 * Mirrors the runtime's `LifecycleVerb`: a verb a person writes from outside the machine, the entry it journals, who writes it, the
 * states it is taken from, the state the next pass reads, and the guard its refusal asks first.
 */
export type MachineVerb = { verb: string; entry: string; by: string; from: string[]; to: string; guard: string };

/** Decodes a `MachineVerb`. */
const MachineVerbSchema = decodes<MachineVerb>()(
  Schema.Struct({
    verb: Schema.String,
    entry: Schema.String,
    by: Schema.String,
    from: Schema.mutable(Schema.Array(Schema.String)),
    to: Schema.String,
    guard: Schema.String,
  }),
);

/**
 * Mirrors the orchestrator's `LifecycleGraph`, as the api carries it on a step's path: the lifecycle's first state, every state, the
 * final ones, every edge, and every verb written from outside it.
 */
export type MachineGraph = {
  initial: string;
  states: string[];
  final: string[];
  edges: MachineEdge[];
  verbs: MachineVerb[];
};

/** Decodes a `MachineGraph`. */
const MachineGraphSchema = decodes<MachineGraph>()(
  Schema.Struct({
    initial: Schema.String,
    states: Schema.mutable(Schema.Array(Schema.String)),
    final: Schema.mutable(Schema.Array(Schema.String)),
    edges: Schema.mutable(Schema.Array(MachineEdgeSchema)),
    verbs: Schema.mutable(Schema.Array(MachineVerbSchema)),
  }),
);

/**
 * Mirrors `StepPath` in apps/api/src/steps/path.ts: a try's task, the try's number, the task's path to the end of that try, and the
 * lifecycle it walks, which the Debug panel draws it on.
 */
export type StepPath = { taskId: string | null; try: number; path: LifecycleTransition[]; lifecycle: MachineGraph };

/** Decodes a `StepPath`. */
const StepPathSchema = decodes<StepPath>()(
  Schema.Struct({
    taskId: Schema.NullOr(Schema.String),
    try: Schema.Number,
    path: Schema.mutable(Schema.Array(LifecycleTransitionSchema)),
    lifecycle: MachineGraphSchema,
  }),
);

/**
 * The path of a step's try: the current one for a `tryNumber` of null, keyed by `stamp` (`stepStamp`), so the feed's `step` event, which
 * reads the run's record again, reads it again once the step moved; an earlier one by its number, which never moves. The current try's
 * is read again as `poll` answers for the path last read (`pathPoll`), and while another is read the path last read stays on the page.
 */
export const stepPathQuery = (
  runId: string,
  step: string,
  stamp: string,
  tryNumber: number | null,
  poll: (read: StepPath | undefined) => number | false,
) =>
  queryOptions({
    queryKey: ['runs', runId, 'path', step, tryNumber ?? 'current', ...(tryNumber === null ? [stamp] : [])],
    queryFn: () =>
      get(
        `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/path${tryNumber === null ? '' : `?try=${tryNumber}`}`,
        StepPathSchema,
      ),
    placeholderData: keepPreviousData,
    staleTime: tryNumber === null ? 0 : Infinity,
    refetchInterval: (query) => poll(query.state.data),
  });
