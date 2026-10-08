/**
 * A remote A2A agent's session followed live, and its conversation read: the remote harness's `follow` and `transcript`
 * (`a2a/remote.ts`), over the Task the agent made of the session's message.
 *
 * **A follow** asks the agent for the Task's own stream (`SubscribeToTask`), where its card says it streams, and gives each answer
 * as the moments it carries (`followedOfRemote`), each event once. A card that does not say so refuses the follow, and the session's
 * transcript is read again instead. The subscription's headers are bounded as any request is, its body by nothing (`follows`).
 *
 * A subscription that ends or fails before the turn is over is dropped: the Task is read whole (GetTask), which gives what the drop
 * missed, and subscribed to again. After `RESUBSCRIBES` drops in a row, none giving anything new, the follow fails as a refusal, in
 * words that say the transcript is read again: nothing is lost, since a reader reads it from the cursor it holds. A subscription
 * that says nothing for `QUIET_MS` is read whole and subscribed to again, as a drop is, without counting as one: an agent may work
 * that long in silence.
 */
import { Effect, Schedule, Schema, Stream } from 'effect';
import type { StreamResponse, Task } from '@a2a-js/sdk';
import { TaskNotFoundError } from '@a2a-js/sdk/errors';
import { RunnerError, type Followed, type Transcript, type TranscriptCursor, type TranscriptEvent } from '../harness/index.ts';
import type { Entry } from './entry.ts';
import { followedOfRemote, relayOf, relayOver, remoteCursorOf, transcriptOfTask } from './remote-events.ts';
import type { Connection } from './remote-client.ts';
import { wordsOf } from './said.ts';

/** How long a subscription may say nothing before the Task is read whole and subscribed to again. */
export const QUIET_MS = 60_000;

/** How many subscriptions in a row may drop, none giving anything new, before the follow leaves the session to be read again. */
export const RESUBSCRIBES = 5;

/** The first wait before a dropped subscription is made again, doubled at each drop in a row. */
export const RESUBSCRIBE_MS = 500;

/** How often a follow reads the entry of a session whose message is still being sent. */
const SENDING_POLL = '1 second';

/** A subscription that ended or failed before the turn was over, in words naming why. */
class Dropped extends Schema.TaggedError<Dropped>()('Dropped', { message: Schema.String }) {}

/**
 * What a follow and a read of the conversation need of the remote harness: its name, the entry of a session by its name (`entryOf`,
 * open or let go of) or by its id (`bySession`), whether a send is still under way (`sendingLive`), the connection, and the bounds of
 * a subscription (`quietMs`, `resubscribeMs`).
 */
export type FollowDeps = {
  harness: string;
  entryOf: (name: string) => Entry | undefined;
  bySession: (sessionId: string) => Entry | undefined;
  sendingLive: (e: Entry) => boolean;
  connection: Connection;
  quietMs: number;
  resubscribeMs: number;
};

const refusal = (message: string) => new RunnerError({ verb: 'follow', message, refused: true });

/**
 * `answers` whose `return` aborts `stop` before it asks the stream to end: an async generator's `return` waits behind the `next`
 * still pending, which a silent subscription never settles until its request is aborted.
 */
const abortedOnReturn = (answers: AsyncIterable<StreamResponse>, stop: AbortController): AsyncIterable<StreamResponse> => ({
  [Symbol.asyncIterator]: () => {
    const it = answers[Symbol.asyncIterator]();
    return {
      next: () => it.next(),
      return: async (value?: unknown) => {
        stop.abort();
        return (await it.return?.(value)) ?? { done: true, value: undefined };
      },
    };
  },
});

/** The Task `taskId` read whole, its history in full; `undefined` when the agent no longer has it. */
const taskRead = async (d: FollowDeps, taskId: string): Promise<Task | undefined> => {
  try {
    return await d.connection.ask((c) => c.getTask({ tenant: '', id: taskId, historyLength: undefined }));
  } catch (e) {
    if (e instanceof TaskNotFoundError) return undefined;
    throw e;
  }
};

/**
 * The Task `taskId` followed for the session `e`, from the moments a follow has given (`given`: none when the follow begins on it, so
 * the first Task it reads is the transcript's). Each round reads the Task whole, but the first, then subscribes; a round ends once
 * the turn is over or the agent no longer has the Task, and is dropped otherwise. Drops are counted in a row (`drops`): a subscription
 * that gives something new starts the count again, the Task read after a drop does not.
 */
