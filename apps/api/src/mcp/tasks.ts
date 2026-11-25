/**
 * The MCP port's tasks: MCP's tasks extension (`io.modelcontextprotocol/tasks`, of the modern era, its wire shapes taken from
 * `@modelcontextprotocol/ext-tasks`' `core/v2`), which lets a server answer a `tools/call` with a task the caller reads with `tasks/get`
 * and may cancel with `tasks/cancel`. The port answers one where the request is of the modern era, declares the extension in its own
 * capabilities (`declaresTasks`) and the tool's link says how (`LinkTask` in `objects`' command table), as `taskAnswerOf` decides
 * (`contracts/task-answer.contract.ts`); every other call is answered as before. A tool's link says one of two ways:
 *
 * - `follow`: the call started something durable another endpoint reads. The task's id is `<tool>:<the answer's id>`, and the port keeps
 *   nothing: each `tasks/get` reads that endpoint again with the reader's own token, the api judging it, and says where it stands by its
 *   phase (`followedStateOf`, `contracts/followed-state.contract.ts`), so the task outlives the daemon's restart. The one read the call
 *   makes before it answers is the read a `tasks/get` makes, so the task is created before the answer is sent. A cancel is acknowledged
 *   and stops nothing: no endpoint stops it, and the extension's cancellation is cooperative.
 * - `again`: the port asks the endpoint again from the cursor its answer gave until an answer says it is done, a leg errs, or
 *   `HELD_MOST_MS` passes (`heldTasks`), the task held in the api's memory under a random id, bound to its creator's token, kept
 *   `HELD_KEEP_MS` after its time and lost at a restart, which the extension allows; at most `HELD_MOST` are at work at once. A cancel
 *   interrupts its legs.
 *
 * An id no task of the caller's has, one whose time is past, or one lost at a restart is refused -32602, as the extension asks.
 */
import { createHash, randomUUID } from 'node:crypto';
import { Effect, Exit, Fiber, Option, Predicate, Schema } from 'effect';
import {
  type CallToolResult,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  ProtocolError,
  type Server,
  type ServerContext,
} from '@modelcontextprotocol/server';
import {
  CancelTaskRequestV2Schema,
  type CreateTaskResultV2,
  type DetailedTaskV2,
  DetailedTaskV2Schema,
  GetTaskRequestV2Schema,
  hasTaskClientCapabilityV2,
  TASKS_EXTENSION_ID_V2,
  UpdateTaskRequestV2Schema,
} from '@modelcontextprotocol/ext-tasks/core/v2';
import type { ToolWords } from 'objects';
import type { FollowedStateOf } from '../../contracts/followed-state.contract.ts';
import type { TaskAnswerOf } from '../../contracts/task-answer.contract.ts';
import type { Fetching } from './port.ts';
import type { PortTool } from './tools.ts';

export type { TaskAnswer, TaskAsked, TaskEra, TaskKind } from '../../contracts/task-answer.contract.ts';
export type { FollowedState } from '../../contracts/followed-state.contract.ts';

/** The tasks extension as the port declares it among its capabilities' `extensions`: an empty object says it is supported. */
export const TASKS_EXTENSION = { [TASKS_EXTENSION_ID_V2]: {} };

/** The most tasks the port holds at work in its memory at once; a call past it is answered as before. */
export const HELD_MOST = 32;

/** How long a held task asks again before it ends with the last answer it was given: an hour. */
export const HELD_MOST_MS = 3_600_000;

/** How long a held task is kept past its time, its result read again: an hour, as a host asks of a finished task at least. */
export const HELD_KEEP_MS = 3_600_000;

/** How often a caller is asked to read a followed task: ten seconds, for a job that runs longer than a minute. */
export const FOLLOW_POLL_MS = 10_000;

/** How often a caller is asked to read a held task: five seconds. */
export const HELD_POLL_MS = 5_000;

