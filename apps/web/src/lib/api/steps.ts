/**
 * A step's conversation, read and followed (`/api/runs/:runId/steps/:step/transcript`), and its task's path through the runtime's
 * lifecycle (`/api/runs/:runId/steps/:step/path`), read through the objects' client as `objects` says them (`StepTranscript`,
 * `TranscriptEvent`, `StepPath`, `LifecycleGraph`); the conversation is followed as server-sent events of the same path.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { Schema } from 'effect';
import {
  StepPath as StepPathAnswer,
  StepStreamEvent,
  StepTranscript as StepTranscriptAnswer,
  TRANSCRIPT_PAGE,
  type StepTranscript,
  type LifecycleEdge,
  type LifecycleTransition as LifecycleTransitionAnswer,
  type LifecycleVerb,
} from 'objects';
import { call, read } from './objects.ts';

export type { StepTranscript, TranscriptEvent } from 'objects';

/**
 * One edge of the runtime's lifecycle (`objects`' `LifecycleEdge`), its states widened to words: the board draws a machine's states and
 * never branches on them, so its drawing (`lib/machine.ts`) takes any machine's.
 */
export type MachineEdge = Omit<LifecycleEdge, 'from' | 'to'> & { from: string; to: string };

/** A verb a person asks of a task (`objects`' `LifecycleVerb`), its states and its asker widened to words. */
export type MachineVerb = Omit<LifecycleVerb, 'from' | 'to' | 'by'> & { from: readonly string[]; to: string; by: string };

/** A move of a task along the lifecycle (`objects`' `LifecycleTransition`), its state widened to a word. */
export type LifecycleTransition = Omit<LifecycleTransitionAnswer, 'state'> & { state: string };

/** A step's task's path through the lifecycle, and the lifecycle (`objects`' `StepPath`), its states widened to words. */
export type StepPath = Omit<typeof StepPathAnswer.Type, 'path' | 'lifecycle'> & {
  path: readonly LifecycleTransition[];
  lifecycle: MachineGraph;
};

/** The runtime's lifecycle, as its machine draws itself (`objects`' `LifecycleGraph`), its states widened to words. */
export type MachineGraph = {
  initial: string;
  states: readonly string[];
  final: readonly string[];
  edges: readonly MachineEdge[];
  verbs: readonly MachineVerb[];
};

/** The members of a step's stream as `objects` declares it, each `{ event, data }`, its data the JSON of its schema. */
const [FOLLOWING, TRANSCRIPT, PARTIAL, MOVED, , UNREADABLE] = StepStreamEvent.members;

/** A piece of the message being written: its text block's `key`, the text added (`delta`), and whether the block is now whole (`last`). */
export type StreamPartial = typeof PARTIAL.fields.data.to.Type;

/** The data of each event a step's stream sends that the board reads, by the event's name. */
export type StreamData = {
  transcript: typeof TRANSCRIPT.fields.data.to.Type;
  partial: StreamPartial;
  moved: typeof MOVED.fields.data.to.Type;
  following: typeof FOLLOWING.fields.data.to.Type;
  unreadable: typeof UNREADABLE.fields.data.to.Type;
};

/** Decodes the data of each event of `StreamData`, by its name, for `streamDataOf` (`stream.ts`): `objects`' own schema of each. */
export const STEP_STREAM_SCHEMAS: { readonly [K in keyof StreamData]: Schema.Decoder<StreamData[K]> } = {
  transcript: TRANSCRIPT.fields.data.to,
  partial: PARTIAL.fields.data.to,
  moved: MOVED.fields.data.to,
  following: FOLLOWING.fields.data.to,
  unreadable: UNREADABLE.fields.data.to,
};

/** Where a step's conversation is read, and — with `/stream` after it — followed as server-sent events. */
export const transcriptPath = (runId: string, step: string) =>
  `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/transcript`;

/** A page of a step's conversation, of the most a page holds, from `after` (the cursor a page before answered), the start for none. */
const transcriptPage = (runId: string, step: string, after: string | undefined, signal?: AbortSignal) =>
  call(
    (c) =>
      c.steps.transcript({
        params: { runId, step },
        query: { limit: String(TRANSCRIPT_PAGE.most), ...(after === undefined ? {} : { after }) },
      }),
    read(StepTranscriptAnswer),
    signal,
  );

/**
 * One read of a step's conversation, from the start, whole: the api answers a page of it and says `more` where events already said are
 * left after it, so the read goes on at once from each page's `cursor` while it says so, before the page follows the stream from the last
 * cursor. Every page's events in order, and the last page's cursor, `live` and `open`. A page that says `more` and answers back the cursor
 * it was asked from is an api that would be asked forever, refused naming the restart.
 */
export async function readTranscript(runId: string, step: string, signal?: AbortSignal): Promise<StepTranscript> {
  let page = await transcriptPage(runId, step, undefined, signal);
  const events = [...page.events];
  while (page.more === true && page.cursor !== null) {
    const from = page.cursor;
    page = await transcriptPage(runId, step, from, signal);
    events.push(...page.events);
    if (page.more === true && page.cursor === from)
      throw new Error('The api answered a page of the conversation from the cursor it was asked from: restart the api (npm run dev).');
  }
  return { ...page, events };
}

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
      call(
        (c) => c.steps.path({ params: { runId, step }, query: tryNumber === null ? {} : { try: String(tryNumber) } }),
        read(StepPathAnswer),
      ),
    placeholderData: keepPreviousData,
    staleTime: tryNumber === null ? 0 : Infinity,
    refetchInterval: (query) => poll(query.state.data),
  });
