/**
 * The MCP port, `/mcp`: how a coding agent on another machine operates this store. A stateless MCP server over Streamable HTTP, served
 * by the SDK's `createMcpHandler` in both eras — 2026-07-28 (`server/discover`, each request carrying its version in `_meta`, every
 * result its `resultType`, the tool list its `ttlMs` and `cacheScope`) and 2025-11-25 (`initialize`, each request answered on its own) —
 * a fresh low-level `Server` for each request (`portServer`), serving the tools generated from the command table (`portTools`,
 * tools.ts) in its order. A call of a tool is a request to the endpoint its verb links, presenting the caller's own `Authorization`,
 * handed to the app's own `fetch`: every middleware, refusal and memo applies to it as to any client, and nothing of tokens or refusals
 * is said again here. A 2xx answers the endpoint's JSON, as text and as `structuredContent`; anything else is the tool's error, in the
 * api's own words, which say what to do next.
 *
 * What a host reads is held here (`bound.ts`): a list is asked a page of `PORT_PAGE` where a call gives no `limit`, with the defaults
 * its link sends (`PortTool.defaults`); a list that answers a `Table` is asked for it and answered as its lines, printed by `objects`'
 * `tableLines` as `nemia` prints them, the token of the next page on a last line; and no answer passes `ANSWER_BOUND` (`answerFit`): a
 * page past it is asked again shorter, and any other answer past it refused with how to narrow it, never cut.
 *
 * The caller's token is the gate's before this is reached (`callerGate`, caller/caller.ts: `/mcp` needs a person's). While a call is
 * pending, a client that gave a progress token is told progress at once, so its answer streams from its start, and then every 30 s
 * (`PROGRESS_EVERY_MS`), so a host that ends a silent call (`nemia wait`, up to four minutes and a half) hears it is alive.
 */
import { Effect, Schedule } from 'effect';
import type { Context } from 'hono';
import { type CallToolResult, createMcpHandler, Server } from '@modelcontextprotocol/server';
import { CLI_VERBS, TABLE } from 'agent-orchestrator';
import { Api, TABLE_ACCEPT, type Table, tableLines } from 'objects';
import { ANSWER_BOUND, answerFit, PAGE_MOST, PORT_PAGE, pastTheBound } from './bound.ts';
import { PORT_INSTRUCTIONS } from './instructions.ts';
import { type PortTool, portTools } from './tools.ts';

/** How often a pending call is told as progress, where its caller gave a progress token: under any host's idle bound. */
export const PROGRESS_EVERY_MS = 30_000;

/**
 * How long a 2026-07-28 host may answer the port's `tools/list` from its cache (`ttlMs`): five minutes, the spec's own example, so a
 * daemon upgraded under a connected host shows its tools within that. A 2025-11-25 host is given none: that era has no such field.
 */
export const PORT_LIST_TTL_MS = 300_000;

/** What the port calls a tool's endpoint through: the app it is mounted on. */
export type Fetching = { readonly fetch: (request: Request) => Response | Promise<Response> };

/** The port's knobs: how often a pending call is told as progress (`PROGRESS_EVERY_MS` unless a test gives a shorter one). */
export type PortOptions = { readonly progressEveryMs?: number };

/** What the server says of itself on `initialize` and `server/discover`, beside its instructions (`PORT_INSTRUCTIONS`, instructions.ts). */
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
  const headers = new Headers({ accept: tool.table ? `${TABLE_ACCEPT}, application/json` : 'application/json' });
  const authorization = from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  if (tool.method === 'GET') return new Request(url, { method: 'GET', headers, signal });
  headers.set('content-type', 'application/json');
  const body = Object.fromEntries(Object.entries(args).filter(([key]) => !tool.pathKeys.includes(key) && !tool.queryKeys.includes(key)));
  return new Request(url, { method: tool.method, headers, body: JSON.stringify(body), signal });
}