/**
 * Whether a request's capabilities, as the SDK lifts them off its `_meta` (`ctx.mcpReq.envelope`), declare the tasks extension.
 * @param envelope The request's envelope: its version, client and capabilities, by their reserved keys.
 */
export const declaresTasks = (envelope: unknown) => hasTaskClientCapabilityV2({ _meta: envelope });

/**
 * How a call is answered: a task where the request is modern, declares the extension and the tool's link says a task — a followed one
 * always, a held one while fewer than the most are held — and as before otherwise.
 * @param asked The request's era and declaration, the link's kind of task, and the held tasks and their most.
 */
export const taskAnswerOf: TaskAnswerOf = (asked) => {
  if (asked.era !== 'modern' || !asked.declared) return 'plain';
  if (asked.kind === 'follow') return 'task';
  if (asked.kind === 'again' && asked.held < asked.most) return 'task';
  return 'plain';
};

/**
 * Where a followed task stands by the phase its read answers: succeeded or failed on a phase the link names so, at work on any other.
 * @param phase The phase the read answered.
 * @param succeeded The phases that end it well.
 * @param failed The phases that end it badly.
 */
export const followedStateOf: FollowedStateOf = (phase, succeeded, failed) => {
  if (succeeded.includes(phase)) return 'succeeded';
  if (failed.includes(phase)) return 'failed';
  return 'working';
};

/** A task as `tasks/get` answers it, in the extension's shape. */
export type PortTask = DetailedTaskV2;

/** How a tool answers as a task, as the port reads it off its link (`objects`' `ToolTask`). */
type ToolTask = NonNullable<ToolWords['task']>;

/** A followed task's link, as the port reads it off its tool. */
type Followed = Extract<ToolTask, { readonly kind: 'follow' }>;

/** A link's task the port asks again. */
type AskedAgain = Extract<ToolTask, { readonly kind: 'again' }>;

/** `text` read as JSON, or none where it is not. */
const jsonOf = (text: string) => Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text));

/** A time in milliseconds as the extension writes one: ISO 8601. */
const isoOf = (ms: number) => new Date(ms).toISOString();

/**
 * A task's answer to a `tools/call`, in place of its result: the task, flat, its `resultType` `task`, and the empty `content` the SDK
 * adds to a tool's result that has none (`normalizeContentlessToolResult`), which the extension's open `Result` admits.
 * @param task The task created.
 */
export const createdOf = (task: PortTask) => {
  const { taskId, status, createdAt, lastUpdatedAt, ttlMs, pollIntervalMs } = task;
  const created = {
    resultType: 'task',
    taskId,
    status,
    createdAt,
    lastUpdatedAt,
    ttlMs,
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
  } satisfies CreateTaskResultV2;
  return { ...created, content: [] } satisfies CallToolResult;
};

/** The refusal of an id no task of the caller's has: -32602, as the extension asks of `tasks/get`, `tasks/update` and `tasks/cancel`. */
const unknownTask = (taskId: string) =>
  new ProtocolError(INVALID_PARAMS, `no task ${taskId} of yours is held: it ended long ago or was lost at a restart; call the tool again`);

/** Who owns a task: the SHA-256 of the `Authorization` the request presented, never the token itself. */
const ownerOf = (from: Request) =>
  createHash('sha256')
    .update(from.headers.get('authorization') ?? '')
    .digest('hex');

/** A request that carries no more of `from` than its address and its `Authorization`, as a later leg is sent with. */
const bareOf = (from: Request) => {
  const authorization = from.headers.get('authorization');
  return new Request(from.url, { headers: authorization === null ? {} : { authorization } });
};

/** The fields every task of the port carries, but its status. */
type TaskBase = Pick<PortTask, 'taskId' | 'createdAt' | 'lastUpdatedAt' | 'ttlMs' | 'pollIntervalMs'>;

