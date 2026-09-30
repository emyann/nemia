/**
 * A step's conversation, read and followed (`/api/runs/:id/steps/:step/transcript`), and its task's path through the runtime's lifecycle
 * (`/api/runs/:id/steps/:step/path`), both in apps/api/src/steps/steps.ts.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { getUndecoded } from './read.ts';

/**
 * Mirrors `TranscriptEvent` in packages/agent-runtime/src/runner.ts, as the api passes it on: one thing said in a session's
 * conversation. A `tool_result` carries its call's `id`, so an event is unique by `id` and `kind` together.
 */
export type TranscriptEvent = {
  id: string;
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
};

/**
 * Mirrors `StepTranscript` in apps/api/src/steps/steps.ts: the events from a cursor, the cursor to ask again from, and whether more may
 * come.
 */
export type StepTranscript = { events: TranscriptEvent[]; cursor: string | null; live: boolean };

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** One read of a step's conversation, from the start. */
export const readTranscript = (runId: string, step: string, signal?: AbortSignal) =>
  getUndecoded<StepTranscript>(transcriptPath(runId, step), { signal });

/** Mirrors the runtime's `LifecycleStep`: the lifecycle state a task's journal says once an entry is on it, the entry's kind and its `at`. */
export type LifecycleStep = { state: string; event: string; at: string };

/** Mirrors `StepPath` in apps/api/src/steps/path.ts: a try's task, the try's number, and the task's path to the end of that try. */
export type StepPath = { taskId: string | null; try: number; path: LifecycleStep[] };

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
      getUndecoded<StepPath>(
        `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/path${tryNumber === null ? '' : `?try=${tryNumber}`}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: tryNumber === null ? 0 : Infinity,
    refetchInterval: (query) => poll(query.state.data),
  });
