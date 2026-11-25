/**
 * The MCP port, `/mcp`: how a coding agent on another machine operates this store. A stateless MCP server over Streamable HTTP, served by
 * the SDK's `createMcpHandler` in both eras of the spec — the modern (`server/discover`, each request carrying its version in `_meta`,
 * every result its `resultType`, the tool list its `ttlMs` and `cacheScope`) and the legacy (`initialize`, each request answered on its
 * own) — a fresh `McpServer` for each request (`portServer`), serving the tools generated from the command table (`portTools`, tools.ts)
 * in its order, set by hand on its low-level `server`. A call of a tool is a request to the endpoint its verb links, presenting the
 * caller's own `Authorization`, handed to the app's own `fetch`: every middleware, refusal and memo applies to it as to any client, and
 * nothing of tokens or refusals is said again here. A 2xx answers the endpoint's JSON, as text and as `structuredContent`, and a file the
 * api serves as its bytes as a `resource_link` to it, never its bytes (links.ts); anything else is the tool's error, in the api's own
 * words, which say what to do next.
 *
 * What a host reads is held here (`bound.ts`): a list is asked a page of `PORT_PAGE` where a call gives no `limit`, with the defaults its
 * link sends (`PortTool.defaults`); a list that answers a `Table` is asked for it and answered as its lines, printed by `objects`'
 * `tableLines` as `nemia` prints them, the token of the next page on a last line; and no answer passes `ANSWER_BOUND` (`answerFit`): a
 * page past it is asked again shorter, and any other answer past it refused with how to narrow it, never cut.
 *
 * The feed is offered as resources too, its views' templates read off the `Api` (resources.ts): in the modern era the server
 * declares `resources.subscribe`, and a `subscriptions/listen` naming views is held here (`listened`) while the SDK's own listen router
 * acknowledges it and writes each `notifications/resources/updated` the views publish through its `notify` (views.ts); a 2025-era
 * server lists and reads them alone.
 *
 * Nemia's skills are served by MCP's Skills extension (`io.modelcontextprotocol/skills`): her skills folder whole (the orchestrator's
 * `NEMIA_SKILLS`, `operate` among them, her role said to a session outside the store), each skill at `skill://<name>/SKILL.md` with its
 * files beside it, listed by `skills/list`, answered by `skills/get` and read by `resources/read`, the same for every caller and changed
 * only by a release. The SDK's own catalog serves them (`SkillCatalog`, attached to each request's server), never handlers of the
 * port's: it checks each file it reads against the digest and size it published. The entry reads the folder once (`loadSkills` in
 * app.ts) and hands the port the catalog. Since the catalog registers its template through the `McpServer`, which then owns the
 * `resources/*` methods, the feed's templates and the files a tool hands over are registered through it too (`servesFeed`).
 *
 * A modern call that declares MCP's tasks extension, of a tool whose link says a task (`LinkTask`, `objects`), is answered as a task the
 * caller reads with `tasks/get` (tasks.ts): followed through the endpoint that reads what the call started, keeping nothing, or asked
 * again and held in the port's memory; every other call is answered as before, the legacy era's always.
 *
 * The caller's token is the gate's before this is reached (`callerGate`, caller/caller.ts: `/mcp` needs a person's). While a call is
 * pending, a client that gave a progress token is told progress at once, so its answer streams from its start, and then every 30 s
 * (`PROGRESS_EVERY_MS`), so a host that ends a silent call (`nemia wait`, up to four minutes and a half) hears it is alive.
 */
import { Effect, Option, Predicate, Schedule, Schema } from 'effect';
import type { Context } from 'hono';
import {
  type CallToolResult,
  createMcpHandler,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  INVALID_PARAMS,
  type McpHttpHandler,
  type McpRequestContext,
  McpServer,
  ProtocolError,
  readRequestBody,
  ResourceNotFoundError,
  ResourceTemplate,
  type ServerContext,
  type Tool,
} from '@modelcontextprotocol/server';
import type { SkillCatalog } from '@modelcontextprotocol/server/ext/skills';
import { CLI_VERBS, TABLE } from 'agent-orchestrator';
import { Api, type ReadBound, READS, TABLE_ACCEPT, type Table, tableLines } from 'objects';
import { ANSWER_BOUND, answerFit, narrowingOf, PAGE_MOST, PORT_PAGE, pastTheBound } from './bound.ts';
import { FILES_EXTENSION, inlined } from './files.ts';
import { fileRead, fileUriOf, linkOf } from './links.ts';
import { PORT_INSTRUCTIONS } from './instructions.ts';
import { FEED_TEMPLATES, type FeedView, SCHEME, viewOf } from './resources.ts';
import {
  createdOf,
  declaresTasks,
  followedTask,
  HELD_KEEP_MS,
  HELD_MOST,
  HELD_MOST_MS,
  type HeldTasks,
  heldTasks,
  servesTasks,
  TASKS_EXTENSION,
  taskAnswerOf,
} from './tasks.ts';
import { type PortTool, portTools } from './tools.ts';
import { type FeedViews, feedViews } from './views.ts';