const followTask = (d: FollowDeps, e: Entry, taskId: string, given: boolean): Stream.Stream<Followed, RunnerError> => {
  const relay = relayOf(e.sentAt, e.whole ?? 0);
  let fresh = !given;
  let gone = false;
  let rounds = 0;
  let drops = 0;
  const said = (answer: StreamResponse): Followed[] => {
    const moments = followedOfRemote(relay, answer, fresh);
    fresh = false;
    return moments;
  };
  const dropped = (cause: unknown) => new Dropped({ message: wordsOf(cause) });
  const over = Stream.suspend(() =>
    relayOver(relay) || gone ? Stream.empty : Stream.fail(new Dropped({ message: 'its stream ended before the turn was over' })),
  );
  const reconciled: Stream.Stream<Followed[], Dropped> = Stream.fromEffect(
    Effect.tryPromise({ try: () => taskRead(d, taskId), catch: dropped }),
  ).pipe(
    Stream.map((t) => {
      if (!t) gone = true;
      return t ? said({ payload: { $case: 'task', value: t } }) : [];
    }),
  );
  const subscribed = (): Stream.Stream<Followed[], Dropped> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const stop = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (c) => Effect.sync(() => c.abort()),
        );
        d.connection.follows.add(stop.signal);
        const client = yield* Effect.tryPromise({ try: () => d.connection.ask(async (c) => c), catch: dropped });
        const answers = client.resubscribeTask({ tenant: '', id: taskId }, { signal: stop.signal });
        return Stream.fromAsyncIterable(abortedOnReturn(answers, stop), (cause) => cause);
      }),
    ).pipe(
      Stream.catch((cause) => {
        if (cause instanceof TaskNotFoundError) gone = true;
        return cause instanceof TaskNotFoundError ? Stream.empty : Stream.fail(dropped(cause));
      }),
      Stream.map((answer) => {
        const moments = said(answer);
        if (moments.length > 0) drops = 0;
        return moments;
      }),
      Stream.timeoutOrElse({ duration: d.quietMs, orElse: () => round(false) }),
    );
  const round = (first: boolean): Stream.Stream<Followed[], Dropped> =>
    Stream.concat(
      first ? Stream.empty : reconciled,
      Stream.suspend(() => (relayOver(relay) || gone ? Stream.empty : Stream.concat(subscribed(), over))),
    );
  return Stream.suspend(() => round(rounds++ === 0)).pipe(
    Stream.filter((moments) => moments.length > 0),
    Stream.tapError(() => Effect.sync(() => drops++)),
    Stream.retry(Schedule.exponential(d.resubscribeMs).pipe(Schedule.while(() => drops <= RESUBSCRIBES))),
    Stream.flattenIterable,
    Stream.catchTag('Dropped', (cause) =>
      Stream.fail(
        refusal(
          `the \`${d.harness}\` agent's stream of \`${taskId}\` dropped, and ${RESUBSCRIBES} subscriptions again in a row gave nothing new (${cause.message}): its transcript is read again every second instead.`,
        ),
      ),
    ),
  );
};

/** The agent's answer to the session `e` where it made no Task: its words as one event, and where a read of it ends. */
const replyOf = (e: Entry & { reply: string }): { events: TranscriptEvent[]; cursor: TranscriptCursor } => ({
  events: [{ id: `reply:${e.messageId}`, at: e.sentAt, role: 'assistant', kind: 'text', text: e.reply }],
  cursor: remoteCursorOf(e.messageId, 1),
});

/**
 * The session `e` followed once its send has an answer: a reply as its words then its state, a send refused as its state, and a Task
 * followed, the follow already begun on it.
 */
const followAnswered = (d: FollowDeps, e: Entry): Stream.Stream<Followed, RunnerError> => {
  if (e.reply !== undefined)
    return Stream.fromIterable<Followed>([
      { kind: 'events', ...replyOf({ ...e, reply: e.reply }) },
      { kind: 'state', state: e.seen?.state ?? 'completed' },
    ]);
  if (e.ended && e.seen) return Stream.succeed<Followed>({ kind: 'state', state: e.seen.state });
  return e.taskId === undefined ? Stream.empty : followTask(d, e, e.taskId, true);
};

