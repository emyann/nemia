/**
 * The engine's side of the A2A seam: a harness's `RunnerOps`, rebuilt as calls through the SDK's `Client` to that
 * harness's `HarnessHandler`, in this process, with no HTTP between them.
 *
 * `spawn`, `observe`, `stop` and `say` go through the client, as A2A's own calls; `find`, `logs`, `release`, the
 * transcript, `observeFor`, `quota`, `forget` and `kept`, which A2A has no call for, through the runtime extension's methods on the same
 * transport.
 * One reaches the driver directly: `refuses`, which is no call to a session but the harness judging a task before any is
 * filed. Nothing the engine reads changes: a harness's words come back as the same `RunnerError`, `refused` where the
 * harness vouched nothing started, and a driver's defect as the defect it is.
 */
import { Effect, Layer } from 'effect';
import { A2A_PROTOCOL_VERSION, TaskState } from '@a2a-js/sdk';
import type {
  AgentCard,
  CancelTaskRequest,
  DeleteTaskPushNotificationConfigRequest,
  GetExtendedAgentCardRequest,
  GetTaskPushNotificationConfigRequest,
  GetTaskRequest,
  ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse,
  ListTasksRequest,
  ListTasksResponse,
  SendMessageRequest,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskPushNotificationConfig,
  SendMessageResult,
} from '@a2a-js/sdk';
import { Client, type Transport } from '@a2a-js/sdk/client';
import { ServerCallContext, type A2ARequestHandler } from '@a2a-js/sdk/server';
import { A2AError, TaskNotCancelableError } from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import type { Event, Sighting, Usage } from '../core/index.ts';
import { Journal } from '../core/engine/index.ts';
import {
  Runner,
  RunnerError,
  type ExpectedSession,
  type HarnessQuota,
  type Observation,
  type RunnerOps,
  type SessionForgotten,
  type SessionKept,
  type SessionsCompacted,
  type SpawnRequest,
  type Transcript,
  type TranscriptCursor,
} from '../harness/index.ts';
import {
  cardOf,
  HarnessFailed,
  HarnessHandler,
  MOST_PER_PAGE,
  type ForgetRequest,
  type KeptRequest,
  type RuntimeExtensionParams,
  type SessionMethods,
  type OutputRequest,
  type TranscriptRequest,
} from './handler.ts';
import { followUpOf, messageOf, RUNTIME_EXTENSION, sightingOf, wordsOf } from './map.ts';
import { followThrough } from './follow.ts';
import { TaskId } from '../core/model.ts';

/**
 * A `Transport` that calls a request handler in this process. Each call gets a fresh server context, as a request that
 * arrived by HTTP would. The transport's names and the handler's differ in three places — the extended card, the
 * push-config listing, a resubscribe — and are mapped here. The runtime extension's methods are forwarded as they are.
 */
export class InProcessTransport implements Transport {
  private readonly handler: A2ARequestHandler & SessionMethods;

  constructor(handler: A2ARequestHandler & SessionMethods) {
    this.handler = handler;
  }

  get protocolName(): string {
    return 'in-process';
  }

  get protocolVersion(): string {
    return A2A_PROTOCOL_VERSION;
  }

  getExtendedAgentCard(params: GetExtendedAgentCardRequest): Promise<AgentCard> {
    return this.handler.getAuthenticatedExtendedAgentCard(params, new ServerCallContext());
  }

  sendMessage(params: SendMessageRequest): Promise<SendMessageResult> {
    return this.handler.sendMessage(params, new ServerCallContext());
  }

  async *sendMessageStream(params: SendMessageRequest): AsyncGenerator<StreamResponse, void, undefined> {
    yield* this.handler.sendMessageStream(params, new ServerCallContext());
  }

  createTaskPushNotificationConfig(params: TaskPushNotificationConfig): Promise<TaskPushNotificationConfig> {
    return this.handler.createTaskPushNotificationConfig(params, new ServerCallContext());
  }

  getTaskPushNotificationConfig(params: GetTaskPushNotificationConfigRequest): Promise<TaskPushNotificationConfig> {
    return this.handler.getTaskPushNotificationConfig(params, new ServerCallContext());
  }

  listTaskPushNotificationConfig(params: ListTaskPushNotificationConfigsRequest): Promise<ListTaskPushNotificationConfigsResponse> {
    return this.handler.listTaskPushNotificationConfigs(params, new ServerCallContext());
  }

  deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigRequest): Promise<void> {
    return this.handler.deleteTaskPushNotificationConfig(params, new ServerCallContext());
  }

  getTask(params: GetTaskRequest): Promise<Task> {
    return this.handler.getTask(params, new ServerCallContext());
  }

  cancelTask(params: CancelTaskRequest): Promise<Task> {
    return this.handler.cancelTask(params, new ServerCallContext());
  }

  listTasks(params: ListTasksRequest): Promise<ListTasksResponse> {
    return this.handler.listTasks(params, new ServerCallContext());
  }

  async *resubscribeTask(params: SubscribeToTaskRequest): AsyncGenerator<StreamResponse, void, undefined> {
    yield* this.handler.resubscribe(params, new ServerCallContext());
  }

  findSession(params: { name: string }): Promise<{ sessionId: string } | null> {
    return this.handler.findSession(params, new ServerCallContext());
  }

  sessionLogs(params: { sessionId: string }): Promise<{ logs: string }> {
    return this.handler.sessionLogs(params, new ServerCallContext());
  }

  interruptSession(params: { session: { name: string; sessionId: string } }): Promise<void> {
    return this.handler.interruptSession(params, new ServerCallContext());
  }

  sessionOutput(params: OutputRequest): Promise<{ output: string | null }> {
    return this.handler.sessionOutput(params, new ServerCallContext());
  }

  releaseSession(params: { session: Sighting; task: { worktree?: string | boolean } }): Promise<{ usage: Usage | null }> {
    return this.handler.releaseSession(params, new ServerCallContext());
  }

  sessionTranscript(params: TranscriptRequest): Promise<Transcript | null> {
    return this.handler.sessionTranscript(params, new ServerCallContext());
  }

  observeSessions(params: {
    expected: readonly ExpectedSession[];
  }): Promise<{ tasks: Task[]; unread: string[]; why: string[]; unreadWhy?: Record<string, string> }> {
    return this.handler.observeSessions(params, new ServerCallContext());
  }

  harnessQuota(params: Record<string, never>): Promise<HarnessQuota> {
    return this.handler.harnessQuota(params, new ServerCallContext());
  }

  forgetSession(params: ForgetRequest): Promise<SessionForgotten> {
    return this.handler.forgetSession(params, new ServerCallContext());
  }

  sessionKept(params: KeptRequest): Promise<Record<string, SessionKept>> {
    return this.handler.sessionKept(params, new ServerCallContext());
  }

  compactSessions(params: { dry: boolean }): Promise<SessionsCompacted> {
    return this.handler.compactSessions(params, new ServerCallContext());
  }
}

/** One harness's seam: its card, a client over its handler in this process, and the transport the extension's methods take. */
const seamOf = (harness: string, ops: RunnerOps, events: (taskId: string) => Promise<readonly Event[]>) => {
  const card = cardOf(harness, ops);
  const transport = new InProcessTransport(new HarnessHandler(harness, ops, events));
  return { card, transport, client: new Client(transport, card, { polling: true }) };
};

/** A client of one harness, over its handler in this process. `polling`: a send answers once the session starts. */
export const clientOf = (harness: string, ops: RunnerOps, events: (taskId: string) => Promise<readonly Event[]>): Client =>
  seamOf(harness, ops, events).client;

/** What a card says of the runtime extension: the methods its agent answers, and whether a session takes words. */
const extensionOf = (card: AgentCard): RuntimeExtensionParams => {
  const params = card.capabilities?.extensions.find((e) => e.uri === RUNTIME_EXTENSION)?.params as
    | Partial<RuntimeExtensionParams>
    | undefined;
  return { methods: params?.methods ?? [], say: params?.say === true };
};

/**
 * A client call as a driver's verb: its value, or the harness's words — or the seam's own refusal, in A2A's words — as a
 * `RunnerError`. Anything else thrown is a defect, and dies as one, as it would have reaching the driver directly.
 */
const call = <A>(verb: string, f: () => Promise<A>): Effect.Effect<A, RunnerError> =>
  Effect.tryPromise({ try: f, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof HarnessFailed || cause instanceof A2AError
        ? Effect.fail(new RunnerError({ verb, message: (cause as Error).message }))
        : Effect.die(cause),
    ),
  );

