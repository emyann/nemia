/**
 * One harness as an A2A agent: the SDK's public `A2ARequestHandler`, over the driver the runtime already had.
 *
 * It holds no truth. Every answer is derived afresh from the harness (`ops.observe`) and the journal (`events`, folded),
 * so a restarted runtime answers at once, for sessions it never started. The one thing it keeps is each listing that
 * still has pages to serve, under the id its page tokens name, until its last page is served.
 *
 * Not the SDK's `DefaultRequestHandler`: that one runs an `AgentExecutor` against a `TaskStore` it writes, and a store
 * the handler writes is a second record beside the journal — the thing a level-triggered runtime cannot have. This is
 * the same interface, so the SDK's HTTP transports can serve it by URL without a change here.
 *
 * `sendMessage` is a spawn when the message carries the runtime's extension, and otherwise words said to a running
 * session (`say`); `listTasks` is an observe, `getTask` one session's view, `cancelTask` a stop. What A2A has no call
 * for — a session found by name, its logs, a session let go of, its conversation read from a cursor — are the
 * extension's methods (`SessionMethods`). A session is streamed where its driver follows it (`SubscribeToTask`, `subscription`), as
 * the card's `capabilities.streaming` says. What the runtime has no use for — push notifications, an extended card — is refused in
 * the SDK's own errors, never taken and ignored. A transcript is not a stream: `SubscribeToTask`
 * is refused on a Task in a terminal state, and a finished session's conversation is still read, and its first event
 * is the Task as it stands, a listing of the harness on every read (`sessionTranscript`).
 */
import { Effect } from 'effect';
import { TaskState } from '@a2a-js/sdk';
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
  Message,
  SendMessageRequest,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskPushNotificationConfig,
} from '@a2a-js/sdk';
import type { A2ARequestHandler, ServerCallContext } from '@a2a-js/sdk/server';
import {
  ExtendedAgentCardNotConfiguredError,
  PushNotificationNotSupportedError,
  RequestMalformedError,
  TaskNotCancelableError,
  TaskNotFoundError,
  UnsupportedOperationError,
} from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import { fold, waitsForInput, isLive, phaseWordOf, nameParts, type Event, type Sighting, type Usage } from '../core/index.ts';
import {
  RunnerError,
  type ExpectedSession,
  type HarnessQuota,
  type SessionForgotten,
  type SessionKept,
  type SessionsCompacted,
  type RunnerOps,
  type Transcript,
  type TranscriptCursor,
} from '../harness/index.ts';
import {
  canceledTask,
  contextRefusal,
  failedSpawnTask,
  followUpRefusal,
  followUpText,
  messageRefusal,
  RUNTIME_EXTENSION,
  spawnOf,
  startedTask,
  taskOfAttempt,
  taskOfSighting,
  type SessionMethod,
} from './map.ts';
import { goneOf, subscription } from './follow.ts';

/**
 * What a harness said when a verb failed, carried out of the handler with its words unchanged. Anything else the handler
 * throws — a defect in a driver — is not words, and a client lets it through as the defect it is.
 */
export class HarnessFailed extends Error {
  override readonly name = 'HarnessFailed';
}

/** The most a `listTasks` page holds, and how many it holds when the request does not say (A2A's own numbers). */
export const MOST_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 50;

/**
 * How many listings may have pages still to serve at once. Listings overlap — every read of a view, a transcript or a
 * tick observes — so a page is served from the listing its token names, never only the latest. A client that stops
 * paging part-way leaves its listing behind; past this many, the oldest is dropped, and a token of it refused.
 */
export const OPEN_LISTINGS = 64;

/** What the runtime's extension says on a card: the extension methods the agent answers, and whether a session takes words. */
export type RuntimeExtensionParams = { methods: SessionMethod[]; say: boolean };

/**
 * A harness's card: what it is called, that it answers a message once and is polled after, and the runtime's extension —
 * which of its methods this harness answers, and whether its running sessions take words. A verb the driver lacks is
 * left off the card, so a client offers it to nobody.
 */
