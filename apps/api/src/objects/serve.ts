/**
 * The mount: every request under `/api/` no Hono route before it answered, handed to the one web handler built from `objects`' `Api`
 * (`HttpApiBuilder.layer(Api)` with its groups' handlers, `HttpRouter.toWebHandler`, sharing the app runtime's memo map). app.ts mounts it
 * with one line, `.all(MOUNT, mount(runtime))` (endpoints.ts), after the routes still on Hono: a path the `Api` gains is served once its
 * handler is given in `objectsHandler`, with nothing else to change.
 *
 * Each request runs in `served`, after the app's runtime, `saidRequest`, `callerGate` and the write guard (`writeGuard`, guard.ts), and is
 * handed on with the request's services (`ServedNow`): so a handler reads the app's one informer, its `StoreRoot`, its place and its memo,
 * the request says one line, and its reads are counted (`POLL_READS`). A handler of a namespaced kind is placed in its namespace's factory
 * by `answeredIn` (refused.ts), never by a route.
 *
 * Every list the `Api` serves is watched (`watchable`, src/watch/watch.ts): a GET whose endpoint's success is a `<Kind>List`, read off the
 * `Api` (`listAt`, `endpointOf` in endpoints.ts), never off a hand list. The Event lists' watch follows the feed instead of reading it
 * again (`eventsFollowed`), and the Run lists' compares a run leaving out its frame's time measured to the read (`runWatchVersion`).
 *
 * What HttpApi answers on its own is said in the api's words, as every other refusal of the api: a request its decoding refuses — a path's
 * name, a query or a body its endpoint's Schema does not take — is a 400 `BadRequest` naming the refused key (`field`,
 * `payload.spec.steps`) and pointing at the document (`decodeRefused`); a body over `OBJECT_BODY_LIMIT` a 413 naming the limit; and a path
 * no endpoint serves the api's own 404 (`noRoute`), whatever router missed it.
 */
import { ByteSize, Context, Effect, Layer, SchemaIssue } from 'effect';
import { HttpIncomingMessage, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder, HttpApiError } from 'effect/http-api';
import type { Context as RequestContext } from 'hono';
import { runWatchVersion } from 'agent-orchestrator';
import { Api } from 'objects';
import { type ApiEnv, type ApiRuntime, served } from '../layer.ts';
import { cardsHandlers } from './cards.ts';
import {
  builtinHandlers,
  factoriesHandlers,
  hiresHandlers,
  mcpServersHandlers,
  schedulesHandlers,
  volumesHandlers,
} from '../factory/index.ts';
import { agentsHandlers, skillsHandlers, workflowsHandlers } from '../definitions/index.ts';
import { delegationsHandlers, proposalsHandlers } from '../proposals/index.ts';
import { endpointOf } from './endpoints.ts';
import { ServedNow } from './refused.ts';
import { runsHandlers } from './runs.ts';
import { stepsHandlers } from '../steps/index.ts';
import { type Listed, watchable } from '../watch/watch.ts';
import { discoveryHandlers } from '../discovery/discovery.ts';
import { eventsFollowed, eventsHandlers, subscriptionsHandlers } from '../feed-objects/index.ts';
import { templatesHandlers } from '../template-objects/templates.ts';

/** Where every path the api serves is listed, with what each takes. */
const DOCUMENT = 'GET /openapi/v3/nemia/v1';

/**
 * The most a write's body may be: 1 MiB. The largest object a client writes today is a skill whose body is a whole SKILL.md, 46 KB for
 * the largest in this repository (the orchestrator's `nemia/skills/verbs`), and a workflow written whole with its steps' prompts is
 * about 32 KB (sdlc's `build`): 1 MiB is twenty times the largest, and far below what holding a body in memory costs the api.
 */
export const OBJECT_BODY_LIMIT = ByteSize.mebibytes(1);

/** The limit as a refusal says it: its unit and its bytes. */
const OBJECT_BODY_LIMIT_SAID = `${ByteSize.format(OBJECT_BODY_LIMIT)} (${Number(OBJECT_BODY_LIMIT)} bytes)`;

/**
 * A path no route serves, a retired one among them (`/api/factories/:factory/servers`, `…/hires/:step`, `…/schedules/:workflow`), in the
 * api's words: a 404 naming the restart that makes a client and the api one build, and where the paths it serves are listed.
 */
export function noRoute(c: RequestContext<ApiEnv>): Response {
  return c.json(
    {
      error: `${c.req.method} ${new URL(c.req.url).pathname} is no route of this api, which a client of another build may still ask: restart the daemon with \`nemia service restart\` so the two are one build, or ask a path ${DOCUMENT} lists.`,
    },
    404,
  );
}

/** Each issue of a refused decode, as Standard Schema says it: its path within the request's part. */
const issuesOf = SchemaIssue.makeFormatterStandardSchemaV1();

