/**
 * A remote A2A agent's session followed live, and its conversation read: the remote harness's `follow` and `transcript`
 * (`a2a/remote.ts`), over the Task the agent made of the session's message.
 *
 * **A follow** asks the agent for the Task's own stream (`SubscribeToTask`), where its card says it streams, and gives each answer
 * as the moments it carries (`followedOfRemote`), each event once. Where the card does not say so, the follow reads the Task whole
 * (GetTask) every `READ_EVERY_MS` instead, and gives what each read has new: whole events and states, and the text of an artifact
 * so far as a piece. The subscription's headers are bounded as any request is, its body by nothing (`follows`).
 *
 * A subscription that ends or fails before the turn is over is dropped: the Task is read whole, which gives what the drop missed, and
 * subscribed to again. After `RESUBSCRIBES` drops in a row, none giving anything new, the follow reads the Task every `READ_EVERY_MS`,
 * as for a card that does not stream. A read that fails is made again; after `RESUBSCRIBES` in a row the follow fails as a refusal,
 * in words saying the session cannot be followed and that a read of its transcript gives what is new: nothing is lost, since a reader
 * reads it from the cursor it holds. A subscription that says nothing for `QUIET_MS` is read whole and subscribed to again, as a drop
 * is, without counting as one: an agent may work that long in silence.
 */
import { Effect, Schedule, Schema, Stream } from 'effect';
import type { StreamResponse, Task } from '@a2a-js/sdk';
import { TaskNotFoundError } from '@a2a-js/sdk/errors';
import { RunnerError, type Followed, type Transcript, type TranscriptCursor, type TranscriptEvent } from '../harness/index.ts';
import type { Entry } from './entry.ts';
import { followedOfRemote, relayOf, relayOver, remoteCursorOf, transcriptOfTask, type Relay } from './remote-events.ts';
import type { Connection } from './remote-client.ts';
import { wordsOf } from './said.ts';

/** How long a subscription may say nothing before the Task is read whole and subscribed to again. */
export const QUIET_MS = 60_000;

/** How many subscriptions in a row may drop, none giving anything new, before the follow leaves the session to be read again. */
export const RESUBSCRIBES = 5;

/** The first wait before a dropped subscription is made again, doubled at each drop in a row. */
export const RESUBSCRIBE_MS = 500;

/** How often a follow reads the Task whole where it does not subscribe: a card that does not stream, a stream that kept dropping. */
export const READ_EVERY_MS = 1_000;

/** How often a follow reads the entry of a session whose message is still being sent. */
const SENDING_POLL = '1 second';

/** A subscription that ended or failed before the turn was over, in words naming why. */
class Dropped extends Schema.TaggedError<Dropped>()('Dropped', { message: Schema.String }) {}

/**
 * What a follow and a read of the conversation need of the remote harness: its name, the entry of a session by its name (`entryOf`,
 * open or let go of) or by its id (`bySession`), whether a send is still under way (`sendingLive`), the connection, and the bounds of
 * a subscription (`quietMs`, `resubscribeMs`), and how often a Task is read where it is not subscribed to (`readEveryMs`).
 */
export type FollowDeps = {
  harness: string;
  entryOf: (name: string) => Entry | undefined;
  bySession: (sessionId: string) => Entry | undefined;
  sendingLive: (e: Entry) => boolean;
  connection: Connection;
  quietMs: number;
  resubscribeMs: number;
  readEveryMs: number;
};

/** The paces of a follow: each one given, or its default (`QUIET_MS`, `RESUBSCRIBE_MS`, `READ_EVERY_MS`). */
export const pacesOf = (o: Partial<Pick<FollowDeps, 'quietMs' | 'resubscribeMs' | 'readEveryMs'>>) => ({
  quietMs: o.quietMs ?? QUIET_MS,
  resubscribeMs: o.resubscribeMs ?? RESUBSCRIBE_MS,
  readEveryMs: o.readEveryMs ?? READ_EVERY_MS,
});

const refusal = (message: string) => new RunnerError({ verb: 'follow', message, refused: true });

/** The words that end a refusal of a session that cannot be followed: what is new is still read. */
const UNFOLLOWED = 'its session cannot be followed live, and a read of its transcript gives what is new.';

/** The refusal of a follow of the session `name`, whose send to the agent of `d` is in doubt. */
const inDoubt = (d: FollowDeps, name: string) =>
  refusal(`the send of \`${name}\` to the \`${d.harness}\` agent is in doubt: there is no Task to follow, and \`logs\` says why.`);

/**
 * `answers` whose `return` aborts `stop` before it asks the stream to end: an async generator's `return` waits behind the `next`
 * still pending, which a silent subscription never settles until its request is aborted.
 */
