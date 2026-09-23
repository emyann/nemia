/**
 * One harness as an A2A agent: the SDK's public `A2ARequestHandler`, over the driver the runtime already had.
 *
 * It holds no truth. Every answer is derived afresh from the harness (`ops.observe`) and the journal (`events`, folded),
 * so a restarted runtime answers at once, for sessions it never started. The one thing it keeps is the snapshot behind
 * a `listTasks` page token, which lives between the pages of one listing and is replaced by the next.
 *
 * Not the SDK's `DefaultRequestHandler`: that one runs an `AgentExecutor` against a `TaskStore` it writes, and a store
 * the handler writes is a second record beside the journal — the thing a level-triggered runtime cannot have. This is
 * the same interface, so the SDK's HTTP transports can serve it by URL later (stage 6) without a change here.
 *
 * `sendMessage` is a spawn, `listTasks` an observe, `getTask` one session's view, `cancelTask` a stop. What the runtime
 * has no use for — streaming, push notifications, an extended card — is refused in the SDK's own errors, never taken and
 * ignored.
 */
import { Effect } from 'effect';
import { TaskState } from '@a2a-js/sdk';
import type {
  AgentCard, CancelTaskRequest, DeleteTaskPushNotificationConfigRequest, GetExtendedAgentCardRequest,
  GetTaskPushNotificationConfigRequest, GetTaskRequest, ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse, ListTasksRequest, ListTasksResponse, Message, SendMessageRequest, StreamResponse,
  SubscribeToTaskRequest, Task, TaskPushNotificationConfig,
} from '@a2a-js/sdk';
import type { A2ARequestHandler, ServerCallContext } from '@a2a-js/sdk/server';
import {
  ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, RequestMalformedError, TaskNotCancelableError,
  TaskNotFoundError, UnsupportedOperationError,
} from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import { fold, type Event, type Sighting } from './domain.ts';
import { RunnerError, type RunnerOps } from './runner.ts';
import {
  canceledTask, failedSpawnTask, messageRefusal, nameParts, spawnOf, startedTask, taskOfAttempt, taskOfSighting,
} from './a2a-map.ts';

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

/** A harness's card: what it is called, and that it answers a message once and is polled after. */
export const cardOf = (harness: string): AgentCard => ({
  name: harness,
  description: `The \`${harness}\` harness: one agent session per task, started by a message and polled until it ends.`,
  supportedInterfaces: [], provider: undefined, version: '1',
  capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
  securitySchemes: {}, securityRequirements: [], defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
  skills: [], signatures: [],
});

/** Every listed session, as one listing saw them: the pages of that listing are served from here. */
type Snapshot = { id: number; contextId: string; status: TaskState; tasks: Task[] };

