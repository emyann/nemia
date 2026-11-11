/**
 * The MCP port, `/mcp`: how a coding agent on another machine operates this store. A stateless MCP server over Streamable
 * HTTP, built afresh for each request (the SDK's low-level `Server` and its web-standard transport, no session), serving the tools
 * generated from the command table (`portTools`, tools.ts). A call of a tool is a request to the endpoint its verb links, presenting the
 * caller's own `Authorization`, handed to the app's own `fetch`: every middleware, refusal and memo applies to it as to any client, and
 * nothing of tokens or refusals is said again here. A 2xx answers the endpoint's JSON, as text and as `structuredContent`; anything else
 * is the tool's error, in the api's own words, which say what to do next.
 *
 * The caller's token is the gate's before this is reached (`callerGate`, caller/caller.ts: `/mcp` needs a person's). While a call is
 * pending, a client that gave a progress token is told progress every 30 s (`PROGRESS_EVERY_MS`), so a host that ends a silent call
 * (`nemia wait`, up to four minutes and a half) hears it is alive.
 */
import { Effect, Schedule } from 'effect';
import type { Context } from 'hono';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { type CallToolResult, CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CLI_VERBS, TABLE } from 'agent-orchestrator';
import { Api } from 'objects';
import { type PortTool, portTools } from './tools.ts';

/** How often a pending call is told as progress, where its caller gave a progress token: under any host's idle bound. */
export const PROGRESS_EVERY_MS = 30_000;

/** What the port calls a tool's endpoint through: the app it is mounted on. */
export type Fetching = { readonly fetch: (request: Request) => Response | Promise<Response> };

/** The port's knobs: how often a pending call is told as progress (`PROGRESS_EVERY_MS` unless a test gives a shorter one). */
export type PortOptions = { readonly progressEveryMs?: number };

/** What the server says of itself on `initialize`. */
const SERVER_INFO = { name: 'nemia', version: '1' };

/** A value of a call's arguments as a path segment or a query value says it: a string as it is, anything else as its JSON. */
const asText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** Whether `value` is a record, as a JSON body or a call's arguments are. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A tool's error: `text`, which says what to do next, and the body it was read off where there is one. */
const failed = (text: string, body?: Readonly<Record<string, unknown>>): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text }],
  ...(body === undefined ? {} : { structuredContent: body }),
});

/** `text` read as JSON, or none where it is not. */
const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The request a call of `tool` with `args` makes of the api, from the request `from` that carried it: the path's names filled in and
 * encoded, the query's keys as its query (each value of a list once), every other key as its JSON body on any method but a GET (`{}`
 * where there is none, `content-type: application/json` always, so the write guard takes it), and the caller's `Authorization`.
 */
export function requestOf(tool: PortTool, args: Readonly<Record<string, unknown>>, from: Request, signal?: AbortSignal): Request {
  const filled = tool.path.replace(/:([A-Za-z]+)/g, (_, key: string) => encodeURIComponent(asText(args[key])));
  const url = new URL(filled, from.url);
  for (const key of tool.queryKeys) {
    const value = args[key];
    if (value === undefined || value === null) continue;
    for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, asText(one));
  }
  const headers = new Headers({ accept: 'application/json' });
  const authorization = from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  if (tool.method === 'GET') return new Request(url, { method: 'GET', headers, signal });
  headers.set('content-type', 'application/json');
  const body = Object.fromEntries(Object.entries(args).filter(([key]) => !tool.pathKeys.includes(key) && !tool.queryKeys.includes(key)));
  return new Request(url, { method: tool.method, headers, body: JSON.stringify(body), signal });
}

/**
 * A call of `tool` with `args`, answered by `app`'s own fetch of its endpoint: a 2xx its JSON as text and as `structuredContent` (a list
 * as `{ items }`), or its text alone where it is not JSON; anything else the tool's error, the body's `error` sentence its text. A path
 * name not given is refused before any request, naming it.
 */
export async function called(
  tool: PortTool,
  args: Readonly<Record<string, unknown>>,
  from: Request,
  app: Fetching,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  const missing = tool.pathKeys.filter((key) => args[key] === undefined || args[key] === null || args[key] === '');
  if (missing.length > 0) return failed(`${tool.name} needs ${missing.join(' and ')}: give each in its arguments (${tool.path})`);
  const res = await app.fetch(requestOf(tool, args, from, signal));
  const text = await res.text();
  const json = jsonOf(text);
  if (res.ok) {
    const structured = Array.isArray(json) ? { items: json } : isRecord(json) ? json : undefined;
    return { content: [{ type: 'text', text }], ...(structured === undefined ? {} : { structuredContent: structured }) };
  }
  const said = isRecord(json) && typeof json.error === 'string' ? json.error : undefined;
  return failed(
    said ?? `${tool.method} ${tool.path} answered ${res.status}${text === '' ? '' : `: ${text}`}`,
    isRecord(json) ? json : undefined,
  );
}

/** Whether `body`, a JSON-RPC message or a batch, holds a call that asked to be told progress: its answer is then a stream. */
const asksProgress = (body: unknown): boolean =>
  (Array.isArray(body) ? body : [body]).some(
    (m) => isRecord(m) && isRecord(m.params) && isRecord(m.params._meta) && m.params._meta.progressToken !== undefined,
  );

/** A tool as `tools/list` says it: its name, description, input and hints, and nothing of how the port calls it. */
const listed = (tool: PortTool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
});

/**
 * The handler of `/mcp`, calling the app `appOf` gives (the app it is mounted on: `mcpPort(() => app)` in app.ts). A POST is one
 * JSON-RPC message or a batch, answered as JSON, or as a stream where a call asked to be told progress; any other method is a 405, as a
 * stateless server opens no stream of its own. The tools are generated once, as the handler is made.
 */
export function mcpPort(appOf: () => Fetching, { progressEveryMs = PROGRESS_EVERY_MS }: PortOptions = {}) {
  const tools = portTools(TABLE, CLI_VERBS, Api);
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const));
  return async (c: Context): Promise<Response> => {
    if (c.req.method !== 'POST')
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'The port keeps no stream: POST each JSON-RPC message to /mcp' } },
        405,
        { allow: 'POST' },
      );
    const from = c.req.raw;
    const body: unknown = await from
      .clone()
      .json()
      .catch(() => undefined);
    const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: tools.map(listed) }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
      const tool = byName.get(params.name);
      if (tool === undefined) return failed(`${params.name} is no tool of this port: list them (tools/list) and call one of those`);
      const call = Effect.promise(() => called(tool, params.arguments ?? {}, from, appOf(), extra.signal));
      const token = params._meta?.progressToken;
      if (token === undefined) return Effect.runPromise(call);
      let progress = 0;
      const told = Effect.promise(() =>
        extra
          .sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, progress: ++progress, message: `${tool.name} is still running` },
          })
          .catch(() => undefined),
      );
      const beat = told.pipe(Effect.delay(progressEveryMs), Effect.repeat(Schedule.spaced(progressEveryMs)));
      return Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.forkScoped(beat);
          return yield* call;
        }).pipe(Effect.scoped),
      );
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: !asksProgress(body),
    });
    await server.connect(transport);
    return transport.handleRequest(from, body === undefined ? {} : { parsedBody: body });
  };
}