/** `find` through the seam: the session running under a name, `undefined` when none does. */
const findThrough =
  (transport: InProcessTransport) =>
  (name: string): Effect.Effect<{ sessionId: string } | undefined, RunnerError> =>
    call('find', () => transport.findSession({ name })).pipe(Effect.map((found) => found ?? undefined));

/** `forget` through the seam: what the harness keeps of a session, removed, or with `dry` only listed. */
const forgetThrough =
  (transport: InProcessTransport) =>
  (session: { name: string; nativeId?: string }, options: { dry: boolean }): Effect.Effect<SessionForgotten, RunnerError> =>
    call('forget', () => transport.forgetSession({ session, dry: options.dry }));

/** `kept` through the seam: where the harness keeps what it has of each session asked, by the session's name. */
const keptThrough =
  (transport: InProcessTransport) =>
  (sessions: readonly { name: string; nativeId?: string }[]): Effect.Effect<Record<string, SessionKept>, RunnerError> =>
    call('kept', () => transport.sessionKept({ sessions }));

/** `output` through the seam: one stream of the session under a name, whole or its last bytes; `undefined` when none was kept. */
const outputThrough =
  (transport: InProcessTransport) =>
  (name: string, stream: 'stdout' | 'stderr', lastBytes?: number): Effect.Effect<string | undefined, RunnerError> =>
    call('output', () => transport.sessionOutput({ name, stream, lastBytes })).pipe(Effect.map((r) => r.output ?? undefined));

/**
 * What the driver left unread (`observeSessions`), and why each session alone was: only words that are a string, for a name among
 * `unread`. An answer without them, a driver's from before they were answered, is none.
 */
const unreadOf = (
  unread: readonly string[],
  why: readonly string[],
  said: Record<string, unknown> | undefined,
): Omit<Observation, 'seen'> => {
  const names = new Set(unread);
  const unreadWhy = new Map(
    Object.entries(said ?? {}).flatMap(([name, words]) => (names.has(name) && typeof words === 'string' ? [[name, words] as const] : [])),
  );
  return { unread: names, ...(why.length ? { why } : {}), ...(unreadWhy.size ? { unreadWhy } : {}) };
};

/**
 * The verbs the card offers that ask the transport alone, each left off when the card does not list its method; `follow` when it
 * says the agent streams.
 */
const askedOfTransport = (offered: RuntimeExtensionParams, transport: InProcessTransport, streaming: boolean): Partial<RunnerOps> => ({
  ...(streaming ? { follow: followThrough((params) => transport.resubscribeTask(params)) } : {}),
  ...(offered.methods.includes('findSession') ? { find: findThrough(transport) } : {}),
  ...(offered.methods.includes('sessionOutput') ? { output: outputThrough(transport) } : {}),
  ...(offered.methods.includes('harnessQuota') ? { quota: call('quota', () => transport.harnessQuota({})) } : {}),
  ...(offered.methods.includes('forgetSession') ? { forget: forgetThrough(transport) } : {}),
  ...(offered.methods.includes('sessionKept') ? { kept: keptThrough(transport) } : {}),
  ...(offered.methods.includes('compactSessions')
    ? { compact: (options: { dry: boolean }) => call('compact', () => transport.compactSessions({ dry: options.dry })) }
    : {}),
});

/**
 * What the seam offers the engine: a harness's verbs, and beside them the transcript asked by the session's name
 * (`transcriptOf`) rather than by an id the caller would have had to find first; `null` when no session goes by the name
 * yet. `transcript`, by id, is offered too, through the seam: it is `Runner`'s verb, and `a2aRunner` hands the Effect door
 * these ops as a `RunnerOps`, where a verb left off reads as a harness that keeps no conversation.
 */
export type SeamOps = RunnerOps & {
  readonly transcriptOf?: (name: string, after?: TranscriptCursor) => Effect.Effect<Transcript | null, RunnerError>;
};

/**
 * A spawn through `harness`'s client: the request sent as a user message, and the answer read — `WORKING` started, `REJECTED` refused,
 * any other a spawn whose session may yet exist, in the harness's words when it gave some.
 */
