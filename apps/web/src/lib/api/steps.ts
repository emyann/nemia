/**
 * A step's conversation, read and followed (`/api/runs/:id/steps/:step/transcript`), and its task's path through the runtime's lifecycle
 * (`/api/runs/:id/steps/:step/path`), both in apps/api/src/steps/steps.ts, each type with the schema `get` decodes it with.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';

/**
 * Mirrors `TranscriptEvent` in packages/agent-runtime/src/runner.ts, as the api passes it on: one thing said in a session's
 * conversation. A `tool_result` carries its call's `id`, so an event is unique by `id` and `kind` together. A tool's `input` is absent
 * where the harness recorded the call without one (Claude Code's `input` is optional).
 */
export type TranscriptEvent = {
  id: string;
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input?: unknown };
  result?: { text: string; isError: boolean };
};

/** Decodes a `TranscriptEvent`: a tool's input is read as it came. */
const TranscriptEventSchema = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  role: Schema.Literals(['assistant', 'user', 'system']),
  kind: Schema.Literals(['text', 'thinking', 'tool_use', 'tool_result', 'system']),
  text: Schema.optionalKey(Schema.String),
  tool: Schema.optionalKey(Schema.Struct({ name: Schema.String, input: Schema.optionalKey(Schema.Unknown) })),
  result: Schema.optionalKey(Schema.Struct({ text: Schema.String, isError: Schema.Boolean })),
}) satisfies Schema.Schema<TranscriptEvent>;

/**
 * Mirrors `StepTranscript` in apps/api/src/steps/steps.ts: the events from a cursor, the cursor to ask again from, and whether more may
 * come.
 */
export type StepTranscript = { events: TranscriptEvent[]; cursor: string | null; live: boolean };

/** Decodes a `StepTranscript`. */
const StepTranscriptSchema = Schema.Struct({
  events: Schema.mutable(Schema.Array(TranscriptEventSchema)),
  cursor: Schema.NullOr(Schema.String),
  live: Schema.Boolean,
}) satisfies Schema.Schema<StepTranscript>;

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** One read of a step's conversation, from the start. */
export const readTranscript = (runId: string, step: string, signal?: AbortSignal) =>
  get(transcriptPath(runId, step), StepTranscriptSchema, { signal });

/** Mirrors the runtime's `LifecycleStep`: the lifecycle state a task's journal says once an entry is on it, the entry's kind and its `at`. */
export type LifecycleStep = { state: string; event: string; at: string };

/** Decodes a `LifecycleStep`. */
const LifecycleStepSchema = Schema.Struct({
  state: Schema.String,
  event: Schema.String,
  at: Schema.String,
}) satisfies Schema.Schema<LifecycleStep>;

/** Mirrors `StepPath` in apps/api/src/steps/path.ts: a try's task, the try's number, and the task's path to the end of that try. */
export type StepPath = { taskId: string | null; try: number; path: LifecycleStep[] };

/** Decodes a `StepPath`. */
const StepPathSchema = Schema.Struct({
  taskId: Schema.NullOr(Schema.String),
  try: Schema.Number,
  path: Schema.mutable(Schema.Array(LifecycleStepSchema)),
}) satisfies Schema.Schema<StepPath>;

/**
 * The path of a step's try: the current one for a `tryNumber` of null, keyed by `stamp` (`pathStamp`), so the feed's `step` event, which
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
