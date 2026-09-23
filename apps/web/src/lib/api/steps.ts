/** A step's conversation, read and followed (`/api/runs/:id/steps/:step/transcript`, apps/api/src/steps.ts). */
import { get } from './read.ts';

/**
 * Mirrors `TranscriptEvent` in packages/agent-engine/src/runner.ts, as the api passes it on: one thing said in a session's
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

/** Mirrors `StepTranscript` in apps/api/src/steps.ts: the events from a cursor, the cursor to ask again from, and whether more may come. */
export type StepTranscript = { events: TranscriptEvent[]; cursor: string | null; live: boolean };

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** One read of a step's conversation, from the start. */
export const readTranscript = (runId: string, step: string, signal?: AbortSignal) =>
  get<StepTranscript>(transcriptPath(runId, step), { signal });