/** How often a pending call is told as progress, where its caller gave a progress token: under any host's idle bound. */
export const PROGRESS_EVERY_MS = 30_000;

/**
 * How long a host of the modern era may answer the port's `tools/list` from its cache (`ttlMs`): five minutes, the spec's own example, so a
 * daemon upgraded under a connected host shows its tools within that. A legacy host is given none: its era has no such field.
 */
export const PORT_LIST_TTL_MS = 300_000;

/**
 * How long a host of the modern era may answer the skills' lists and files from its cache: as long as the tool list
 * (`PORT_LIST_TTL_MS`), by its caller alone, since they change only with a release. Given to the catalog as the entry loads it.
 */
export const SKILLS_CACHE_HINT = { ttlMs: PORT_LIST_TTL_MS, cacheScope: 'private' } as const;

/** The catalog of skills the port serves, as the entry loads it from her skills folder. */
export type PortSkills = SkillCatalog;

/** What the port calls a tool's endpoint through: the app it is mounted on. */
export type Fetching = { readonly fetch: (request: Request) => Response | Promise<Response> };

/**
 * The port's knobs: how often a pending call is told as progress (`PROGRESS_EVERY_MS` unless a test gives a shorter one), and the most
 * tasks it holds at work and how long each asks again (`HELD_MOST` and `HELD_MOST_MS`, tasks.ts, unless a test gives others).
 */
export type PortOptions = { readonly progressEveryMs?: number; readonly heldMost?: number; readonly heldBoundMs?: number };

/** What the server says of itself on `initialize` and `server/discover`, beside its instructions (`PORT_INSTRUCTIONS`, instructions.ts). */
const SERVER_INFO = { name: 'nemia', version: '1' };

/** A value of a call's arguments as a path segment or a query value says it: a string as it is, anything else as its JSON. */
const asText = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** A tool's error: `text`, which says what to do next, and the body it was read off where there is one. */
const failed = (text: string, body?: Readonly<Record<string, unknown>>) =>
  ({
    isError: true,
    content: [{ type: 'text', text }],
    ...(body === undefined ? {} : { structuredContent: body }),
  }) satisfies CallToolResult;

/** `text` read as JSON, or none where it is not. */
const jsonOf = (text: string) => Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text));

/**
 * The request a call of `tool` with `args` makes of the api, from the request `from` that carried it: the path's names filled in and
 * encoded, the query's keys as its query (each value of a list once), every other key as its JSON body on any method but a GET (`{}`
 * where there is none, `content-type: application/json` always, so the write guard takes it), and the caller's `Authorization`.
 * @param tool The tool called: its endpoint's path, method and keys.
 * @param args The call's arguments, by key.
 * @param from The request to the port that carried the call, whose address and Authorization are taken.
 * @param signal What aborts the request, where one is given.
 */
export function requestOf(tool: PortTool, args: Readonly<Record<string, unknown>>, from: Request, signal?: AbortSignal) {
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
 * page of `PORT_PAGE` where its endpoint takes `limit` and the call gives none, nor a `last` of a read from a cursor, which takes one
 * of the two alone.
 * @param tool The tool called: its link's defaults and its endpoint's keys.
 * @param args The call's arguments, by key.
 */
export function argsSent(tool: PortTool, args: Readonly<Record<string, unknown>>) {
  const absent = (key: string) => args[key] === undefined || args[key] === null;
  const sent: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(tool.defaults)) if (absent(key)) sent[key] = value;
  if (tool.queryKeys.includes('limit') && absent('limit') && countKeyOf(tool, sent) === 'limit') sent.limit = PORT_PAGE;
  return sent;
}