/** A completed task of `base` carrying `result`, as JSON, checked by the extension's own schema of a task. */
const completedOf = (base: TaskBase, result: CallToolResult) =>
  DetailedTaskV2Schema.parse({ ...base, status: 'completed', result: jsonOf(JSON.stringify(result)) });

/** What a read of a followed task answers: the task, the read refused (`unknown`), or the read failed (`failed`, the api's words). */
type FollowedRead =
  | { readonly kind: 'task'; readonly task: PortTask }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The followed task `taskId` of the tool `tool`, of the thing `id`: read through `app` from `task`'s endpoint with `from`'s own
 * `Authorization`, and said by its phase (`followedStateOf`) — at work, or completed with the read's answer as the tool's result, an error
 * of it where it failed. A 4xx is a task unknown to the caller; anything else not a 2xx, a read that failed.
 * @param taskId The task's id.
 * @param task The link's followed task: its read, the keys of its answer and its phases.
 * @param id The id of the thing the call started.
 * @param from The request that asks, whose address and `Authorization` are taken.
 * @param app The app whose fetch answers the read.
 */
export async function followedTask(taskId: string, task: Followed, id: string, from: Request, app: Fetching) {
  const url = new URL(task.path.replace(`:${task.pathKey}`, encodeURIComponent(id)), from.url);
  const headers = new Headers({ accept: 'application/json' });
  const authorization = from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  const res = await app.fetch(new Request(url, { headers }));
  const text = await res.text();
  const json = jsonOf(text);
  if (res.status >= 400 && res.status < 500) return { kind: 'unknown' } satisfies FollowedRead as FollowedRead;
  if (!res.ok || !Predicate.isObject(json))
    return { kind: 'failed', message: `GET ${url.pathname} answered ${res.status}: ${text}` } satisfies FollowedRead as FollowedRead;
  const now = isoOf(Date.now());
  const since = json[task.since];
  const phase = json[task.phase];
  const base = {
    taskId,
    createdAt: typeof since === 'string' ? since : now,
    lastUpdatedAt: now,
    ttlMs: null,
    pollIntervalMs: FOLLOW_POLL_MS,
  };
  const state = followedStateOf(typeof phase === 'string' ? phase : '', task.succeeded, task.failed);
  if (state === 'working') return { kind: 'task', task: { ...base, status: 'working' } } satisfies FollowedRead as FollowedRead;
  const result = {
    content: [{ type: 'text', text }],
    structuredContent: json,
    ...(state === 'failed' ? { isError: true } : {}),
  } satisfies CallToolResult;
  return { kind: 'task', task: completedOf(base, result) } satisfies FollowedRead as FollowedRead;
}

/** One leg of a held task: the tool called with `args`, aborted by `signal`. */
export type Leg = (args: Readonly<Record<string, unknown>>, from: Request, signal: AbortSignal) => Promise<CallToolResult>;

/** A held task's status, as the extension names those the port gives one. */
type HeldStatus = 'working' | 'completed' | 'failed' | 'cancelled';

/** A task held in the port's memory: its id, its owner, its times, where it stands, its last answer and the fiber asking. */
type Held = {
  readonly id: string;
  readonly owner: string;
  readonly createdAt: number;
  updatedAt: number;
  status: HeldStatus;
  result: CallToolResult | undefined;
  error: string | undefined;
  fiber: Fiber.Fiber<void> | undefined;
};

/** A held task as `tasks/get` answers it, its time to live `ttlMs`: completed with its last answer, failed, cancelled or at work. */
const heldDetailOf = (held: Held, ttlMs: number) => {
  const base = {
    taskId: held.id,
    createdAt: isoOf(held.createdAt),
    lastUpdatedAt: isoOf(held.updatedAt),
    ttlMs,
    pollIntervalMs: HELD_POLL_MS,
  };
  if (held.status === 'completed' && held.result !== undefined) return completedOf(base, held.result);
  if (held.status === 'failed')
    return {
      ...base,
      status: 'failed',
      error: { code: INTERNAL_ERROR, message: held.error ?? 'the task failed: call the tool again' },
    } satisfies PortTask as PortTask;
  return { ...base, status: held.status === 'cancelled' ? 'cancelled' : 'working' } satisfies PortTask as PortTask;
};

