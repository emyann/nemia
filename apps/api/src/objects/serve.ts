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
 * again (`eventsFollowed`); the Run lists are a watched kind, served from the runs' status records, like any other.
 *
 * What HttpApi answers on its own is said in the api's words, as every other refusal of the api: a request its decoding refuses — a path's
 * name, a query or a body its endpoint's Schema does not take — is a 400 `BadRequest` naming the refused key (`field`,
 * `payload.spec.steps`) and pointing at the document (`decodeRefused`); an answer past the app's bound a 422 saying how to narrow it
 * (`answerRefused`); a body over `OBJECT_BODY_LIMIT` a 413 naming the limit, one of a content-type its endpoint does not take a 415;
 * and a path
 * no endpoint serves the api's own 404 (`noRoute`), whatever router missed it.
 */
import { ByteSize, Context, Effect, Layer } from 'effect';
import { HttpIncomingMessage, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder, HttpApiError } from 'effect/http-api';
import type { Context as RequestContext } from 'hono';
import { isWatchedKind } from 'agent-orchestrator';
import { Api, refusedIn } from 'objects';
import { type ApiEnv, type ApiRuntime, served } from '../layer.ts';
import { cardsHandlers } from './cards.ts';
import {
  libraryAddsHandlers,
  factoriesHandlers,
  hiresHandlers,
  mcpServersHandlers,
  schedulesHandlers,
  triggersHandlers,
  volumesHandlers,
} from '../factory/index.ts';
import { agentsHandlers } from '../agents/index.ts';
import { skillsHandlers } from '../skills/index.ts';
import { workflowsHandlers } from '../workflows/index.ts';
import { delegationsHandlers, proposalsHandlers } from '../proposals/index.ts';
import { AnswerPastBound } from './answer-bound.ts';
import { endpointOf } from './endpoints.ts';
import { revisioned } from './revisioned.ts';
import { ServedNow } from './refused.ts';
import { runsHandlers } from './runs.ts';
import { filesHandlers } from '../files/files.ts';
import { stepsHandlers } from '../steps/index.ts';
import { type Listed, watchable } from '../watch/watch.ts';
import { discoveryHandlers } from '../discovery/discovery.ts';
import { eventsFollowed, eventsHandlers, subscriptionsHandlers } from '../feed-objects/index.ts';
import { templatesHandlers } from '../template-objects/templates.ts';
import { serverHandlers, sessionHandlers } from '../server/index.ts';
import { nemiaHandlers } from '../nemia/index.ts';
import { readinessHandlers } from '../readiness/readiness.ts';
import { foldersHandlers } from '../folders/folders.ts';
import { upgradesHandlers } from '../upgrades/index.ts';
import { linksHandlers, pairingsHandlers } from '../pairing/pairing.ts';
import { tokensHandlers } from '../tokens/tokens.ts';

/** Where every path the api serves is listed, with what each takes. */
const DOCUMENT = 'GET /openapi/v3/nemia/v1';

/**
 * The most a write's body may be: 1 MiB. The largest object a client writes today is a skill whose body is a whole SKILL.md, 46 KB for
 * the largest in this repository (the orchestrator's `nemia/skills/verbs`), and a workflow written whole with its steps' prompts is
 * tens of KB: 1 MiB is twenty times the largest, and far below what holding a body in memory costs the api.
 */
export const OBJECT_BODY_LIMIT = ByteSize.mebibytes(1);

/** A card's create, whole write or edit: a body past the limit there is a card's text, which a file carries instead. */
const CARD_PATH = /^\/api\/namespaces\/[^/]+\/cards(?:\/[^/]+(?:\/source)?)?$/;

/** The limit as a refusal says it: its unit and its bytes. */
const OBJECT_BODY_LIMIT_SAID = `${ByteSize.format(OBJECT_BODY_LIMIT)} (${Number(OBJECT_BODY_LIMIT)} bytes)`;

/**
 * A path no route serves, a retired one among them (`/api/factories/:factory/servers`, `…/hires/:step`, `…/schedules/:workflow`), in the
 * api's words: a 404 naming the restart that makes a client and the api one build, and where the paths it serves are listed.
 * @param c The request's context.
 */
export function noRoute(c: RequestContext<ApiEnv>) {
  return c.json(
    {
      error: `${c.req.method} ${new URL(c.req.url).pathname} is no route of this api, which a client of another build may still ask: restart the daemon with \`nemia service restart\` so the two are one build, or ask a path ${DOCUMENT} lists.`,
    },
    404,
  );
}

/**
 * The key a refused decode names, from the request's part it is in (`payload.spec.steps`, `query.limit`, `params.name`), and what its
 * Schema says of it: the message it was declared with, where it says what to send instead, or what it expected there, read off the
 * issue by its `_tag` (objects' `refusedIn`).
 */
const refusedOf = (error: HttpApiError.HttpApiSchemaError) => {
  const [first] = refusedIn(error.cause.issue);
  const path = (first?.path ?? []).map(String);
  return { field: [error.kind.toLowerCase(), ...path].join('.'), said: first && (first.message ?? first.expected) };
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
        const { field, said } = refusedOf(defect);
        return HttpServerResponse.jsonUnsafe(
          {
            error: `${request.method} ${new URL(request.url, 'http://api').pathname} does not read as its route takes it: \`${field}\` is not what it takes${said ? ` (${said})` : ''}. Send it in that shape: ${DOCUMENT} says each key and value.`,
            field,
          },
          { status: 400 },
        );
      });
    }),
  { global: true },
);