const spawnThrough =
  (harness: string, client: Client) =>
  (r: SpawnRequest): Effect.Effect<void, RunnerError> =>
    call('spawn', () =>
      client.sendMessage({
        tenant: '',
        message: messageOf(r, randomUUID()),
        metadata: undefined,
        configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
      }),
    ).pipe(
      Effect.flatMap((answer) => {
        const state = 'status' in answer ? answer.status?.state : undefined;
        if (state === TaskState.TASK_STATE_WORKING) return Effect.void;
        const words = 'status' in answer ? wordsOf(answer) : undefined;
        if (state === TaskState.TASK_STATE_REJECTED) {
          return Effect.fail(
            new RunnerError({
              verb: 'spawn',
              message: words ?? `the \`${harness}\` harness refused \`${r.name}\` and said nothing.`,
              refused: true,
            }),
          );
        }
        return Effect.fail(
          new RunnerError({
            verb: 'spawn',
            message:
              words ??
              `the \`${harness}\` harness answered the spawn of \`${r.name}\` with ${state === undefined ? 'a message, not a task' : TaskState[state]}: whether a session started is not known.`,
          }),
        );
      }),
    );

/**
 * A harness's `RunnerOps`, its session verbs through the A2A client. `spawn` sends the request as a user message and
 * reads the answer: `WORKING` started, `REJECTED` refused, `SUBMITTED` a spawn whose session may yet exist. `observe`
 * lists every page, and a listed Task that carries no sighting fails the read. `stop` cancels the session by name, read off the last
 * listing (`observe`'s or `observeFor`'s), since the engine stops by session id: a session the listing left out is listed in full when a
 * stop asks for it, and one no listing has is not stopped blindly but refused in words. The engine stops only a session the pass has just
 * seen live, so it never asks for that. A session that ended between the listing and the stop has nothing to stop, as a driver's
 * stop of an ended session does nothing: the next pass reads how it ended. `say` is a follow-up message on the session's
 * Task. `find`, `logs`, `release`, `transcript`, `transcriptOf`, `observeFor`, `quota` and `forget` are the extension's methods; the names
 * `observeFor`'s driver could not look for cross as it said them, names and nothing more. By id, a transcript is always
 * read: the handler answers `null` only for a name it found no session under, so a `null` by id is a defect. A verb is
 * offered as the card says — the verbs the harness's driver lacks are left off it — so the engine reads the absences the
 * driver itself shows. `refuses` is the driver's own, handed on directly: it is no call to a session.
 */
export const a2aOps = (harness: string, ops: RunnerOps, events: (taskId: string) => Promise<readonly Event[]>): SeamOps => {
  const { card, transport, client } = seamOf(harness, ops, events);
  const offered = extensionOf(card);
  let names = new Map<string, string>();

  const spawn = spawnThrough(harness, client);

  const sightingsOf = (verb: string, tasks: readonly Task[], seen: Map<string, Sighting>): Effect.Effect<void, RunnerError> => {
    for (const t of tasks) {
      const s = sightingOf(t);
      if (!s)
        return Effect.fail(
          new RunnerError({ verb, message: `the \`${harness}\` harness listed \`${t.id}\` with no sighting it could be read by.` }),
        );
      seen.set(t.id, s);
    }
    return Effect.void;
  };

  const observe: Effect.Effect<Map<string, Sighting>, RunnerError> = Effect.gen(function* () {
    const seen = new Map<string, Sighting>();
    let pageToken = '';
    do {
      const page = yield* call('observe', () =>
        client.listTasks({
          tenant: '',
          contextId: '',
          status: TaskState.TASK_STATE_UNSPECIFIED,
          pageSize: MOST_PER_PAGE,
          pageToken,
          historyLength: undefined,
          statusTimestampAfter: undefined,
          includeArtifacts: false,
        }),
      );
      yield* sightingsOf('observe', page.tasks, seen);
      pageToken = page.nextPageToken;
    } while (pageToken);
    names = new Map([...seen].map(([name, s]) => [s.sessionId, name]));
    return seen;
  });

  const observeFor = (expected: readonly ExpectedSession[]): Effect.Effect<Observation, RunnerError> =>
    Effect.gen(function* () {
      const seen = new Map<string, Sighting>();
      const { tasks, unread, why, unreadWhy: said } = yield* call('observe', () => transport.observeSessions({ expected }));
      yield* sightingsOf('observe', tasks, seen);
      names = new Map([...seen].map(([name, s]) => [s.sessionId, name]));
      return { seen, ...unreadOf(unread, why, said) };
    });

  const stop = (sessionId: string): Effect.Effect<void, RunnerError> =>
    Effect.gen(function* () {
      if (!names.has(sessionId)) yield* observe;
      const name = names.get(sessionId);
      if (name === undefined) {
        return yield* Effect.fail(
          new RunnerError({
            verb: 'stop',
            message: `the \`${harness}\` harness lists no session \`${sessionId}\`: there is nothing to stop.`,
          }),
        );
      }
      yield* call('stop', () =>
        client.cancelTask({ tenant: '', id: name, metadata: undefined }).then(
          () => undefined,
          (cause) => {
            if (cause instanceof TaskNotCancelableError) return undefined;
            throw cause;
          },
        ),
      );
    });

  const logs = (sessionId: string): Effect.Effect<string, RunnerError> =>
    call('logs', () => transport.sessionLogs({ sessionId })).pipe(Effect.map((r) => r.logs));

  const interrupt = (session: { name: string; sessionId: string }): Effect.Effect<void, RunnerError> =>
    call('interrupt', () => transport.interruptSession({ session })).pipe(Effect.asVoid);

  const release = (session: Sighting, task: { worktree?: string | boolean }): Effect.Effect<Usage | void, RunnerError> =>
    call('release', () => transport.releaseSession({ session, task })).pipe(Effect.map((r) => r.usage ?? undefined));

  const say = (session: { name: string; sessionId: string }, text: string): Effect.Effect<void, RunnerError> =>
    call('say', () =>
      client.sendMessage({
        tenant: '',
        message: followUpOf(session.name, text, randomUUID()),
        metadata: undefined,
        configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
      }),
    ).pipe(Effect.asVoid);

  return {
    spawn,
    observe,
    stop,
    logs,
    ...askedOfTransport(offered, transport, card.capabilities?.streaming === true),
    ...(offered.methods.includes('interruptSession') ? { interrupt } : {}),
    ...(offered.methods.includes('releaseSession') ? { release } : {}),
    ...(offered.methods.includes('sessionTranscript') ? transcriptsThrough(transport) : {}),
    ...(offered.methods.includes('observeSessions') ? { observeFor } : {}),
    ...(offered.say ? { say } : {}),
    ...carried(ops),
  };
};