export const abortedOnReturn = (answers: AsyncIterable<StreamResponse>, stop: AbortController): AsyncIterable<StreamResponse> => ({
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
 * The Task `taskId` read whole every `readEveryMs`, the first read at once, each as `said` gives it, until the relay has given a state
 * that ends the turn or the agent no longer has the Task: a follow that does not subscribe. A read that fails gives nothing and is
 * made again; after `RESUBSCRIBES` in a row, the follow fails as a refusal naming the last failure.
 */
const readEvery = (
  d: FollowDeps,
  taskId: string,
  relay: Relay,
  said: (answer: StreamResponse) => Followed[],
): Stream.Stream<Followed, RunnerError> => {
  let fails = 0;
  let gone = false;
  const read: Effect.Effect<Followed[], RunnerError> = Effect.tryPromise({ try: () => taskRead(d, taskId), catch: (cause) => cause }).pipe(
    Effect.map((t) => {
      fails = 0;
      if (!t) gone = true;
      return t ? said({ payload: { $case: 'task', value: t } }) : [];
    }),
    Effect.catch((cause) =>
      ++fails > RESUBSCRIBES
        ? Effect.fail(
            refusal(
              `the \`${d.harness}\` agent's Task \`${taskId}\` could not be read ${fails} times in a row (${wordsOf(cause)}): ${UNFOLLOWED}`,
            ),
          )
        : Effect.succeed([]),
    ),
  );
  return Stream.fromEffectSchedule(read, Schedule.spaced(d.readEveryMs)).pipe(
    Stream.takeUntil(() => relayOver(relay) || gone),
    Stream.flattenIterable,
  );
};

/**
 * The Task `taskId` followed for the session `e`, from the moments a follow has given (`given`: none when the follow begins on it, so
 * the first Task it reads is the transcript's), subscribed to where the agent streams (`streams`) and read every `readEveryMs`
 * otherwise (`readEvery`). Each round reads the Task whole, but the first, then subscribes; a round ends once the turn is over or the
 * agent no longer has the Task, and is dropped otherwise. Drops are counted in a row (`drops`): a subscription that gives something
 * new starts the count again, the Task read after a drop does not. After `RESUBSCRIBES` in a row, the Task is read every
 * `readEveryMs` from where the follow stands.
 */
const followTask = (d: FollowDeps, e: Entry, taskId: string, given: boolean, streams: boolean): Stream.Stream<Followed, RunnerError> => {
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
  if (!streams) return readEvery(d, taskId, relay, said);
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
    Stream.catchTag('Dropped', () => readEvery(d, taskId, relay, said)),
  );
};

/** The agent's answer to the session `e` where it made no Task: its words as one event, and where a read of it ends. */
const replyOf = (e: Entry & { reply: string }): { events: TranscriptEvent[]; cursor: TranscriptCursor } => ({
  events: [{ id: `reply:${e.messageId}`, at: e.sentAt, role: 'assistant', kind: 'text', text: e.reply }],
  cursor: remoteCursorOf(e.messageId, 1),
});

/**
 * The session `e` followed once its send has an answer: a reply as its words then its state, a send refused as its state, and a Task
 * followed, the follow already begun on it, subscribed to where the agent streams (`streams`).
 */
const followAnswered = (d: FollowDeps, e: Entry, streams: boolean): Stream.Stream<Followed, RunnerError> => {
  if (e.reply !== undefined)
    return Stream.fromIterable<Followed>([
      { kind: 'events', ...replyOf({ ...e, reply: e.reply }) },
      { kind: 'state', state: e.seen?.state ?? 'completed' },
    ]);
  if (e.ended && e.seen) return Stream.succeed<Followed>({ kind: 'state', state: e.seen.state });
  return e.taskId === undefined ? Stream.empty : followTask(d, e, e.taskId, true, streams);
};

/**
 * The session `name`'s entry once its send has an answer, read every second while it is under way; `undefined` once it has none, the
 * session forgotten. Refused where the send falls into doubt: no answer was recorded, and there is no Task to follow.
 */
const answered = (d: FollowDeps, name: string): Effect.Effect<Entry | undefined, RunnerError> =>
  Effect.sync(() => d.entryOf(name)).pipe(
    Effect.repeat({ schedule: Schedule.spaced(SENDING_POLL), until: (e) => !e || e.taskId !== undefined || !d.sendingLive(e) }),
    Effect.flatMap((e) => (e && e.taskId === undefined ? Effect.fail(inDoubt(d, name)) : Effect.succeed(e))),
  );

/**
 * The remote harness's `follow`: the session `name` followed live, its state first, subscribed to where the agent's card says it
 * streams and read every `readEveryMs` where it does not. Refused, in this order, where no session goes by the name, where the
 * agent's card cannot be read, and where the send is in doubt, at once or once it falls into it. A session that has ended gives its
 * state alone; one still being sent is `submitted` until the agent answers, then given its answer (`followAnswered`).
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
          catch: (cause) => refusal(`the \`${d.harness}\` agent's card could not be read (${wordsOf(cause)}): ${UNFOLLOWED}`),
        });
        const streams = card.capabilities?.streaming === true;
        if (e.ended && e.seen) return Stream.succeed<Followed>({ kind: 'state', state: e.seen.state });
        if (e.taskId !== undefined) return followTask(d, e, e.taskId, false, streams);
        if (!d.sendingLive(e)) return yield* Effect.fail(inDoubt(d, name));
        const later = Stream.unwrap(answered(d, name).pipe(Effect.map((a) => (a ? followAnswered(d, a, streams) : Stream.empty))));
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