/** Whether `json` is a `Table`, as a list asked with `TABLE_ACCEPT` answers one. */
const isTable = (json: unknown): json is Table =>
  Predicate.isObject(json) && json.kind === 'Table' && Array.isArray(json.rows) && Array.isArray(json.columnDefinitions);

/**
 * The text a `Table` is answered as: its lines as `nemia <verb> -o wide` prints them, then the token of the next page where there is one;
 * where it has no row, a line saying so and the defaults `tool` sent that `args` did not lift.
 */
const tableText = (tool: PortTool, table: Table, args: Readonly<Record<string, unknown>>) => {
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

/** How `tool`'s endpoint is bounded (`objects`' `READS`), where it is a read. */
const readOf = (tool: PortTool) => (tool.method === 'GET' ? (READS as Readonly<Record<string, ReadBound>>)[tool.endpoint] : undefined);

/**
 * The key that counts the page `args` asks of `tool`: a list's `limit`; a read from a cursor's `last` where the call asks the last
 * events, its `limit` otherwise; none for a read of neither.
 */
const countKeyOf = (tool: PortTool, args: Readonly<Record<string, unknown>>) => {
  const shape = readOf(tool)?.shape;
  if (shape === 'cursor' && tool.queryKeys.includes('last') && args.last !== undefined && args.last !== null) return 'last';
  return tool.queryKeys.includes('limit') && (shape === undefined || shape === 'page' || shape === 'cursor') ? 'limit' : null;
};

/**
 * The page `args` asks for, as `answerFit` judges it: its count (`countKeyOf`, no longer than `PAGE_MOST`), or null where it asks none.
 */
const pageOf = (tool: PortTool, args: Readonly<Record<string, unknown>>) => {
  const key = countKeyOf(tool, args);
  if (key === null) return null;
  const count = Number(args[key]);
  return Number.isInteger(count) && count >= 1 ? Math.min(count, PAGE_MOST) : null;
};

/** The characters a result holds, as a host counts them: its texts and the JSON of its `structuredContent`. */
const sizeOf = (result: CallToolResult) =>
  result.content.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 0), 0) +
  (result.structuredContent === undefined ? 0 : JSON.stringify(result.structuredContent).length);