/**
 * The legs of `held`, asked one after another: `leg` with `args`, then with the cursor each answer gave under the link's `from`, sent as
 * `sender`, until an answer holds the link's `until` or no cursor, a leg errs, or `boundMs` has passed since it began; each answer kept
 * as its result. It ends `completed`, or `failed` where a leg threw; interrupted, it leaves the status its cancel set.
 */
const askedAgain = (held: Held, task: AskedAgain, args: Readonly<Record<string, unknown>>, sender: Request, leg: Leg, boundMs: number) =>
  Effect.onExit(
    Effect.gen(function* () {
      let sent = args;
      for (;;) {
        const result = yield* Effect.promise((signal) => leg(sent, sender, signal));
        held.result = result;
        held.updatedAt = Date.now();
        const said = Predicate.isObject(result.structuredContent) ? result.structuredContent : {};
        const next = said[task.cursor];
        const done = result.isError === true || said[task.until.key] === task.until.value || typeof next !== 'string';
        if (done || Date.now() >= held.createdAt + boundMs) return;
        sent = { ...sent, [task.from]: next };
      }
    }),
    (exit) =>
      Effect.sync(() => {
        if (held.status !== 'working') return;
        held.updatedAt = Date.now();
        if (Exit.isSuccess(exit)) held.status = 'completed';
        else if (!Exit.hasInterrupts(exit)) {
          held.status = 'failed';
          held.error = `${String(Exit.isFailure(exit) ? exit.cause : '')}: call the tool again`;
        }
      }),
  );

/** The bounds of the held tasks: the most at work at once, how long one asks again, and how long it is kept past that. */
export type HeldBounds = { readonly most: number; readonly boundMs: number; readonly keepMs: number };

/**
 * The tasks the port holds in its memory: `start` begins one, asking again leg after leg (`leg`, the tool called with the call's own
 * arguments and the last cursor under the link's `from`) until an answer holds the link's `until`, a leg errs, or `boundMs` passes, its
 * result the last answer; `owned` reads one by its id for its owner alone; `cancel` interrupts one at work; `live` counts those at work.
 * A task past `boundMs` and `keepMs` from its start is dropped as the table is next read, its legs interrupted.
 * @param bounds The most at work at once, how long one asks again, and how long it is kept past that, in milliseconds.
 */
export function heldTasks({ most, boundMs, keepMs }: HeldBounds) {
  const table = new Map<string, Held>();
  const stop = (held: Held) => {
    const fiber = held.fiber;
    if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
  };
  const reap = () => {
    const now = Date.now();
    for (const [id, held] of table)
      if (now > held.createdAt + boundMs + keepMs) {
        stop(held);
        table.delete(id);
      }
  };
  const live = () => {
    reap();
    return [...table.values()].filter((held) => held.status === 'working').length;
  };
  const start = (task: AskedAgain, args: Readonly<Record<string, unknown>>, from: Request, leg: Leg) => {
    reap();
    const now = Date.now();
    const held: Held = {
      id: randomUUID(),
      owner: ownerOf(from),
      createdAt: now,
      updatedAt: now,
      status: 'working',
      result: undefined,
      error: undefined,
      fiber: undefined,
    };
    table.set(held.id, held);
    held.fiber = Effect.runFork(askedAgain(held, task, args, bareOf(from), leg, boundMs));
    return heldDetailOf(held, boundMs + keepMs);
  };
  const owned = (id: string, from: Request) => {
    reap();
    const held = table.get(id);
    return held !== undefined && held.owner === ownerOf(from) ? held : undefined;
  };
  const cancel = (held: Held) => {
    if (held.status !== 'working') return;
    held.status = 'cancelled';
    held.updatedAt = Date.now();
    stop(held);
  };
  return {
    most,
    start,
    live,
    has: (id: string) => table.has(id),
    get: (id: string, from: Request) => {
      const held = owned(id, from);
      return held === undefined ? undefined : heldDetailOf(held, boundMs + keepMs);
    },
    cancel: (id: string, from: Request) => {
      const held = owned(id, from);
      if (held === undefined) return false;
      cancel(held);
      return true;
    },
  };
}