/**
 * The arguments a call of `tool` with `args` is sent with: each default its link sends (`defaults`) for a key the call leaves out, and a
 * page of `PORT_PAGE` where its endpoint takes `limit` and the call gives none.
 */
export function argsSent(tool: PortTool, args: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const absent = (key: string) => args[key] === undefined || args[key] === null;
  const sent: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(tool.defaults)) if (absent(key)) sent[key] = value;
  if (tool.queryKeys.includes('limit') && absent('limit')) sent.limit = PORT_PAGE;
  return sent;
}

/** Whether `json` is a `Table`, as a list asked with `TABLE_ACCEPT` answers one. */
const isTable = (json: unknown): json is Table =>
  isRecord(json) && json.kind === 'Table' && Array.isArray(json.rows) && Array.isArray(json.columnDefinitions);

/**
 * The text a `Table` is answered as: its lines as `nemia <verb> -o wide` prints them, then the token of the next page where there is one;
 * where it has no row, a line saying so and the defaults `tool` sent that `args` did not lift.
 */
const tableText = (tool: PortTool, table: Table, args: Readonly<Record<string, unknown>>): string => {
  const lines = tableLines(table, { wide: true, showLabels: true, columns: [] });
  const sent = Object.entries(tool.defaults).filter(([key, value]) => args[key] === value);
  const none =
    lines.length > 0
      ? []
      : [
          `none listed${sent.length > 0 ? `, sent ${sent.map(([k, v]) => `${k}=${v}`).join(' and ')}: give ${sent.map(([k]) => `${k} ""`).join(' and ')} for every item` : ''}`,
        ];
  const next = table.metadata.continue;
  return [...lines, ...none, ...(next === undefined ? [] : [`more: call again with continue ${next}`])].join('\n');
};

/** The page `args` asks for, as `answerFit` judges it: its `limit` (no longer than `PAGE_MOST`), or null where it asks none. */
const pageOf = (tool: PortTool, args: Readonly<Record<string, unknown>>): number | null => {
  if (!tool.queryKeys.includes('limit')) return null;
  const limit = Number(args.limit);
  return Number.isInteger(limit) && limit >= 1 ? Math.min(limit, PAGE_MOST) : null;
};

/** The characters a result holds, as a host counts them: its texts and the JSON of its `structuredContent`. */
const sizeOf = (result: CallToolResult): number =>
  result.content.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 0), 0) +
  (result.structuredContent === undefined ? 0 : JSON.stringify(result.structuredContent).length);

/**
 * One answer of `app` to `tool` with `args`, as a tool's result: a 2xx's `Table` as its lines alone (`tableText`), any other JSON as text
 * and as `structuredContent` (a list as `{ items }`), or its text alone where it is not JSON; anything else the tool's error, the body's
 * `error` sentence its text.
 */
async function answerOf(
  tool: PortTool,
  args: Readonly<Record<string, unknown>>,
  from: Request,
  app: Fetching,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  const res = await app.fetch(requestOf(tool, args, from, signal));
  const text = await res.text();
  const json = jsonOf(text);
  if (res.ok) {
    if (tool.table && isTable(json)) return { content: [{ type: 'text', text: tableText(tool, json, args) }] };
    const structured = Array.isArray(json) ? { items: json } : isRecord(json) ? json : undefined;
    return { content: [{ type: 'text', text }], ...(structured === undefined ? {} : { structuredContent: structured }) };
  }
  const said = isRecord(json) && typeof json.error === 'string' ? json.error : undefined;
  return failed(
    said ?? `${tool.method} ${tool.path} answered ${res.status}${text === '' ? '' : `: ${text}`}`,
    isRecord(json) ? json : undefined,
  );
}

