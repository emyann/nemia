/**
 * A remote A2A agent for the tests: the SDK's own server, over HTTP on a port the system picks, so the runtime's remote
 * harness (`src/a2a/remote.ts`) is proven against the protocol as another party speaks it, and not against our own
 * handler. Not a test file: `remote-agent.test.ts` starts one per test and closes it.
 *
 * The request handler is the SDK's `DefaultRequestHandler` over its `InMemoryTaskStore`; the executor is scripted: each
 * message a task is sent is handed to `script`, whose steps it publishes at once, and a task whose last step leaves it
 * working is held until the test `move`s it. JSON-RPC and REST are served through the SDK's express handlers, the only
 * REST server it ships. The card is served as A2A's wire JSON (`AgentCard.toJSON`, the proto JSON the specification
 * gives), or as the SDK's `agentCardHandler` serves it (`cardForm: 'sdk'`, the SDK's own objects stringified), which a
 * client must read as well, since an agent built on this SDK serves that.
 *
 * `counts` counts every call the request handler answers, by method (`sendMessage`, `getTask`, `cancelTask`, …), on
 * whichever binding it came: what the tests assert of the runtime's traffic.
 *
 * What an agent elsewhere may do is an option too: live under a path (`prefix`), serve its card at a path of its own
 * (`cardAt`), name interfaces on another origin (`interfacesAt`), answer every A2A request with a redirect (`redirectTo`),
 * or hold a request with no answer (`hanging`, switched on and off as the test goes).
 */
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AgentCard,
  Role,
  TaskState,
  type Artifact,
  type Message,
  type Part,
  type SecurityRequirement,
  type SecurityScheme,
} from '@a2a-js/sdk';
import {
  AgentEvent,
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server';
import { jsonRpcHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express';

export type Binding = 'JSONRPC' | 'HTTP+JSON' | 'GRPC';

/** A state the script moves a task to, in A2A's words. `input-required` and `auth-required` interrupt a turn; the last four end the task. */
export type StateWord = 'working' | 'input-required' | 'auth-required' | 'completed' | 'failed' | 'rejected' | 'canceled';

/**
 * One thing the agent does: an artifact published (`data`, or `text`), then a move to `state` with `words` as its status
 * message. A first turn whose first step is a `reply` makes no Task: the agent answers with that Message, `data` beside it.
 * A turn's first step with `after` is taken that many milliseconds late, and nothing of the turn is answered before it:
 * an agent slow to answer a message. With `until`, it is taken once that promise settles: an agent held until the test says.
 */
export type Step = {
  state?: StateWord;
  words?: string;
  data?: unknown;
  text?: string;
  reply?: string;
  after?: number;
  until?: Promise<unknown>;
};

/** A message the agent was sent, as its script is handed it: the turn is 1 for the message that made the task, then 2, 3… */
export type Turn = { taskId: string; contextId: string; text: string; turn: number; metadata: Record<string, unknown> | undefined };

/** What the card declares about auth, and how the server checks a request's headers against it. */
export type Security = {
  schemes: Record<string, SecurityScheme>;
  requirements: SecurityRequirement[];
  /** Whether the request's headers carry what the card asks for: a request refused here gets a 401 and reaches no handler. */
  accepts: (headers: http.IncomingHttpHeaders) => boolean;
};

export type ServerOptions = {
  /** The bindings the card lists, in its order. Default JSON-RPC then REST. gRPC is listed and never served. */
  bindings?: Binding[];
  script?: (t: Turn) => Step[];
  security?: Security;
  cardForm?: 'wire' | 'sdk';
  /** A path the whole agent lives under, `/agents/reviewer`: its card and its routes beneath it, its URL with it. */
  prefix?: string;
  /** Where the card is served, under the prefix. Default `/.well-known/agent-card.json`. */
  cardAt?: string;
  /** The base the card's interfaces are named on, in place of the server's own: another origin, say. */
  interfacesAt?: string;
  /** Every request to the A2A routes is answered 307 to this base, its path kept, and reaches no handler. */
  redirectTo?: string;
  /** Every request to the A2A routes waits this many milliseconds before it is looked at: an agent slow to answer, or to refuse. */
  slowMs?: number;
};

export type RemoteServer = {
  /** The agent's base URL, the card at `/.well-known/agent-card.json` under it. */
  url: string;
  /** The path of every request for the card, in order. */
  cards: string[];
  /** Requests held with no answer while on: the card's, and the A2A routes'. A held request ends when the server closes. */
  hanging: { card: boolean; a2a: boolean };
  counts: Record<string, number>;
  /** Every message the agent was sent, in order. */
  sent: Message[];
  /** The headers of every request that reached the A2A routes, auth refused or not. */
  headers: http.IncomingHttpHeaders[];
  /** The path of every request that reached the A2A routes, in order: which binding each call came on. */
  paths: string[];
  /** The tasks the agent made, in order. */
  tasks: () => string[];
  /** How many first turns the agent answered with a Message, making no Task. */
  replies: () => number;
  /** Move a held task on: its steps published in order, as a script's are. */
  move: (taskId: string, ...steps: Step[]) => void;
  close: () => Promise<void>;
};

const STATES: Record<StateWord, TaskState> = {
  working: TaskState.TASK_STATE_WORKING,
  'input-required': TaskState.TASK_STATE_INPUT_REQUIRED,
  'auth-required': TaskState.TASK_STATE_AUTH_REQUIRED,
  completed: TaskState.TASK_STATE_COMPLETED,
  failed: TaskState.TASK_STATE_FAILED,
  rejected: TaskState.TASK_STATE_REJECTED,
  canceled: TaskState.TASK_STATE_CANCELED,
};

/** A step after which the turn is over: the task ended, or waits on its caller. */
const endsTurn = (s: Step) => s.state !== undefined && s.state !== 'working';

const textPart = (text: string): Part => ({
  content: { $case: 'text', value: text },
  metadata: undefined,
  filename: '',
  mediaType: 'text/plain',
});

/** A card's bearer scheme named `token`, and a check of the header it asks for. */
export const bearer = (token: string): Security => ({
  schemes: { token: { scheme: { $case: 'httpAuthSecurityScheme', value: { description: '', scheme: 'Bearer', bearerFormat: '' } } } },
  requirements: [{ schemes: { token: { list: [] } } }],
  accepts: (h) => h.authorization === `Bearer ${token}`,
});

/** A card's API key named `key`, in `location` under `name`, and a check of a header that carries it. */
export const apiKey = (key: string, location: 'header' | 'query' | 'cookie' = 'header', name = 'X-Api-Key'): Security => ({
  schemes: { key: { scheme: { $case: 'apiKeySecurityScheme', value: { description: '', location, name } } } },
  requirements: [{ schemes: { key: { list: [] } } }],
  accepts: (h) => h[name.toLowerCase()] === key,
});

/** A card that asks for mutual TLS, which a plain HTTP server cannot check: every request is refused. */
export const mtls = (): Security => ({
  schemes: { cert: { scheme: { $case: 'mtlsSecurityScheme', value: { description: '' } } } },
  requirements: [{ schemes: { cert: { list: [] } } }],
  accepts: () => false,
});

/**
 * A remote agent started as `o` says, listening once it returns. Steps a `move` hands a task before its executor waits
 * for them are queued for that task, and the executor's wait is kept by task until a step, a cancel or the close ends it.
 */
export async function remoteServer(o: ServerOptions = {}): Promise<RemoteServer> {
  const bindings = o.bindings ?? ['JSONRPC', 'HTTP+JSON'];
  const script = o.script ?? (() => []);
  const counts: Record<string, number> = {};
  const sent: Message[] = [];
  const headers: http.IncomingHttpHeaders[] = [];
  const paths: string[] = [];
  const made: string[] = [];
  let replied = 0;
  const cards: string[] = [];
  const hanging = { card: false, a2a: false };
  const prefix = o.prefix ?? '';
  const turns = new Map<string, number>();
  const queued = new Map<string, Step[][]>();
  const waiting = new Map<string, (steps: Step[] | 'cancelled') => void>();
  let base = '';

  const next = (taskId: string): Promise<Step[] | 'cancelled'> => {
    const ready = queued.get(taskId)?.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => waiting.set(taskId, resolve));
  };

  const publish = (bus: ExecutionEventBus, taskId: string, contextId: string, s: Step) => {
    if (s.data !== undefined || s.text !== undefined) {
      const artifact: Artifact = {
        artifactId: `a-${Math.random().toString(36).slice(2)}`,
        name: 'result',
        description: '',
        parts: [
          s.data !== undefined
            ? { content: { $case: 'data', value: s.data }, metadata: undefined, filename: '', mediaType: '' }
            : textPart(s.text!),
        ],
        metadata: undefined,
        extensions: [],
      };
      bus.publish(AgentEvent.artifactUpdate({ taskId, contextId, artifact, append: false, lastChunk: true, metadata: undefined }));
    }
    if (s.state) {
      const message: Message | undefined =
        s.words === undefined
          ? undefined
          : {
              messageId: `m-${Math.random().toString(36).slice(2)}`,
              contextId,
              taskId,
              role: Role.ROLE_AGENT,
              parts: [textPart(s.words)],
              metadata: undefined,
              extensions: [],
              referenceTaskIds: [],
            };
      bus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: { state: STATES[s.state], message, timestamp: new Date().toISOString() },
          metadata: undefined,
        }),
      );
    }
  };

  const executor: AgentExecutor = {
    execute: async (ctx: RequestContext, bus: ExecutionEventBus) => {
      const { taskId, contextId } = ctx;
      const turn = (turns.get(taskId) ?? 0) + 1;
      const part = ctx.userMessage.parts.find((p) => p.content?.$case === 'text');
      let steps: Step[] | 'cancelled' = script({
        taskId,
        contextId,
        turn,
        metadata: ctx.userMessage.metadata,
        text: part?.content?.$case === 'text' ? part.content.value : '',
      });
      const late = steps[0]?.after;
      if (late) await new Promise((resolve) => setTimeout(resolve, late));
      if (steps[0]?.until) await steps[0].until;
      const reply = turn === 1 ? steps[0]?.reply : undefined;
      if (reply !== undefined) {
        const first = steps[0];
        replied++;
        bus.publish(
          AgentEvent.message({
            messageId: `m-${Math.random().toString(36).slice(2)}`,
            contextId,
            taskId: '',
            role: Role.ROLE_AGENT,
            parts: [
              textPart(reply),
              ...(first.data !== undefined
                ? [
                    {
                      content: { $case: 'data' as const, value: first.data as Record<string, unknown> },
                      metadata: undefined,
                      filename: '',
                      mediaType: '',
                    },
                  ]
                : []),
            ],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          }),
        );
        return;
      }
      turns.set(taskId, turn);
      if (turn === 1) made.push(taskId);
      const working = { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: new Date().toISOString() };
      bus.publish(
        AgentEvent.task(
          ctx.task
            ? { ...ctx.task, status: working }
            : { id: taskId, contextId, status: working, artifacts: [], history: [ctx.userMessage], metadata: undefined },
        ),
      );
      for (;;) {
        if (steps === 'cancelled') return;
        for (const s of steps) {
          publish(bus, taskId, contextId, s);
          if (endsTurn(s)) return;
        }
        steps = await next(taskId);
      }
    },
    cancelTask: async (taskId: string, bus: ExecutionEventBus) => {
      bus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId: '',
          metadata: undefined,
          status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() },
        }),
      );
      const wake = waiting.get(taskId);
      waiting.delete(taskId);
      wake?.('cancelled');
    },
  };

  const card = (): AgentCard => ({
    name: 'test agent',
    description: 'A remote A2A agent a test started.',
    version: '1.0.0',
    supportedInterfaces: bindings.map((b) => ({
      url: `${o.interfacesAt ?? `${base}${prefix}`}${b === 'JSONRPC' ? '/a2a/jsonrpc' : b === 'HTTP+JSON' ? '/a2a/rest' : '/a2a/grpc'}`,
      protocolBinding: b,
      tenant: '',
      protocolVersion: '1.0',
    })),
    provider: undefined,
    documentationUrl: undefined,
    iconUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: o.security?.schemes ?? {},
    securityRequirements: o.security?.requirements ?? [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [],
    signatures: [],
  });

  const handler = new DefaultRequestHandler(card(), new InMemoryTaskStore(), executor);
  const counted = new Proxy(handler, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]) => {
        counts[key] = (counts[key] ?? 0) + 1;
        if (key === 'sendMessage') sent.push((args[0] as { message: Message }).message);
        return value.apply(target, args);
      };
    },
  });

  const app = express();
  app.get(`${prefix}${o.cardAt ?? '/.well-known/agent-card.json'}`, (req, res) => {
    cards.push(req.originalUrl);
    if (hanging.card) return;
    res.json(o.cardForm === 'sdk' ? JSON.parse(JSON.stringify(card())) : AgentCard.toJSON(card()));
  });
  app.use(`${prefix}/a2a`, async (req, res, go) => {
    headers.push({ ...req.headers });
    paths.push(req.originalUrl);
    if (hanging.a2a) return;
    if (o.slowMs) await new Promise((resolve) => setTimeout(resolve, o.slowMs));
    if (o.redirectTo) {
      res.redirect(307, `${o.redirectTo}${req.originalUrl.slice(prefix.length)}`);
      return;
    }
    if (o.security && !o.security.accepts(req.headers)) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    go();
  });
  if (bindings.includes('JSONRPC'))
    app.use(`${prefix}/a2a/jsonrpc`, jsonRpcHandler({ requestHandler: counted, userBuilder: UserBuilder.noAuthentication }));
  if (bindings.includes('HTTP+JSON'))
    app.use(`${prefix}/a2a/rest`, restHandler({ requestHandler: counted, userBuilder: UserBuilder.noAuthentication }));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: `${base}${prefix}`,
    counts,
    sent,
    headers,
    paths,
    cards,
    hanging,
    tasks: () => [...made],
    replies: () => replied,
    move: (taskId, ...steps) => {
      const wake = waiting.get(taskId);
      waiting.delete(taskId);
      if (wake) wake(steps);
      else queued.set(taskId, [...(queued.get(taskId) ?? []), steps]);
    },
    close: async () => {
      for (const wake of waiting.values()) wake('cancelled');
      waiting.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