/** The tasks the port holds in its memory (`heldTasks`). */
export type HeldTasks = ReturnType<typeof heldTasks>;

/** The followed tool and thing a task id names (`<tool>:<id>`), or none where no tool of `tools` follows by that name. */
const followedOf = (tools: readonly PortTool[], taskId: string) => {
  const at = taskId.indexOf(':');
  if (at <= 0) return undefined;
  const tool = tools.find((one) => one.name === taskId.slice(0, at));
  const task = tool?.task;
  return task?.kind === 'follow' && at + 1 < taskId.length ? { task, id: taskId.slice(at + 1) } : undefined;
};

/** The request a task request was carried by, or a refusal where it came by no HTTP. */
const fromOf = (ctx: ServerContext) => {
  const from = ctx.http?.req;
  if (from === undefined) throw new ProtocolError(INVALID_PARAMS, "a task is read over HTTP alone: POST the request to the api's /mcp");
  return from;
};

/**
 * The task `taskId` as the caller of `from` may read it: held, or followed by a read through `app`; refused -32602 where it is neither of
 * theirs, and as an internal error where a followed read failed.
 */
async function taskOf(taskId: string, from: Request, tools: readonly PortTool[], app: Fetching, held: HeldTasks) {
  const kept = held.get(taskId, from);
  if (kept !== undefined) return kept;
  const followed = held.has(taskId) ? undefined : followedOf(tools, taskId);
  if (followed === undefined) throw unknownTask(taskId);
  const read = await followedTask(taskId, followed.task, followed.id, from, app);
  if (read.kind === 'unknown') throw unknownTask(taskId);
  if (read.kind === 'failed') throw new ProtocolError(INTERNAL_ERROR, `${read.message}: read the task again`);
  return read.task;
}

/**
 * The extension's methods on `server` (each a custom method the SDK admits on the modern era): `tasks/get` answers the task (`taskOf`);
 * `tasks/cancel` interrupts a held task and acknowledges a followed one, which goes on; `tasks/update` is acknowledged for a task of the
 * caller's, since none of the port's asks for input. Each is refused -32602 for an id no task of the caller's has. `tasks/update`'s
 * params are the extension's narrowed to their `taskId`: the SDK lifts `inputResponses` off every request before its handler validates
 * them (`ctx.mcpReq.inputResponses`), so the extension's whole schema would refuse every update.
 * @param server The server of one request.
 * @param tools The port's tools, whose links say which follow what they started.
 * @param appOf What gives the app a followed task is read through.
 * @param held The tasks the port holds in its memory.
 */
export function servesTasks(server: Server, tools: readonly PortTool[], appOf: () => Fetching, held: HeldTasks) {
  server.setRequestHandler('tasks/get', { params: GetTaskRequestV2Schema.shape.params }, async ({ taskId }, ctx) =>
    taskOf(taskId, fromOf(ctx), tools, appOf(), held),
  );
  server.setRequestHandler('tasks/cancel', { params: CancelTaskRequestV2Schema.shape.params }, async ({ taskId }, ctx) => {
    const from = fromOf(ctx);
    if (!held.cancel(taskId, from)) await taskOf(taskId, from, tools, appOf(), held);
    return {};
  });
  server.setRequestHandler(
    'tasks/update',
    { params: UpdateTaskRequestV2Schema.shape.params.pick({ taskId: true }) },
    async ({ taskId }, ctx) => {
      await taskOf(taskId, fromOf(ctx), tools, appOf(), held);
      return {};
    },
  );
}