/**
 * What the harness beneath the seam answers itself, carried through untouched rather than called over the transport: the person's
 * answer to a call one of its sessions holds open, which is written where that session reads it, and what the harness refuses a task
 * for. A2A has no call for either, and an adapter that rebuilt the ops without them would drop the verb silently
 * (`Engine.answerAsk` then refuses every answer), which is why they are carried in one place.
 */
const carried = (ops: RunnerOps): Pick<SeamOps, 'answer' | 'refuses'> => ({
  ...(ops.answer ? { answer: ops.answer } : {}),
  ...(ops.refuses ? { refuses: ops.refuses } : {}),
});

/**
 * A session's conversation through the transport, as the seam offers it: `transcriptOf` by the session's name, `null` where no session
 * goes by it yet, and `transcript` by its id, whose `null` is a defect — the handler answers none only for a name it did not find.
 */
const transcriptsThrough = (transport: InProcessTransport) => ({
  transcriptOf: (name: string, after?: TranscriptCursor): Effect.Effect<Transcript | null, RunnerError> =>
    call('transcript', () => transport.sessionTranscript({ name, after })),
  transcript: (sessionId: string, after?: TranscriptCursor): Effect.Effect<Transcript, RunnerError> =>
    call('transcript', () => transport.sessionTranscript({ sessionId, after })).pipe(
      Effect.flatMap((read) =>
        read ? Effect.succeed(read) : Effect.die(new Error(`the seam read no transcript for session \`${sessionId}\`, asked by id`)),
      ),
    ),
});

/**
 * The same seam beneath the Effect door: a runner's session verbs through the A2A client, its agent answering off the
 * `Journal` the program provides. `Runner.layer(ops)` calls the driver directly; this is the one to use for the path `Engine.layer`
 * takes. A function beside `Runner`, as `sdkRunner` is, rather than a static on it: `harness/seam.ts` would then import
 * this file, which imports `harness/seam.ts`.
 */
export const a2aRunner = (ops: RunnerOps, harness = 'runner'): Layer.Layer<Runner, never, Journal> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const journal = yield* Journal;
      return Runner.layer(a2aOps(harness, ops, (taskId) => Effect.runPromise(journal.read(TaskId.read(taskId)))));
    }),
  );