/**
 * An answer its handler measured past the app's bound (`AnswerPastBound`, `readHandled` in answer-bound.ts), never encoded: answered 422
 * with the words that say how to narrow the read (its keys in `READS`).
 */
const answerRefused = HttpRouter.middleware(
  (httpEffect) =>
    Effect.catchDefect(httpEffect, (defect) =>
      defect instanceof AnswerPastBound
        ? Effect.succeed(HttpServerResponse.jsonUnsafe({ error: defect.message }, { status: 422 }))
        : Effect.die(defect),
    ),
  { global: true },
);

/** Whether `response` already says a refusal of the api's: a JSON object whose `error` is a sentence. */
const saysError = async (response: Response) => {
  try {
    const body: unknown = await response.clone().json();
    return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string';
  } catch {
    return false;
  }
};

/**
 * `response`, which the web handler answered `c`'s request with, in the api's words where HttpApi answered on its own with no `{ error }`:
 * a 404 the api's `noRoute`, a 413 the limit, a 415 a body of a content-type its endpoint does not take (JSON sent to the form a file is
 * uploaded as), a 400 its decoding said nothing of where the document is. Anything else as it is.
 */
async function inApiWords(c: RequestContext<ApiEnv>, response: Response) {
  if (response.status !== 400 && response.status !== 404 && response.status !== 413 && response.status !== 415) return response;
  if (await saysError(response)) return response;
  if (response.status === 404) return noRoute(c);
  const route = `${c.req.method} ${new URL(c.req.url).pathname}`;
  const error =
    response.status === 413
      ? `${route} was sent an object too large: a body may be ${OBJECT_BODY_LIMIT_SAID} at most. ${CARD_PATH.test(new URL(c.req.url).pathname) ? "Keep the card's text short, and attach what is long as a file: upload it (POST /api/namespaces/<namespace>/files), then name it under files, as nemia inbox add <idea> --file <path> does." : 'Send a smaller one.'}`
      : response.status === 415
        ? `${route} does not take a body of the content-type sent (${c.req.header('content-type') ?? 'none'}): ${DOCUMENT} says what it takes.`
        : `${route} does not read as its route takes it. Send it in that shape: ${DOCUMENT} says each key and value.`;
  return c.json({ error }, response.status);
}

/**
 * The kind of list a GET of `path` answers — its endpoint's success a `<Kind>List` — or none where it is no list's.
 * @param path The request's path.
 */
const listAt = (path: string) => endpointOf('GET', path)?.kinds.find((kind) => kind.endsWith('List'));

/**
 * The web handler of the `Api`, its layer built in the app runtime's memo map: every group's handlers, so a group left out does not
 * compile.
 * @param runtime The app's runtime, in whose memo map the layer is built.
 */
const objectsHandler = (runtime: ApiRuntime) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide([
        runsHandlers,
        filesHandlers,
        stepsHandlers,
        cardsHandlers,
        factoriesHandlers,
        mcpServersHandlers,
        libraryAddsHandlers,
        schedulesHandlers,
        triggersHandlers,
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
        serverHandlers,
        nemiaHandlers,
        readinessHandlers,
        foldersHandlers,
        upgradesHandlers,
        pairingsHandlers,
        linksHandlers,
        tokensHandlers,
        sessionHandlers,
      ]),
      Layer.provide(decodeRefused),
      Layer.provide(answerRefused),
      Layer.provide(HttpServer.layerServices),
      Layer.provideMerge(Layer.succeed(HttpIncomingMessage.MaxBodySize, OBJECT_BODY_LIMIT)),
    ),
    { memoMap: runtime.memoMap, disableLogger: true },
  );

/**
 * The mount over the app's runtime: each request in `served`, handed to the `Api`'s web handler with the request's services
 * (`ServedNow`), its answer in the api's words (`inApiWords`); a GET of a list through `watchable`.
 * @param runtime The app's runtime, whose handler serves the Api.
 */
export function mount(runtime: ApiRuntime) {
  const { handler } = objectsHandler(runtime);
  const handed: Listed = (c, request = c.req.raw) =>
    served(c, async (s) => inApiWords(c, await handler(request, Context.make(ServedNow, s))));
  const stamped = revisioned(handed, (method, path) => endpointOf(method, path)?.kinds ?? []);
  const watched = {
    plain: watchable(handed),
    EventList: watchable(handed, { follow: eventsFollowed }),
  };
  return (async (c) => {
    const kind = c.req.method === 'GET' ? listAt(new URL(c.req.url).pathname) : undefined;
    if (kind === undefined) return stamped(c);
    if (kind === 'EventList') return watched[kind](c);
    const of = kind.replace(/List$/, '');
    return isWatchedKind(of) ? watchable(stamped, { kind: of })(c) : watched.plain(c);
  }) satisfies (c: RequestContext<ApiEnv>) => Promise<Response>;
}
