/**
 * The engine's side of the A2A seam: a harness's `RunnerOps`, rebuilt as calls through the SDK's `Client` to that
 * harness's `HarnessHandler`, in this process, with no HTTP between them.
 *
 * `spawn`, `observe`, `stop` and `say` go through the client, as A2A's own calls; `find`, `logs`, `release` and the
 * transcript, which A2A has no call for, through the runtime extension's methods on the same transport. One reaches the
 * driver directly: `refuses`, which is no call to a session but the harness judging a task before any is filed. Nothing the engine reads changes: a harness's words come back as the same
 * `RunnerError`, `refused` where the harness vouched nothing started, and a driver's defect as the defect it is.
 */
import { Effect, Layer } from 'effect';
import { A2A_PROTOCOL_VERSION, TaskState } from '@a2a-js/sdk';
import type {
  AgentCard, CancelTaskRequest, DeleteTaskPushNotificationConfigRequest, GetExtendedAgentCardRequest,
  GetTaskPushNotificationConfigRequest, GetTaskRequest, ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse, ListTasksRequest, ListTasksResponse, SendMessageRequest, StreamResponse,
  SubscribeToTaskRequest, Task, TaskPushNotificationConfig, SendMessageResult,
} from '@a2a-js/sdk';
import { Client, type Transport } from '@a2a-js/sdk/client';
import { ServerCallContext, type A2ARequestHandler } from '@a2a-js/sdk/server';
import { A2AError, TaskNotCancelableError } from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import type { Event, Sighting, Usage } from './domain.ts';
import { Journal } from './journal.ts';
import { Runner, RunnerError, type RunnerOps, type SpawnRequest, type Transcript, type TranscriptCursor } from './runner.ts';
import {
  cardOf, HarnessFailed, HarnessHandler, MOST_PER_PAGE, type RuntimeExtensionParams, type SessionMethods,
} from './a2a-handler.ts';
import { followUpOf, messageOf, RUNTIME_EXTENSION, sightingOf, wordsOf } from './a2a-map.ts';

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

  releaseSession(params: { session: Sighting; task: { worktree?: string | boolean } }): Promise<{ usage: Usage | null }> {
    return this.handler.releaseSession(params, new ServerCallContext());
  }

  sessionTranscript(params: { name: string; after?: TranscriptCursor }): Promise<Transcript | null> {
    return this.handler.sessionTranscript(params, new ServerCallContext());
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
  const params = card.capabilities?.extensions.find((e) => e.uri === RUNTIME_EXTENSION)?.params as Partial<RuntimeExtensionParams> | undefined;
  return { methods: params?.methods ?? [], say: params?.say === true };
};

/**
 * A client call as a driver's verb: its value, or the harness's words — or the seam's own refusal, in A2A's words — as a
 * `RunnerError`. Anything else thrown is a defect, and dies as one, as it would have reaching the driver directly.
 */
const call = <A>(verb: string, f: () => Promise<A>): Effect.Effect<A, RunnerError> =>
  Effect.tryPromise({ try: f, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => cause instanceof HarnessFailed || cause instanceof A2AError
      ? Effect.fail(new RunnerError({ verb, message: (cause as Error).message }))
      : Effect.die(cause)),
  );

/**
 * What the seam offers the engine: a harness's verbs, but the transcript, asked by the session's name (`transcriptOf`)
 * rather than by an id the caller would have had to find first. `null` when no session goes by the name yet.
 */
export type SeamOps = Omit<RunnerOps, 'transcript'> & {
  readonly transcriptOf?: (name: string, after?: TranscriptCursor) => Effect.Effect<Transcript | null, RunnerError>;
};

/**
 * A harness's `RunnerOps`, its session verbs through the A2A client. `spawn` sends the request as a user message and
 * reads the answer: `WORKING` started, `REJECTED` refused, `SUBMITTED` a spawn whose session may yet exist. `observe`
 * lists every page. `stop` cancels the session by name, read off the last listing, since the engine stops by session id;
 * a session no listing has is not stopped blindly but refused in words, where a driver was handed the id to make of what
 * it would. The engine stops only a session the pass has just seen live, so it never asks for that. `say` is a follow-up
 * message on the session's Task. `find`, `logs`, `release` and `transcriptOf` are the extension's methods. A verb is offered as the card
 * says — the verbs the harness's driver lacks are left off it — so the engine reads the same absences it read before.
 */