/** The key a refused decode names, from the request's part it is in: `payload.spec.steps`, `query.limit`, `params.name`. */
const fieldOf = (error: HttpApiError.HttpApiSchemaError): string => {
  const first = issuesOf(error.cause.issue).issues[0];
  const path = (first?.path ?? []).map((segment) => String(typeof segment === 'object' ? segment.key : segment));
  return [error.kind.toLowerCase(), ...path].join('.');
};

/**
 * A request HttpApi's decoding refused — its path's names, its query, its body (`HttpApiSchemaError`, which HttpApi answers with an empty
 * 400) — answered `BadRequest`, its refused key in `field` and the document named; an encoding of an answer that failed is left as it is,
 * a 500 its reporters say.
 */
const decodeRefused = HttpRouter.middleware(
  (httpEffect) =>
    Effect.catchDefect(httpEffect, (defect) => {
      if (!HttpApiError.HttpApiSchemaError.is(defect) || defect.kind === 'Body' || defect.kind === 'ResponseHeaders')
        return Effect.die(defect);
      return Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const field = fieldOf(defect);
        return HttpServerResponse.jsonUnsafe(
          {
            error: `${request.method} ${new URL(request.url, 'http://api').pathname} does not read as its route takes it: \`${field}\` is not what it takes. Send it in that shape: ${DOCUMENT} says each key and value.`,
            field,
          },
          { status: 400 },
        );
      });
    }),
  { global: true },
);

/** Whether `response` already says a refusal of the api's: a JSON object whose `error` is a sentence. */
const saysError = async (response: Response): Promise<boolean> => {
  try {
    const body: unknown = await response.clone().json();
    return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string';
  } catch {
    return false;
  }
};

/**
 * `response`, which the web handler answered `c`'s request with, in the api's words where HttpApi answered on its own with no `{ error }`:
 * a 404 the api's `noRoute`, a 413 the limit, a 400 its decoding said nothing of where the document is. Anything else as it is.
 */
async function inApiWords(c: RequestContext<ApiEnv>, response: Response): Promise<Response> {
  if (response.status !== 400 && response.status !== 404 && response.status !== 413) return response;
  if (await saysError(response)) return response;
  if (response.status === 404) return noRoute(c);
  const route = `${c.req.method} ${new URL(c.req.url).pathname}`;
  const error =
    response.status === 413
      ? `${route} was sent an object too large: a body may be ${OBJECT_BODY_LIMIT_SAID} at most. Send a smaller one.`
      : `${route} does not read as its route takes it. Send it in that shape: ${DOCUMENT} says each key and value.`;
  return c.json({ error }, response.status);
}

/** The kind of list a GET of `path` answers — its endpoint's success a `<Kind>List` — or none where it is no list's. */
export const listAt = (path: string): string | undefined => endpointOf('GET', path)?.kinds.find((kind) => kind.endsWith('List'));

/**
 * The web handler of the `Api`, its layer built in the app runtime's memo map: every group's handlers, so a group left out does not
 * compile.
 */
export const objectsHandler = (runtime: ApiRuntime) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide([
        runsHandlers,
        stepsHandlers,
        cardsHandlers,
        factoriesHandlers,
        mcpServersHandlers,
        builtinHandlers,
        schedulesHandlers,
        hiresHandlers,
        volumesHandlers,
        workflowsHandlers,
        agentsHandlers,
        skillsHandlers,
        proposalsHandlers,
        delegationsHandlers,
        templatesHandlers,
        subscriptionsHandlers,
        eventsHandlers,
        discoveryHandlers,
      ]),
      Layer.provide(decodeRefused),
      Layer.provide(HttpServer.layerServices),
      Layer.provideMerge(Layer.succeed(HttpIncomingMessage.MaxBodySize, OBJECT_BODY_LIMIT)),
    ),
    { memoMap: runtime.memoMap, disableLogger: true },
  );

/**
 * The mount over the app's runtime: each request in `served`, handed to the `Api`'s web handler with the request's services
 * (`ServedNow`), its answer in the api's words (`inApiWords`); a GET of a list through `watchable`.
 */
export function mount(runtime: ApiRuntime): (c: RequestContext<ApiEnv>) => Promise<Response> {
  const { handler } = objectsHandler(runtime);
  const handed: Listed = (c, request = c.req.raw) =>
    served(c, async (s) => inApiWords(c, await handler(request, Context.make(ServedNow, s))));
  const watched = {
    plain: watchable(handed),
    RunList: watchable(handed, { versionOf: runWatchVersion }),
    EventList: watchable(handed, { follow: eventsFollowed }),
  };
  return async (c) => {
    const kind = c.req.method === 'GET' ? listAt(new URL(c.req.url).pathname) : undefined;
    if (kind === undefined) return handed(c);
    return (kind === 'RunList' || kind === 'EventList' ? watched[kind] : watched.plain)(c);
  };
}