export const cardOf = (harness: string, ops: RunnerOps): AgentCard => ({
  name: harness,
  description: `The \`${harness}\` harness: one agent session per task, started by a message and polled until it ends.`,
  supportedInterfaces: [],
  provider: undefined,
  version: '1',
  capabilities: {
    streaming: ops.follow !== undefined,
    pushNotifications: false,
    extendedAgentCard: false,
    extensions: [
      {
        uri: RUNTIME_EXTENSION,
        required: false,
        description:
          'A spawn is a message marked with this extension: it starts a session under the name its taskId gives. The methods listed answer what A2A has no call for.',
        params: {
          methods: [
            ...(ops.find ? ['findSession' as const] : []),
            ...(ops.interrupt ? ['interruptSession' as const] : []),
            'sessionLogs' as const,
            ...(ops.output ? ['sessionOutput' as const] : []),
            ...(ops.release ? ['releaseSession' as const] : []),
            ...(ops.transcript ? ['sessionTranscript' as const] : []),
            ...(ops.observeFor ? ['observeSessions' as const] : []),
            ...(ops.quota ? ['harnessQuota' as const] : []),
            ...(ops.forget ? ['forgetSession' as const] : []),
            ...(ops.kept ? ['sessionKept' as const] : []),
            ...(ops.compact ? ['compactSessions' as const] : []),
          ],
          say: ops.say !== undefined,
        } satisfies RuntimeExtensionParams,
      },
    ],
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [],
  signatures: [],
});

/**
 * The runtime extension's methods, beside A2A's. Each keeps the driver's own key — a name, a session id, the session as
 * the pass's listing saw it — and the transcript takes either: by name it finds the session's id itself, and by id it is
 * the driver's read as `Runner` has it. A harness without the verb refuses it in A2A's `UnsupportedOperationError`, and
 * its card does not list it.
 */
/** A transcript asked for by the session's name, or by the id its harness lists it under. */
export type TranscriptRequest =
  | { name: string; sessionId?: undefined; after?: TranscriptCursor }
  | { sessionId: string; name?: undefined; after?: TranscriptCursor };

/** A session to forget, by its name and the id its attempt ended with; `dry` lists what would go and removes nothing. */
export type ForgetRequest = { session: { name: string; nativeId?: string }; dry: boolean };

/** The sessions whose kept paths are asked, each by its name and the id its attempt ended with. */
export type KeptRequest = { sessions: readonly { name: string; nativeId?: string }[] };

/** A stream of a session asked for by the session's name: `stdout` or `stderr`, whole or its last `lastBytes` bytes. */
export type OutputRequest = { name: string; stream: 'stdout' | 'stderr'; lastBytes?: number };

export interface SessionMethods {
  /** The session running under a name, found without listing every other; `null` when none does. */
  findSession(params: { name: string }, context: ServerCallContext): Promise<{ sessionId: string } | null>;
  /**
   * End the turn the session is in, and leave the session open to hear the next words. Only a harness that runs its sessions on
   * streaming input can; any other refuses it, and its card does not list the method.
   */
  interruptSession(params: { session: { name: string; sessionId: string } }, context: ServerCallContext): Promise<void>;
  /** What a session printed, read by the id its harness lists it under, or the one its end was recorded with. */
  sessionLogs(params: { sessionId: string }, context: ServerCallContext): Promise<{ logs: string }>;
  /** One stream of the session under a name, as the harness kept it whole, or its last bytes; `null` when it kept none. */
  sessionOutput(params: OutputRequest, context: ServerCallContext): Promise<{ output: string | null }>;
  /** Let go of a session whose end is on the record; what it consumed, when the harness reads that only as it exits. */
  releaseSession(
    params: { session: Sighting; task: { worktree?: string | boolean } },
    context: ServerCallContext,
  ): Promise<{ usage: Usage | null }>;
  /**
   * A session's conversation from `after` on, and the cursor to ask again with; `null` when no session goes by the name
   * yet. Asked by name, the id is found here: the one the journal ended the attempt with, else the harness's. Asked by
   * `sessionId`, the harness reads that session, as `Runner.transcript` is asked. One of the two, never both.
   */
  sessionTranscript(params: TranscriptRequest, context: ServerCallContext): Promise<Transcript | null>;
  /**
   * The sessions the harness lists, each a Task as `listTasks` gives it, told which ones the journal expects: every one of
   * those it lists, and whatever else it lists for no more (`RunnerOps.observeFor`). Answered whole, on no page: its caller
   * is a pass in this process, which reads every task at once. `unread` is every expected name the driver could not look for
   * this time (`Observation`): neither listed nor gone. `why` is what each part of the look that failed said, one sentence each,
   * and empty when every part read. `unreadWhy` is why each session alone was unread, by its name among `unread`, in the
   * harness's words, and empty when none was.
   */
  observeSessions(
    params: { expected: readonly ExpectedSession[] },
    context: ServerCallContext,
  ): Promise<{ tasks: Task[]; unread: string[]; why: string[]; unreadWhy: Record<string, string> }>;
  /** What the harness's subscription has left, asked of the harness and of no session (`RunnerOps.quota`): one ask each call. */
  harnessQuota(params: Record<string, never>, context: ServerCallContext): Promise<HarnessQuota>;
  /**
   * What the harness keeps of a session, by its name and the id it ended with: removed, or with `dry` only listed, and what
   * it leaves that is not its own to remove (`RunnerOps.forget`). Asked only of a session the harness no longer lists.
   */
  forgetSession(params: ForgetRequest, context: ServerCallContext): Promise<SessionForgotten>;
  /**
   * Where the harness keeps what it has of each session asked, by the session's name, and its own record of it (`RunnerOps.kept`):
   * asked of every session at once, removing nothing. A session it keeps nothing of has no key.
   */
  sessionKept(params: KeptRequest, context: ServerCallContext): Promise<Record<string, SessionKept>>;
  /**
   * The captures of every session the harness keeps whose worker has ended, rewritten to what their readers read, or with `dry` only
   * counted (`RunnerOps.compact`): asked of the harness and of no session.
   */
  compactSessions(params: { dry: boolean }, context: ServerCallContext): Promise<SessionsCompacted>;
}

/** Every listed session, as one listing saw them: the pages of that listing are served from here. */
type Snapshot = { id: number; contextId: string; status: TaskState; tasks: Task[] };

/** Drops the oldest of the `open` listings, the first one kept. */
const dropOldest = (open: Map<number, Snapshot>): void => {
  const oldest = open.keys().next();
  if (!oldest.done) open.delete(oldest.value);
};

export class HarnessHandler implements A2ARequestHandler, SessionMethods {
  private readonly harness: string;
  private readonly ops: RunnerOps;
  private readonly events: (taskId: string) => Promise<readonly Event[]>;
  private readonly open = new Map<number, Snapshot>();
  private listings = 0;

  constructor(harness: string, ops: RunnerOps, events: (taskId: string) => Promise<readonly Event[]>) {
    this.harness = harness;
    this.ops = ops;
    this.events = events;
  }

  /** A driver's verb, run: its value, or its words as a `HarnessFailed`. A defect is thrown as it is. */
  private async run<A>(e: Effect.Effect<A, RunnerError>): Promise<A> {
    try {
      return await Effect.runPromise(e);
    } catch (cause) {
      throw cause instanceof RunnerError ? new HarnessFailed(cause.message) : cause;
    }
  }

  async getAgentCard(): Promise<AgentCard> {
    return cardOf(this.harness, this.ops);
  }

  async getAuthenticatedExtendedAgentCard(_params: GetExtendedAgentCardRequest, _context: ServerCallContext): Promise<AgentCard> {
    throw new ExtendedAgentCardNotConfiguredError(`the \`${this.harness}\` harness has no extended card: its card is the whole of it.`);
  }

  /**
   * A spawn, when the message carries the runtime's extension; otherwise words said to a running session (`follow`). The
   * session starts, or the harness says why not: `WORKING`; `REJECTED` when it vouched nothing started; `SUBMITTED`, with
   * its words, when a session may yet exist. The answer is the spawn's, never the session's end.
   */
  async sendMessage(params: SendMessageRequest, _context: ServerCallContext): Promise<Message | Task> {
    if (params.configuration?.returnImmediately !== true) {
      throw new UnsupportedOperationError('this agent answers once the session starts: send returnImmediately and poll getTask.');
    }
    if (!params.message) throw new RequestMalformedError('the request has no message: a spawn is one user message.');
    if (!params.message.extensions.includes(RUNTIME_EXTENSION)) return this.follow(params.message);
    const refused = messageRefusal(params.message);
    if (refused) throw new RequestMalformedError(refused);
    const asked = params.message;
    try {
      await Effect.runPromise(this.ops.spawn(spawnOf(asked)));
      return startedTask(asked.taskId, asked);
    } catch (cause) {
      if (!(cause instanceof RunnerError)) throw cause;
      return failedSpawnTask(asked.taskId, asked, cause.message, cause.refused === true, randomUUID());
    }
  }

  /**
   * Words said to a running session: A2A's follow-up, a message on the session's Task. Taken while the session runs —
   * working, or waiting on a person (`INPUT_REQUIRED`) — as the harness's inbox takes them either way; a session that has
   * ended takes no more, as A2A refuses a message to a Task in a terminal state, unless its harness says it still holds its
   * process (`held`): a long-lived session listed done between turns keeps its inbox. The harness is listed afresh for the
   * session's id: the handler holds no listing of its own, and the message's context, when it sends one, must be that
   * session's. Answered with the session as that listing saw it.
   *
   * A harness with no channel into a session (`say`) is refused before any observe, so it is asked nothing. A2A's way on
   * from an ended session is a message in its context; here, since a plain message naming a Task only continues it, that
   * is a spawn under a name of its own, once the session has ended: spawned while it runs, a second process would resume
   * the same conversation beside it.
   */
  private async follow(m: Message): Promise<Task> {
    const refused = followUpRefusal(m);
    if (refused) throw new RequestMalformedError(refused);
    if (!this.ops.say) {
      throw new UnsupportedOperationError(
        `the \`${this.harness}\` harness has no channel into a running session: it takes no words once a session has started. Once this session has ended, go on with its conversation by spawning a session of its own — a message marked \`${RUNTIME_EXTENSION}\` — in this session's contextId.`,
      );
    }
    const seen = (await this.run(this.ops.observe)).get(m.taskId);
    if (!seen)
      throw new TaskNotFoundError(`no session \`${m.taskId}\` for the \`${this.harness}\` harness to hear anything: it lists none.`);
    const elsewhere = contextRefusal(m.taskId, m.contextId, seen);
    if (elsewhere) throw new RequestMalformedError(elsewhere);
    if (!isLive(seen.state) && seen.held !== true) {
      throw new UnsupportedOperationError(`session \`${m.taskId}\` has ended (${phaseWordOf(seen.state)}): it takes no more words.`);
    }
    await this.run(this.ops.say({ name: m.taskId, sessionId: seen.sessionId }, followUpText(m)));
    return taskOfSighting(m.taskId, seen);
  }

  // oxlint-disable-next-line require-yield -- the SDK's handler types this as a stream, and this agent refuses to stream
  async *sendMessageStream(_params: SendMessageRequest, _context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    throw new UnsupportedOperationError('this agent does not stream: send the message with returnImmediately and poll getTask.');
  }

  /**
   * One session: as the harness sees it, or, when it lists no such session, as the journal records the attempt — open,
   * or how it ended. Neither knows it: `TaskNotFoundError`. A session that signed and whose task is held open for a person
   * is `INPUT_REQUIRED`, whether its harness still lists it `completed` — a Claude Code job, never let go — or has let it go:
   * the journal is read for that, once, for a session listed `completed` or listed not at all. `listTasks` still says
   * `COMPLETED` of it, the harness's word, which is what `observe` reads.
   */
  async getTask(params: GetTaskRequest, _context: ServerCallContext): Promise<Task> {
    const seen = (await this.run(this.ops.observe)).get(params.id);
    const parts = nameParts(params.id);
    if (seen && (seen.state !== 'completed' || !parts)) return taskOfSighting(params.id, seen);
    const state = parts && fold(parts.taskId, await this.events(parts.taskId));
    const attempt = parts && state?.attempts.find((a) => a.n === parts.n);
    const waiting = state !== undefined && waitsForInput(state) && state.attempts.at(-1) === attempt;
    if (seen) return waiting ? taskOfSighting(params.id, seen, TaskState.TASK_STATE_INPUT_REQUIRED) : taskOfSighting(params.id, seen);
    if (!attempt)
      throw new TaskNotFoundError(
        `no session \`${params.id}\`: the \`${this.harness}\` harness lists none, and no attempt was journalled under it.`,
      );
    return taskOfAttempt(params.id, attempt, randomUUID(), waiting);
  }

  /**
   * A stop. A live session is stopped and answered `CANCELED`, as is one already stopped, as A2A answers a repeat cancel.
   * One that finished on its own cannot be: `TaskNotCancelableError`, unless its harness still holds its process (`held`), as it
   * holds a long-lived session listed done between turns, which is stopped. A stop the harness failed throws its words.
   */
  async cancelTask(params: CancelTaskRequest, _context: ServerCallContext): Promise<Task> {
    const seen = (await this.run(this.ops.observe)).get(params.id);
    if (!seen) throw new TaskNotFoundError(`no session \`${params.id}\` for the \`${this.harness}\` harness to stop: it lists none.`);
    if (!isLive(seen.state) && seen.state !== 'canceled' && seen.held !== true) {
      throw new TaskNotCancelableError(`session \`${params.id}\` has ended (${phaseWordOf(seen.state)}): there is nothing to stop.`);
    }
    if (seen.state !== 'canceled') await this.run(this.ops.stop(seen.sessionId));
    return canceledTask(params.id, seen);
  }

  /**
   * Every session the harness lists, by name, filtered by `contextId` — the harness's id for the conversation, so every
   * attempt that continued one — and `status`, with what each closed with only when `includeArtifacts` asks for it, as
   * A2A's default leaves it out. The first page observes once; the pages after it are served from that listing by its
   * token, `<listing>:<offset>`, whatever other listings were made since. A token of a listing whose last page was served, or that was
   * dropped, is refused rather than served a list that moved under it.
   */
  async listTasks(params: ListTasksRequest, _context: ServerCallContext): Promise<ListTasksResponse> {
    if (params.statusTimestampAfter !== undefined) {
      throw new UnsupportedOperationError(
        'this agent cannot filter by `statusTimestampAfter`: a session carries no time of its state. List without it.',
      );
    }
    const size = params.pageSize ?? DEFAULT_PER_PAGE;
    if (!Number.isInteger(size) || size < 1 || size > MOST_PER_PAGE) {
      throw new RequestMalformedError(
        `\`pageSize: ${size}\` is not a page: give a whole number from 1 to ${MOST_PER_PAGE}, or none for ${DEFAULT_PER_PAGE}.`,
      );
    }
    const status = params.status ?? TaskState.TASK_STATE_UNSPECIFIED;
    let snap: Snapshot;
    let offset = 0;
    if (!params.pageToken) {
      const listed = await this.run(this.ops.observe);
      const tasks = [...listed.entries()]
        .map(([name, s]: [string, Sighting]) => taskOfSighting(name, s))
        .filter(
          (t) =>
            (!params.contextId || t.contextId === params.contextId) &&
            (status === TaskState.TASK_STATE_UNSPECIFIED || t.status?.state === status),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      snap = { id: ++this.listings, contextId: params.contextId, status, tasks };
    } else {
      const m = /^([0-9]+):([0-9]+)$/.exec(params.pageToken);
      const current = m ? this.open.get(Number(m[1])) : undefined;
      if (!m || !current || Number(m[2]) > current.tasks.length) {
        throw new RequestMalformedError(
          `\`pageToken: ${params.pageToken}\` is not a page of a listing still open: list again from the first page.`,
        );
      }
      if (current.contextId !== params.contextId || current.status !== status) {
        throw new RequestMalformedError(
          'a page is asked for with other filters than its listing: ask every page with the filters of the first.',
        );
      }
      snap = current;
      offset = Number(m[2]);
    }
    const tasks = snap.tasks.slice(offset, offset + size).map((t) => (params.includeArtifacts ? t : { ...t, artifacts: [] }));
    const next = offset + size < snap.tasks.length ? `${snap.id}:${offset + size}` : '';
    if (next) {
      this.open.set(snap.id, snap);
      if (this.open.size > OPEN_LISTINGS) dropOldest(this.open);
    } else {
      this.open.delete(snap.id);
    }
    return { tasks, nextPageToken: next, pageSize: size, totalSize: snap.tasks.length };
  }

  async findSession(params: { name: string }, _context: ServerCallContext): Promise<{ sessionId: string } | null> {
    if (!this.ops.find) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness cannot find a session by name: list its sessions (listTasks).`);
    }
    if (typeof params.name !== 'string' || !nameParts(params.name)) {
      throw new RequestMalformedError(`\`${params.name}\` is not a session name: a session is named \`ae/<task>/<n>\`, n from 1.`);
    }
    const found = await this.run(this.ops.find(params.name));
    return found ? { sessionId: found.sessionId } : null;
  }

  async sessionLogs(params: { sessionId: string }, _context: ServerCallContext): Promise<{ logs: string }> {
    if (typeof params.sessionId !== 'string' || !params.sessionId) {
      throw new RequestMalformedError('the request names no session: send the id its harness lists it under as `sessionId`.');
    }
    return { logs: await this.run(this.ops.logs(params.sessionId)) };
  }

  async sessionOutput(params: OutputRequest, _context: ServerCallContext): Promise<{ output: string | null }> {
    if (!this.ops.output) {
      throw new UnsupportedOperationError(
        `the \`${this.harness}\` harness keeps no stream whole: its session's logs are what it printed (sessionLogs).`,
      );
    }
    if (typeof params.name !== 'string' || !nameParts(params.name)) {
      throw new RequestMalformedError(`\`${params.name}\` is not a session name: a session is named \`ae/<task>/<n>\`, n from 1.`);
    }
    if (params.stream !== 'stdout' && params.stream !== 'stderr') {
      throw new RequestMalformedError(`\`${String(params.stream)}\` is not a stream: ask for \`stdout\` or \`stderr\`.`);
    }
    if (params.lastBytes !== undefined && !(Number.isSafeInteger(params.lastBytes) && params.lastBytes > 0)) {
      throw new RequestMalformedError(
        `\`lastBytes: ${String(params.lastBytes)}\` is not a count of bytes: give a whole number above 0, or none.`,
      );
    }
    return { output: (await this.run(this.ops.output(params.name, params.stream, params.lastBytes))) ?? null };
  }

  async interruptSession(params: { session: { name: string; sessionId: string } }, _context: ServerCallContext): Promise<void> {
    if (!this.ops.interrupt) {
      throw new UnsupportedOperationError(
        `the \`${this.harness}\` harness cannot end a turn without ending its session: only a session on streaming input takes it.`,
      );
    }
    if (typeof params.session?.name !== 'string' || !params.session.name) {
      throw new RequestMalformedError('the request names no session: send the session by its name and the id its harness lists it under.');
    }
    await this.run(this.ops.interrupt(params.session));
  }

  async releaseSession(
    params: { session: Sighting; task: { worktree?: string | boolean } },
    _context: ServerCallContext,
  ): Promise<{ usage: Usage | null }> {
    if (!this.ops.release) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness has nothing to let go of: its registry is the record.`);
    }
    if (typeof params.session?.sessionId !== 'string' || !params.session.sessionId) {
      throw new RequestMalformedError('the request names no session: send the session as the last listing saw it.');
    }
    const used = await this.run(this.ops.release(params.session, params.task ?? {}));
    return { usage: used || null };
  }

  /**
   * A session's conversation, by its name or by its id. Answered once, never streamed, and nothing is kept. By id — the
   * Effect door's `Runner.transcript`, whose caller has the id already — the harness reads that session. By name, the
   * session's id is found afresh on every read. An attempt that has ended — or whose task settled with it open — has its session's id on
   * the record, and no registry is asked. Otherwise, and for a name no attempt is journalled under yet, since a session is
   * listed before its spawn is written, it is found by name when the harness can `find` one in flight, and observed when
   * it cannot or finds none. A registry that cannot be read this time is nothing observed, and a `find` that fails is
   * nothing found: a caller polls again, as it would a session not registered yet. The read itself answers in the
   * harness's words.
   */
  async sessionTranscript(params: TranscriptRequest, _context: ServerCallContext): Promise<Transcript | null> {
    if (!this.ops.transcript) {
      throw new UnsupportedOperationError(
        `the \`${this.harness}\` harness keeps no conversation to read: its session's logs are what it printed (sessionLogs).`,
      );
    }
    if (params.sessionId !== undefined) {
      if (params.name !== undefined) {
        throw new RequestMalformedError('the request names the session twice, by `name` and by `sessionId`: send one.');
      }
      if (typeof params.sessionId !== 'string' || !params.sessionId) {
        throw new RequestMalformedError(
          'the request names no session: send the id its harness lists it under as `sessionId`, or its name as `name`.',
        );
      }
      return this.run(this.ops.transcript(params.sessionId, params.after));
    }
    const parts = typeof params.name === 'string' ? nameParts(params.name) : undefined;
    if (!parts)
      throw new RequestMalformedError(`\`${params.name}\` is not a session name: a session is named \`ae/<task>/<n>\`, n from 1.`);
    const attempt = fold(parts.taskId, await this.events(parts.taskId)).attempts.find((a) => a.n === parts.n);
    const inFlight = attempt === undefined || attempt.ended === null;
    const found =
      !attempt?.nativeId && inFlight && this.ops.find ? await this.run(this.ops.find(params.name)).catch(() => undefined) : undefined;
    const sessionId =
      attempt?.nativeId ??
      found?.sessionId ??
      (await this.run(this.ops.observe).catch(() => new Map<string, Sighting>())).get(params.name)?.sessionId;
    if (!sessionId) return null;
    return this.run(this.ops.transcript(sessionId, params.after));
  }

  async observeSessions(
    params: { expected: readonly ExpectedSession[] },
    _context: ServerCallContext,
  ): Promise<{ tasks: Task[]; unread: string[]; why: string[]; unreadWhy: Record<string, string> }> {
    if (!this.ops.observeFor) {
      throw new UnsupportedOperationError(
        `the \`${this.harness}\` harness lists its sessions in full, told nothing: list them (listTasks).`,
      );
    }
    if (!Array.isArray(params.expected) || !params.expected.every((e) => typeof e?.name === 'string' && nameParts(e.name))) {
      throw new RequestMalformedError('`expected` is not a list of sessions: send `[{ name }]`, each name `ae/<task>/<n>`, n from 1.');
    }
    const { seen, unread, why, unreadWhy } = await this.run(this.ops.observeFor(params.expected));
    return {
      tasks: [...seen].map(([name, s]) => taskOfSighting(name, s)),
      unread: [...unread],
      why: [...(why ?? [])],
      unreadWhy: Object.fromEntries(unreadWhy ?? []),
    };
  }

  async harnessQuota(_params: Record<string, never>, _context: ServerCallContext): Promise<HarnessQuota> {
    if (!this.ops.quota) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness reports no quota: no subscription's use can be asked of it.`);
    }
    return this.run(this.ops.quota);
  }

  async forgetSession(params: ForgetRequest, _context: ServerCallContext): Promise<SessionForgotten> {
    if (!this.ops.forget) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness keeps nothing of a session to forget.`);
    }
    if (typeof params.session?.name !== 'string' || !nameParts(params.session.name)) {
      throw new RequestMalformedError('the request names no session: send `{ session: { name } }`, the name `ae/<task>/<n>`, n from 1.');
    }
    if (typeof params.dry !== 'boolean') {
      throw new RequestMalformedError(
        `\`dry: ${String(params.dry)}\` is not a yes or no: send \`dry: true\` to list, \`false\` to remove.`,
      );
    }
    return this.run(this.ops.forget(params.session, { dry: params.dry }));
  }

  async sessionKept(params: KeptRequest, _context: ServerCallContext): Promise<Record<string, SessionKept>> {
    if (!this.ops.kept) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness says nothing of where it keeps a session's files.`);
    }
    if (!Array.isArray(params.sessions) || !params.sessions.every((s) => typeof s?.name === 'string' && nameParts(s.name))) {
      throw new RequestMalformedError(
        'the request names no sessions: send `{ sessions: [{ name }] }`, each name `ae/<task>/<n>`, n from 1.',
      );
    }
    return this.run(this.ops.kept(params.sessions));
  }

  async compactSessions(params: { dry: boolean }, _context: ServerCallContext): Promise<SessionsCompacted> {
    if (!this.ops.compact) {
      throw new UnsupportedOperationError(`the \`${this.harness}\` harness keeps every capture whole: it has none to compact.`);
    }
    if (typeof params.dry !== 'boolean') {
      throw new RequestMalformedError(
        `\`dry: ${String(params.dry)}\` is not a yes or no: send \`dry: true\` to count, \`false\` to rewrite.`,
      );
    }
    return this.run(this.ops.compact({ dry: params.dry }));
  }

  async createTaskPushNotificationConfig(
    _params: TaskPushNotificationConfig,
    _context: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    throw this.noPush();
  }

  async getTaskPushNotificationConfig(
    _params: GetTaskPushNotificationConfigRequest,
    _context: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    throw this.noPush();
  }

  async listTaskPushNotificationConfigs(
    _params: ListTaskPushNotificationConfigsRequest,
    _context: ServerCallContext,
  ): Promise<ListTaskPushNotificationConfigsResponse> {
    throw this.noPush();
  }

  async deleteTaskPushNotificationConfig(_params: DeleteTaskPushNotificationConfigRequest, _context: ServerCallContext): Promise<void> {
    throw this.noPush();
  }

  /**
   * `SubscribeToTask`: the session followed live, where the driver follows it (`subscription`), and let go of as the follower goes
   * away, where the call says so (`goneOf`).
   */
  async *resubscribe(params: SubscribeToTaskRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    try {
      yield* subscription(this.harness, this.ops, params, goneOf(context));
    } catch (cause) {
      throw cause instanceof RunnerError
        ? cause.refused
          ? new UnsupportedOperationError(cause.message)
          : new HarnessFailed(cause.message)
        : cause;
    }
  }

  private noPush() {
    return new PushNotificationNotSupportedError(`the \`${this.harness}\` harness sends no notifications: poll getTask.`);
  }
}