/**
 * A call of `tool` with `args`, answered by `app`'s own fetch of its endpoint (`answerOf`), sent with its link's defaults and the port's
 * page (`argsSent`), and held under `ANSWER_BOUND` (`answerFit`): a page past it asked again shorter, any other answer past it refused
 * with how to narrow it (`pastTheBound`), its body left out. A path name not given is refused before any request, naming it.
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
  let sent = argsSent(tool, args);
  for (;;) {
    const result = await answerOf(tool, sent, from, app, signal);
    const size = sizeOf(result);
    const fit = answerFit(size, ANSWER_BOUND, pageOf(tool, sent));
    if (fit.kind === 'answer') return result;
    if (fit.kind === 'refuse') return failed(pastTheBound(tool.name, size, ANSWER_BOUND, tool.queryKeys));
    sent = { ...sent, limit: fit.limit };
  }
}

/** A tool as `tools/list` says it: its name, description, input and hints, and nothing of how the port calls it. */
const listed = (tool: PortTool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
});

/**
 * The server that answers one request of `/mcp`, in whichever era it speaks (the SDK's `createMcpHandler` asks for one per request):
 * it says what Nemia is (`PORT_INSTRUCTIONS`) on `initialize` and on `server/discover`, lists `tools` in the order given, each list
 * cacheable by its caller alone for `PORT_LIST_TTL_MS` on 2026-07-28, and answers a call through `app` (`called`), presenting the
 * caller's own request. Its capabilities and handlers are all here: an extension the port declares, and the handler that serves it,
 * go beside these.
 */
export function portServer(tools: readonly PortTool[], appOf: () => Fetching, progressEveryMs: number): Server {
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const));
  const list = tools.map(listed);
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: PORT_INSTRUCTIONS,
    cacheHints: { 'tools/list': { ttlMs: PORT_LIST_TTL_MS, cacheScope: 'private' } },
  });
  server.setRequestHandler('tools/list', () => ({ tools: list }));
  server.setRequestHandler('tools/call', async ({ params }, ctx) => {
    const tool = byName.get(params.name);
    if (tool === undefined) return failed(`${params.name} is no tool of this port: list them (tools/list) and call one of those`);
    const from = ctx.http?.req;
    if (from === undefined) return failed(`${tool.name} is called over HTTP alone: POST the call to the api's /mcp`);
    const call = Effect.promise(() => called(tool, params.arguments ?? {}, from, appOf(), ctx.mcpReq.signal));
    const token = ctx.mcpReq._meta?.progressToken;
    if (token === undefined) return Effect.runPromise(call);
    let progress = 0;
    const told = Effect.promise(() =>
      ctx.mcpReq
        .notify({
          method: 'notifications/progress',
          params: { progressToken: token, progress: ++progress, message: `${tool.name} is still running` },
        })
        .catch(() => undefined),
    );
    const beat = told.pipe(Effect.delay(progressEveryMs), Effect.repeat(Schedule.spaced(progressEveryMs)));
    return Effect.runPromise(
      Effect.gen(function* () {
        yield* told;
        yield* Effect.forkScoped(beat);
        return yield* call;
      }).pipe(Effect.scoped),
    );
  });
  return server;
}

/**
 * The handler of `/mcp`, calling the app `appOf` gives (the app it is mounted on: `mcpPort(() => app)` in app.ts): the SDK's serving
 * entry, made once, a fresh `portServer` for each request. A 2026-07-28 request (its version in `_meta`, `server/discover` among them)
 * is answered as JSON, or as a stream where its call is told progress; a 2025-11-25 one (`initialize`, then each request on its own)
 * by the SDK's stateless leg, which streams; a GET or a DELETE is a 405, as the port keeps no stream or session of its own. The tools
 * are generated once, as the handler is made, in the command table's order.
 */
export function mcpPort(appOf: () => Fetching, { progressEveryMs = PROGRESS_EVERY_MS }: PortOptions = {}) {
  const tools = portTools(TABLE, CLI_VERBS, Api);
  const handler = createMcpHandler(() => portServer(tools, appOf, progressEveryMs), { legacy: 'stateless', responseMode: 'auto' });
  return (c: Context): Promise<Response> => handler.fetch(c.req.raw);
}