/** The session `name`'s entry once its send has an answer, read every second while it is under way; `undefined` once it has none. */
const answered = (d: FollowDeps, name: string): Effect.Effect<Entry | undefined> =>
  Effect.sync(() => d.entryOf(name)).pipe(
    Effect.repeat({ schedule: Schedule.spaced(SENDING_POLL), until: (e) => !e || e.taskId !== undefined || !d.sendingLive(e) }),
    Effect.map((e) => (e?.taskId === undefined ? undefined : e)),
  );

/**
 * The remote harness's `follow`: the session `name` followed live, its state first. Refused, in this order, where no session goes by
 * the name, where the agent's card cannot be read or does not say it streams, and where the send is in doubt. A session that has
 * ended gives its state alone; one still being sent is `submitted` until its Task is known, then followed.
 */
export const remoteFollowOf =
  (d: FollowDeps) =>
  (name: string): Stream.Stream<Followed, RunnerError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const e = d.entryOf(name);
        if (!e)
          return yield* Effect.fail(refusal(`no session goes by \`${name}\` on the \`${d.harness}\` harness: follow it once it is sent.`));
        const { card } = yield* Effect.tryPromise({
          try: () => d.connection.client(),
          catch: (cause) =>
            refusal(
              `the \`${d.harness}\` agent's card could not be read (${wordsOf(cause)}): its transcript is read again every second instead.`,
            ),
        });
        if (card.capabilities?.streaming !== true)
          return yield* Effect.fail(
            refusal(`the \`${d.harness}\` agent's card does not say it streams: its transcript is read again every second instead.`),
          );
        if (e.ended && e.seen) return Stream.succeed<Followed>({ kind: 'state', state: e.seen.state });
        if (e.taskId !== undefined) return followTask(d, e, e.taskId, false);
        if (!d.sendingLive(e))
          return yield* Effect.fail(
            refusal(
              `the send of \`${name}\` to the \`${d.harness}\` agent is in doubt: there is no Task to follow, and \`logs\` says why.`,
            ),
          );
        const later = Stream.unwrap(answered(d, name).pipe(Effect.map((a) => (a ? followAnswered(d, a) : Stream.empty))));
        return Stream.concat(Stream.succeed<Followed>({ kind: 'state', state: 'submitted' }), later);
      }),
    );

/**
 * The conversation of the session `e` from `after` on, read off the Task `taskId`, none where it has none: `remoteTranscriptOf`'s and
 * `remoteTranscriptByName`'s.
 */
const transcriptOfEntry = async (
  d: FollowDeps,
  e: Entry | undefined,
  taskId: string | undefined,
  after?: TranscriptCursor,
): Promise<Transcript> => {
  const none: Transcript = { events: [], cursor: after ?? remoteCursorOf('', 0) };
  if (e?.reply !== undefined) {
    const reply = replyOf({ ...e, reply: e.reply });
    return after === reply.cursor ? { events: [], cursor: reply.cursor } : reply;
  }
  const task = taskId === undefined ? undefined : await taskRead(d, taskId);
  return task ? transcriptOfTask(task, e?.sentAt ?? task.status?.timestamp ?? '', e?.whole ?? 0, after) : none;
};

/**
 * The remote harness's `transcript`: the conversation of the session `sessionId` from `after` on (`transcriptOfTask`). A reply is
 * one event, the agent's words; a session with no Task — sent, refused or in doubt — and a Task the agent no longer has say nothing.
 */
export const remoteTranscriptOf =
  (d: FollowDeps) =>
  (sessionId: string, after?: TranscriptCursor): Promise<Transcript> => {
    const e = d.bySession(sessionId);
    return transcriptOfEntry(d, e, e ? e.taskId : sessionId, after);
  };

/** The remote harness's `transcriptOf`: `remoteTranscriptOf`'s read of the session `name`; `null` when no session goes by it. */
export const remoteTranscriptByName =
  (d: FollowDeps) =>
  async (name: string, after?: TranscriptCursor): Promise<Transcript | null> => {
    const e = d.entryOf(name);
    return e ? transcriptOfEntry(d, e, e.taskId, after) : null;
  };