/** A 2xx's `text`, read as `json`, as `tool`'s result: a `Table` as its lines alone, any other JSON as text and as `structuredContent`. */
const answered = (tool: PortTool, args: Readonly<Record<string, unknown>>, text: string, json: unknown) => {
  if (tool.table && isTable(json)) return { content: [{ type: 'text', text: tableText(tool, json, args) }] } satisfies CallToolResult;
  const structured = Array.isArray(json) ? { items: json } : Predicate.isObject(json) ? json : undefined;
  return {
    content: [{ type: 'text', text }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  } satisfies CallToolResult;
};

/**
 * One answer of `app` to `tool` with `args`, as a tool's result: a 2xx's file (a `bytes` read) as a link to it alone (`linkOf`), never its
 * bytes; a 2xx's `Table` as its lines alone (`tableText`), any other JSON as text
 * and as `structuredContent` (a list as `{ items }`), or its text alone where it is not JSON; anything else the tool's error, the body's
 * `error` sentence its text.
 */
async function answerOf(tool: PortTool, args: Readonly<Record<string, unknown>>, from: Request, app: Fetching, signal?: AbortSignal) {
  const request = requestOf(tool, args, from, signal);
  const res = await app.fetch(request);
  if (res.ok && readOf(tool)?.shape === 'bytes') {
    await res.body?.cancel();
    return { content: [linkOf(new URL(request.url), res.headers)] } satisfies CallToolResult;
  }
  const text = await res.text();
  const json = jsonOf(text);
  if (res.ok) return answered(tool, args, text, json);
  const said = Predicate.isObject(json) && typeof json.error === 'string' ? json.error : undefined;
  return failed(
    said ?? `${tool.method} ${tool.path} answered ${res.status}${text === '' ? '' : `: ${text}`}`,
    Predicate.isObject(json) ? json : undefined,
  ) satisfies CallToolResult;
}

/**
 * A call of `tool` with `args`, answered by `app`'s own fetch of its endpoint (`answerOf`), sent with its link's defaults and the port's
 * page (`argsSent`), and held under `ANSWER_BOUND` (`answerFit`): a page past it asked again shorter — a list's `limit` halved, a read
 * from a cursor's `last` or `limit` (`countKeyOf`) — any other answer past it refused with how to narrow it (`pastTheBound`, the read's
 * own keys in `READS`), its body left out. A path name not given is refused before any request, naming it; a card's file given inline is
 * uploaded first (`inlined`, files.ts), and its upload refused is the call's error.
 * @param tool The tool called.
 * @param args The call's arguments, by key.
 * @param from The request to the port that carried the call.
 * @param app The app whose fetch answers the call.
 * @param signal What aborts the call, where one is given.
 */
export async function called(tool: PortTool, args: Readonly<Record<string, unknown>>, from: Request, app: Fetching, signal?: AbortSignal) {
  const missing = tool.pathKeys.filter((key) => args[key] === undefined || args[key] === null || args[key] === '');
  if (missing.length > 0)
    return failed(
      `${tool.name} needs ${missing.join(' and ')}: give each in its arguments (${tool.path})`,
    ) satisfies CallToolResult as CallToolResult;
  const given = tool.fileKeys.length === 0 ? { args } : await inlined(tool.fileKeys, args, { fetch: app.fetch, from, signal });
  if ('refused' in given) return failed(`${tool.name} was not called: ${given.refused}`) satisfies CallToolResult as CallToolResult;
  let sent = argsSent(tool, given.args);
  for (;;) {
    const result = await answerOf(tool, sent, from, app, signal);
    const size = sizeOf(result);
    const fit = answerFit(size, ANSWER_BOUND, pageOf(tool, sent));
    if (fit.kind === 'answer') return result satisfies CallToolResult as CallToolResult;
    const key = countKeyOf(tool, sent);
    if (fit.kind === 'refuse' || key === null)
      return failed(
        pastTheBound(tool.name, size, ANSWER_BOUND, narrowingOf(readOf(tool)?.narrow, tool.queryKeys, sent)),
      ) satisfies CallToolResult as CallToolResult;
    sent = { ...sent, [key]: fit.limit };
  }
}

/**
 * A call of `tool` with `args` answered as a task: a followed tool is called as before (`called`), its error answered as it is, then the
 * thing its answer names read once (`followedTask`) — the read `tasks/get` makes — and answered as its task, or as before where that read
 * finds none; a tool asked again is begun in `held`, and answered as its task.
 * @param tool The tool called, whose link says its task.
 * @param args The call's arguments, by key.
 * @param from The request to the port that carried the call.
 * @param app The app whose fetch answers the call.
 * @param held The tasks the port holds in its memory.
 * @param signal What aborts the call.
 */
export async function taskCalled(
  tool: PortTool,
  args: Readonly<Record<string, unknown>>,
  from: Request,
  app: Fetching,
  held: HeldTasks,
  signal: AbortSignal,
) {
  const task = tool.task;
  if (task === null) return called(tool, args, from, app, signal);
  if (task.kind === 'again')
    return createdOf(held.start(task, args, from, (sent, sender, legSignal) => called(tool, sent, sender, app, legSignal)));
  const result = await called(tool, args, from, app, signal);
  const id = Predicate.isObject(result.structuredContent) ? result.structuredContent[task.idKey] : undefined;
  if (result.isError === true || typeof id !== 'string') return result;
  const read = await followedTask(`${tool.name}:${id}`, task, id, from, app);
  return read.kind === 'task' ? createdOf(read.task) : result;
}

/**
 * A tool as `tools/list` says it: its name, description, input and hints, and nothing of how the port calls it. Its input is JSON by
 * construction (`Schema.toJsonSchemaDocument`, tools.ts), which the SDK's type says as JSON values where ours says `unknown`.
 */
const listed = (tool: PortTool) =>
  ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Tool['inputSchema'],
    annotations: tool.annotations,
  }) satisfies Tool as Tool;

/** The era a request of `/mcp` speaks, as the SDK tells the factory: `modern` (its version in `_meta`) or `legacy`. */
type Era = McpRequestContext['era'];

/**
 * The template of every URI of the port's scheme no feed template matches as written — a feed with no selector or two, a file a tool
 * handed over as a link (links.ts) — so each is read by the same read as the feed's.
 */