export const a2aOps = (harness: string, ops: RunnerOps, events: (taskId: string) => Promise<readonly Event[]>): SeamOps => {
  const { card, transport, client } = seamOf(harness, ops, events);
  const offered = extensionOf(card);
  let names = new Map<string, string>();

  const spawn = (r: SpawnRequest): Effect.Effect<void, RunnerError> =>
    call('spawn', () => client.sendMessage({
      tenant: '', message: messageOf(r, randomUUID()), metadata: undefined,
      configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
    })).pipe(Effect.flatMap((answer) => {
      const state = 'status' in answer ? answer.status?.state : undefined;
      if (state === TaskState.TASK_STATE_WORKING) return Effect.void;
      const words = 'status' in answer ? wordsOf(answer) : undefined;
      if (state === TaskState.TASK_STATE_REJECTED) {
        return Effect.fail(new RunnerError({ verb: 'spawn', message: words ?? `the \`${harness}\` harness refused \`${r.name}\` and said nothing.`, refused: true }));
      }
      return Effect.fail(new RunnerError({
        verb: 'spawn',
        message: words ?? `the \`${harness}\` harness answered the spawn of \`${r.name}\` with ${state === undefined ? 'a message, not a task' : TaskState[state]}: whether a session started is not known.`,
      }));
    }));

  const observe: Effect.Effect<Map<string, Sighting>, RunnerError> = Effect.gen(function* () {
    const seen = new Map<string, Sighting>();
    let pageToken = '';
    do {
      const page = yield* call('observe', () => client.listTasks({
        tenant: '', contextId: '', status: TaskState.TASK_STATE_UNSPECIFIED, pageSize: MOST_PER_PAGE, pageToken,
        historyLength: undefined, statusTimestampAfter: undefined, includeArtifacts: false,
      }));
      for (const t of page.tasks) {
        const s = sightingOf(t);
        if (!s) {
          return yield* Effect.fail(new RunnerError({ verb: 'observe', message: `the \`${harness}\` harness listed \`${t.id}\` with no sighting it could be read by.` }));
        }
        seen.set(t.id, s);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    names = new Map([...seen].map(([name, s]) => [s.sessionId, name]));
    return seen;
  });

  const stop = (sessionId: string): Effect.Effect<void, RunnerError> => Effect.gen(function* () {
    if (!names.has(sessionId)) yield* observe;
    const name = names.get(sessionId);
    if (name === undefined) {
      return yield* Effect.fail(new RunnerError({ verb: 'stop', message: `the \`${harness}\` harness lists no session \`${sessionId}\`: there is nothing to stop.` }));
    }
    // A session that ended between the listing and the stop has nothing to stop, as a driver's stop of an ended session
    // did nothing: the next pass reads how it ended.
    yield* call('stop', () => client.cancelTask({ tenant: '', id: name, metadata: undefined }).then(
      () => undefined,
      (cause) => { if (cause instanceof TaskNotCancelableError) return undefined; throw cause; },
    ));
  });

  const find = (name: string): Effect.Effect<{ sessionId: string } | undefined, RunnerError> =>
    call('find', () => transport.findSession({ name })).pipe(Effect.map((found) => found ?? undefined));

  const logs = (sessionId: string): Effect.Effect<string, RunnerError> =>
    call('logs', () => transport.sessionLogs({ sessionId })).pipe(Effect.map((r) => r.logs));

  const release = (session: Sighting, task: { worktree?: string | boolean }): Effect.Effect<Usage | void, RunnerError> =>
    call('release', () => transport.releaseSession({ session, task })).pipe(Effect.map((r) => r.usage ?? undefined));

  const say = (session: { name: string; sessionId: string }, text: string): Effect.Effect<void, RunnerError> =>
    call('say', () => client.sendMessage({
      tenant: '', message: followUpOf(session.name, text, randomUUID()), metadata: undefined,
      configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
    })).pipe(Effect.asVoid);

  const transcriptOf = (name: string, after?: TranscriptCursor): Effect.Effect<Transcript | null, RunnerError> =>
    call('transcript', () => transport.sessionTranscript({ name, after }));

  return {
    spawn, observe, stop, logs,
    ...(offered.methods.includes('findSession') ? { find } : {}),
    ...(offered.methods.includes('releaseSession') ? { release } : {}),
    ...(offered.methods.includes('sessionTranscript') ? { transcriptOf } : {}),
    ...(offered.say ? { say } : {}),
    // Direct by design, and for good: `refuses` is no call to a session (see the header).
    ...(ops.refuses ? { refuses: ops.refuses } : {}),
  };
};

/**
 * The same seam beneath the Effect door: a runner's session verbs through the A2A client, its agent answering off the
 * `Journal` the program provides. `Runner.layer(ops)` stays direct; this is the one to use for the path `createEngine`
 * takes. A function beside `Runner`, as `sdkRunner` is, rather than a static on it: `runner.ts` would then import this
 * file, which imports `runner.ts`.
 */
export const a2aRunner = (ops: RunnerOps, harness = 'runner'): Layer.Layer<Runner, never, Journal> =>
  Layer.unwrap(Effect.gen(function* () {
    const journal = yield* Journal;
    return Runner.layer(a2aOps(harness, ops, (taskId) => Effect.runPromise(journal.read(taskId))));
  }));