export class HarnessHandler implements A2ARequestHandler {
  private readonly harness: string;
  private readonly ops: RunnerOps;
  private readonly events: (taskId: string) => Promise<readonly Event[]>;
  private snapshot: Snapshot | undefined;
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
    return cardOf(this.harness);
  }

  async getAuthenticatedExtendedAgentCard(_params: GetExtendedAgentCardRequest, _context: ServerCallContext): Promise<AgentCard> {
    throw new ExtendedAgentCardNotConfiguredError(`the \`${this.harness}\` harness has no extended card: its card is the whole of it.`);
  }

  /**
   * A spawn. The session starts, or the harness says why not: `WORKING`; `REJECTED` when it vouched nothing started;
   * `SUBMITTED`, with its words, when a session may yet exist. The answer is the spawn's, never the session's end.
   */
  async sendMessage(params: SendMessageRequest, _context: ServerCallContext): Promise<Message | Task> {
    if (params.configuration?.returnImmediately !== true) {
      throw new UnsupportedOperationError('this agent answers once the session starts: send returnImmediately and poll getTask.');
    }
    if (!params.message) throw new RequestMalformedError('the request has no message: a spawn is one user message.');
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

  async *sendMessageStream(_params: SendMessageRequest, _context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    throw new UnsupportedOperationError('this agent does not stream: send the message with returnImmediately and poll getTask.');
  }

  /**
   * One session: as the harness sees it, or, when it lists no such session, as the journal records the attempt — open,
   * or how it ended. Neither knows it: `TaskNotFoundError`.
   */
  async getTask(params: GetTaskRequest, _context: ServerCallContext): Promise<Task> {
    const seen = (await this.run(this.ops.observe)).get(params.id);
    if (seen) return taskOfSighting(params.id, seen);
    const parts = nameParts(params.id);
    const attempt = parts && fold(parts.taskId, await this.events(parts.taskId)).attempts.find((a) => a.n === parts.n);
    if (!attempt) throw new TaskNotFoundError(`no session \`${params.id}\`: the \`${this.harness}\` harness lists none, and no attempt was journalled under it.`);
    return taskOfAttempt(params.id, attempt, randomUUID());
  }

  /**
   * A stop. A live session is stopped and answered `CANCELED`, as is one already stopped, as A2A answers a repeat cancel.
   * One that finished on its own cannot be: `TaskNotCancelableError`. A stop the harness failed throws its words.
   */
  async cancelTask(params: CancelTaskRequest, _context: ServerCallContext): Promise<Task> {
    const seen = (await this.run(this.ops.observe)).get(params.id);
    if (!seen) throw new TaskNotFoundError(`no session \`${params.id}\` for the \`${this.harness}\` harness to stop: it lists none.`);
    if (seen.state === 'done' || seen.state === 'failed') {
      throw new TaskNotCancelableError(`session \`${params.id}\` has ended (${seen.state}): there is nothing to stop.`);
    }
    if (seen.state !== 'stopped') await this.run(this.ops.stop(seen.sessionId));
    return canceledTask(params.id);
  }

  /**
   * Every session the harness lists, by name, filtered by `contextId` and `status`. The first page observes once; the
   * pages after it are served from that listing by its token, `<listing>:<offset>`, and a token of an older listing is
   * refused rather than served a list that moved under it.
   */
  async listTasks(params: ListTasksRequest, _context: ServerCallContext): Promise<ListTasksResponse> {
    if (params.statusTimestampAfter !== undefined) {
      throw new UnsupportedOperationError('this agent cannot filter by `statusTimestampAfter`: a session carries no time of its state. List without it.');
    }
    const size = params.pageSize ?? DEFAULT_PER_PAGE;
    if (!Number.isInteger(size) || size < 1 || size > MOST_PER_PAGE) {
      throw new RequestMalformedError(`\`pageSize: ${size}\` is not a page: give a whole number from 1 to ${MOST_PER_PAGE}, or none for ${DEFAULT_PER_PAGE}.`);
    }
    const status = params.status ?? TaskState.TASK_STATE_UNSPECIFIED;
    let snap: Snapshot;
    let offset = 0;
    if (!params.pageToken) {
      const listed = await this.run(this.ops.observe);
      const tasks = [...listed.entries()]
        .map(([name, s]: [string, Sighting]) => taskOfSighting(name, s))
        .filter((t) => (!params.contextId || t.contextId === params.contextId)
          && (status === TaskState.TASK_STATE_UNSPECIFIED || t.status!.state === status))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      snap = this.snapshot = { id: ++this.listings, contextId: params.contextId, status, tasks };
    } else {
      const m = /^([0-9]+):([0-9]+)$/.exec(params.pageToken);
      const current = this.snapshot;
      if (!m || !current || Number(m[1]) !== current.id || Number(m[2]) > current.tasks.length) {
        throw new RequestMalformedError(`\`pageToken: ${params.pageToken}\` is not a page of the latest listing: list again from the first page.`);
      }
      if (current.contextId !== params.contextId || current.status !== status) {
        throw new RequestMalformedError('a page is asked for with other filters than its listing: ask every page with the filters of the first.');
      }
      snap = current;
      offset = Number(m[2]);
    }
    const tasks = snap.tasks.slice(offset, offset + size);
    const next = offset + size < snap.tasks.length ? `${snap.id}:${offset + size}` : '';
    return { tasks, nextPageToken: next, pageSize: size, totalSize: snap.tasks.length };
  }

  async createTaskPushNotificationConfig(_params: TaskPushNotificationConfig, _context: ServerCallContext): Promise<TaskPushNotificationConfig> {
    throw this.noPush();
  }

  async getTaskPushNotificationConfig(_params: GetTaskPushNotificationConfigRequest, _context: ServerCallContext): Promise<TaskPushNotificationConfig> {
    throw this.noPush();
  }

  async listTaskPushNotificationConfigs(_params: ListTaskPushNotificationConfigsRequest, _context: ServerCallContext): Promise<ListTaskPushNotificationConfigsResponse> {
    throw this.noPush();
  }

  async deleteTaskPushNotificationConfig(_params: DeleteTaskPushNotificationConfigRequest, _context: ServerCallContext): Promise<void> {
    throw this.noPush();
  }

  async *resubscribe(_params: SubscribeToTaskRequest, _context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    throw new UnsupportedOperationError('this agent does not stream: poll getTask.');
  }

  private noPush() {
    return new PushNotificationNotSupportedError(`the \`${this.harness}\` harness sends no notifications: poll getTask.`);
  }
}