const FILE_TEMPLATE = {
  uriTemplate: `${SCHEME}://{+path}`,
  name: 'files',
  title: 'A file a tool handed over',
  description: `A file the api serves, as a tool hands it over as a resource_link (${SCHEME}:///api/...): read it with resources/read.`,
} as const;

/**
 * A read of `uri` of the port's scheme: a file a tool handed over as a link (links.ts), read through the app `appOf` gives with the
 * caller's token; else a view of the feed, answered from `views` (its newest events, under `ANSWER_BOUND`), a URI that names none refused
 * as a resource not found, in words naming the templates, and one the api refuses with its words.
 */
async function feedRead(uri: string, ctx: ServerContext, views: FeedViews, appOf: () => Fetching) {
  const file = fileUriOf(uri);
  const named = viewOf(uri);
  if (file === undefined && named.kind === 'none') throw new ResourceNotFoundError(uri, named.message);
  const from = ctx.http?.req;
  if (from === undefined) throw new ProtocolError(INVALID_PARAMS, `${uri} is read over HTTP alone: POST the read to the api's /mcp`);
  if (file !== undefined) {
    const read = await fileRead(uri, file, from, appOf());
    if (read.kind === 'refused') throw new ProtocolError(INVALID_PARAMS, read.message);
    return { contents: [read.content] };
  }
  if (named.kind === 'none') throw new ResourceNotFoundError(uri, named.message);
  const text = await views.read(named.view, from);
  if (typeof text !== 'string') throw new ProtocolError(INVALID_PARAMS, text.refused);
  return { contents: [{ uri, mimeType: 'application/json', text }] };
}

/**
 * The feed's resources on `mcp`, each registered through it: the templates read off the `Api` (`FEED_TEMPLATES`, resources.ts), and last
 * the template of every other URI of the port's scheme (`FILE_TEMPLATE`), each read by `feedRead`, from the URI as the SDK parsed it.
 * None is listed by name: the feed is its templates.
 */
function servesFeed(mcp: McpServer, views: FeedViews, appOf: () => Fetching) {
  const templates: readonly { uriTemplate: string; name: string; title: string; description: string; mimeType?: string }[] = [
    ...FEED_TEMPLATES,
    FILE_TEMPLATE,
  ];
  for (const { uriTemplate, name, title, description, mimeType } of templates)
    mcp.registerResource(
      name,
      new ResourceTemplate(uriTemplate, { list: undefined }),
      { title, description, ...(mimeType === undefined ? {} : { mimeType }) },
      (uri, _variables, ctx) => feedRead(uri.href, ctx, views, appOf),
    );
}

/**
 * The server that answers one request of `/mcp`, in whichever era it speaks (the SDK's `createMcpHandler` asks for one per request):
 * it says what Nemia is (`PORT_INSTRUCTIONS`) on `initialize` and on `server/discover`, lists `tools` in the order given, each list
 * cacheable by its caller alone for `PORT_LIST_TTL_MS` in the modern era, and answers a call through `app` (`called`), presenting the
 * caller's own request; it serves `skills` by the Skills extension (the SDK's catalog, attached first, its `skill://` template and its
 * methods its own). Its capabilities and handlers are all here: an extension the port declares, and the handler that serves it, go
 * beside these. In the modern era it declares the tasks extension and serves its methods (`servesTasks`, tasks.ts), and a call that
 * declares it, of a tool whose link says a task, is answered as one where `taskAnswerOf` says so (`taskCalled`).
 * @param tools The port's tools, listed in this order.
 * @param appOf What gives the app a call is answered by.
 * @param progressEveryMs How often a call that asks for progress is told it, in milliseconds.
 * @param skills The catalog of Nemia's skills the server serves.
 * @param feed The era the request speaks, the feed's views and the tasks the port holds, where the feed is offered as resources and
 *   tasks are served; none where they are not.
 */
export function portServer(
  tools: readonly PortTool[],
  appOf: () => Fetching,
  progressEveryMs: number,
  skills: PortSkills,
  feed?: { readonly era: Era; readonly views: FeedViews; readonly held: HeldTasks },
) {
  const modern = feed?.era === 'modern' ? feed : undefined;
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const));
  const list = tools.map(listed);
  const mcp = new McpServer(SERVER_INFO, {
    capabilities: { extensions: modern === undefined ? FILES_EXTENSION : { ...FILES_EXTENSION, ...TASKS_EXTENSION } },
    instructions: PORT_INSTRUCTIONS,
    cacheHints: {
      'tools/list': { ttlMs: PORT_LIST_TTL_MS, cacheScope: 'private' },
      'resources/read': { ttlMs: 0, cacheScope: 'private' },
    },
  });
  skills.attach(mcp);
  const server = mcp.server;
  server.registerCapabilities({ tools: {} });
  if (feed !== undefined) {
    servesFeed(mcp, feed.views, appOf);
    if (feed.era === 'modern') server.registerCapabilities({ resources: { subscribe: true } });
  }
  if (modern !== undefined) servesTasks(server, tools, appOf, modern.held);
  server.setRequestHandler('tools/list', () => ({ tools: list }));
  server.setRequestHandler('tools/call', async ({ params }, ctx) => {
    const tool = byName.get(params.name);
    if (tool === undefined) return failed(`${params.name} is no tool of this port: list them (tools/list) and call one of those`);
    const from = ctx.http?.req;
    if (from === undefined) return failed(`${tool.name} is called over HTTP alone: POST the call to the api's /mcp`);
    const answer = taskAnswerOf({
      era: feed?.era ?? 'legacy',
      declared: declaresTasks(ctx.mcpReq.envelope),
      kind: tool.task?.kind ?? 'none',
      held: modern?.held.live() ?? 0,
      most: modern?.held.most ?? 0,
    });
    if (answer === 'task' && modern !== undefined)
      return taskCalled(tool, params.arguments ?? {}, from, appOf(), modern.held, ctx.mcpReq.signal);
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
  return mcp;
}

/** The URIs a `subscriptions/listen` request asks `notifications/resources/updated` of, or none where `body` is no such request. */
const subscribedIn = (body: unknown) => {
  if (!Predicate.isObject(body) || body.method !== 'subscriptions/listen' || !Predicate.isObject(body.params))
    return undefined satisfies { readonly id: unknown; readonly uris: readonly string[] } | undefined as
      | { readonly id: unknown; readonly uris: readonly string[] }
      | undefined;
  const filter = body.params.notifications;
  if (!Predicate.isObject(filter) || !Array.isArray(filter.resourceSubscriptions))
    return undefined satisfies { readonly id: unknown; readonly uris: readonly string[] } | undefined as
      | { readonly id: unknown; readonly uris: readonly string[] }
      | undefined;
  const uris = filter.resourceSubscriptions.filter((uri): uri is string => typeof uri === 'string');
  return (uris.length === 0 ? undefined : { id: body.id, uris: [...new Set(uris)] }) satisfies
    | { readonly id: unknown; readonly uris: readonly string[] }
    | undefined as { readonly id: unknown; readonly uris: readonly string[] } | undefined;
};

/** A JSON-RPC error answering the request `id`, in band (HTTP 200), as the SDK's listen router answers its own refusals. */
const rpcRefused = (id: unknown, message: string) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code: INVALID_PARAMS, message } }, { status: 200 }) satisfies Response;

/** `body` read off `request` within the SDK's bound, as JSON, or none where it is past it or no JSON. */
const bodyOf = async (request: Request) => {
  const read = await readRequestBody(request, DEFAULT_MAX_REQUEST_BODY_SIZE).catch(() => undefined);
  if (read === undefined || read.tooLarge) return undefined;
  return jsonOf(read.text);
};

/**
 * Every view `wanted` names held for one stream, each closing it where the api closes the view (`closing`): the releases, or the api's
 * refusal of one, the views held before it let go again.
 */
async function heldAll(views: FeedViews, wanted: readonly FeedView[], from: Request, closing: () => void) {
  const releases: (() => void)[] = [];
  for (const view of wanted) {
    const held = await views.hold(view, from, closing);
    if (held.kind === 'refused') {
      for (const release of releases) release();
      return { refused: `${view.uri}: ${held.message}` } satisfies
        | { readonly releases: readonly (() => void)[] }
        | { readonly refused: string } as { readonly releases: readonly (() => void)[] } | { readonly refused: string };
    }
    releases.push(held.release);
  }
  return { releases } satisfies { readonly releases: readonly (() => void)[] } | { readonly refused: string } as
    | { readonly releases: readonly (() => void)[] }
    | { readonly refused: string };
}

/**
 * `response`'s body, handed on as it is read, and `releases` let go once when it ends, when its reader cancels it, when `signal` aborts or
 * when `end` is called (a view closed by the api), which cancels the SDK's stream so its listen is torn down too.
 */
function releasedWith(response: Response, releases: readonly (() => void)[], signal: AbortSignal) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    signal.removeEventListener('abort', finish);
    for (const release of releases) release();
  };
  signal.addEventListener('abort', finish, { once: true });
  const reader = response.body?.getReader();
  if (reader === undefined) return (finish(), { response, end: finish });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read().catch(() => ({ done: true as const, value: undefined }));
      if (next.done) return (finish(), controller.close());
      controller.enqueue(next.value);
    },
    cancel: (reason) => (finish(), reader.cancel(reason)),
  });
  const end = () => (finish(), void reader.cancel().catch(() => undefined));
  return { response: new Response(body, { status: response.status, headers: response.headers }), end };
}

/**
 * One request of `/mcp` through `handler`: a `subscriptions/listen` that asks for resources has each URI judged a view (`viewOf`), any
 * other refused -32602 naming the templates and nothing held; each view held for its stream (`views`, the caller's token judged by the
 * list), then the request handed to the SDK, whose listen router acknowledges it and writes each `notifications/resources/updated`; its
 * views let go as its stream ends, is cancelled or its request aborts. Any other request is the SDK's, its body read once.
 * @param request The request of the port.
 * @param handler The SDK's handler of the port.
 * @param views The feed's views, which hold each URI subscribed to.
 */
export async function listened(request: Request, handler: McpHttpHandler, views: FeedViews) {
  if (request.method !== 'POST') return handler.fetch(request);
  const body = await bodyOf(request.clone());
  const asked = subscribedIn(body);
  if (asked === undefined) return handler.fetch(request, body === undefined ? undefined : { parsedBody: body });
  const named = asked.uris.map(viewOf);
  const wanted: FeedView[] = [];
  for (const one of named) {
    if (one.kind === 'none') return rpcRefused(asked.id, one.message);
    wanted.push(one.view);
  }
  let end = () => {};
  const held = await heldAll(views, wanted, request, () => end());
  if ('refused' in held) return rpcRefused(asked.id, held.refused);
  const answered = releasedWith(await handler.fetch(request, { parsedBody: body }), held.releases, request.signal);
  end = answered.end;
  return answered.response;
}

/**
 * The handler of `/mcp`, calling the app `appOf` gives (the app it is mounted on: `mcpPort(() => app)` in app.ts): the SDK's serving
 * entry, made once, a fresh `portServer` for each request. A modern request (its version in `_meta`, `server/discover` among them)
 * is answered as JSON, or as a stream where its call is told progress; a legacy one (`initialize`, then each request on its own)
 * by the SDK's stateless leg, which streams; a GET or a DELETE is a 405, as the port keeps no stream or session of its own. The tools
 * are generated once, as the handler is made, in the command table's order, and the tasks it holds in its memory made once beside them
 * (`heldTasks`, tasks.ts), which `liveTasks()` counts at work; the skills are the catalog `skills` holds once it is loaded, which each
 * request waits on, and a catalog that failed to load fails each request of `/mcp` alone.
 * @param appOf What gives the app the port is mounted on.
 * @param skills The catalog of Nemia's skills, as the entry loads it (`loadSkills` over the orchestrator's `NEMIA_SKILLS`).
 */
export function mcpPort(
  appOf: () => Fetching,
  skills: Promise<PortSkills>,
  { progressEveryMs = PROGRESS_EVERY_MS, heldMost = HELD_MOST, heldBoundMs = HELD_MOST_MS }: PortOptions = {},
) {
  const tools = portTools(TABLE, CLI_VERBS, Api);
  const views: FeedViews = feedViews(appOf, (uri) => handler.notify.resourceUpdated(uri));
  const held = heldTasks({ most: heldMost, boundMs: heldBoundMs, keepMs: HELD_KEEP_MS });
  const handler = createMcpHandler(async (ctx) => portServer(tools, appOf, progressEveryMs, await skills, { era: ctx.era, views, held }), {
    legacy: 'stateless',
    responseMode: 'auto',
  });
  const served = (c: Context) => listened(c.req.raw, handler, views);
  return Object.assign(served, { liveViews: () => views.live(), liveTasks: () => held.live() });
}
