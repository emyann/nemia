/**
 * The objects' web handler and the Hono routes that hand it each path it serves (`objectsRoutes`): the `Api` of `objects` built with its
 * groups' handlers (`HttpApiBuilder.layer`) into one web handler (`HttpRouter.toWebHandler`), sharing the app runtime's memo map.
 *
 * Each route runs in `served`, after the app's runtime and `saidRequest` middleware, and hands the request on with the request's
 * services (`ServedNow`), built off the app's runtime as every Hono route's are: so a handler reads the app's one informer, its
 * `StoreRoot`, its place and its memo, the request says one line, and its reads are counted (`POLL_READS`). A write is guarded first
 * (`refusedBeforeReading`, guard.ts): refused 403 for another site and 415 for a body that is not JSON before its body is read.
 *
 * What HttpApi answers on its own is said in the api's words (`inApiWords`), as every other route of the api answers a refusal, `{ error }`
 * with a sentence naming the fix: a request whose body, path or query its decoding refuses (400, which HttpApi answers with no body) says
 * what its route takes, and a path it serves nothing on (404) says where the paths it serves are listed. Its own refusals, already
 * `{ error }`, pass as they are.
 *
 * The factories and their parts are handed on by `partsRoutes` (factory-parts/parts.ts), which says each of their writes as the guard does;
 * the Workflows, Agents and Skills by `definitionsRoutes` (definitions/routes.ts), each request placed in the factory its namespace names
 * and on the repository its `?repo=` names (`placeFor`), so `default` is the api's repository and your library; a factory's Proposals and
 * Delegations by `proposalsRoutes` (proposals/routes.ts), placed the same way, each judged by who calls (`caller`, caller/caller.ts).
 *
 * The cluster's templates and their documents, the feed's subscriptions — their `GET`s alone, subscribing and unsubscribing being
 * commands/routes.ts's — and the feed's lines as events, cluster-wide and in a namespace, are handed on as they are.
 *
 * The runs, as a `RunList` across namespaces and in one, a run in its namespace and across them, and its sub-resources, are handed on as
 * they are. A run's named actions — its start, its removal, its refresh, prune, labels and hold, and a step's retry, approval and words —
 * are guarded first in their command's words (`wordsAt`, commands/words.ts), each naming the path in the run's namespace; the start is
 * placed in the factory its namespace names and on its `?repo=` (`placeFor`), as a definition's write is.
 *
 * A write's body is read up to `OBJECT_BODY_LIMIT` (effect's `MaxBodySize`, which it otherwise leaves unset), and one over it is
 * answered 413 `{ error }` naming the limit.
 *
 * Every list is handed on through `listed`, which `watchable` wraps (src/watch/watch.ts): a list's route that does not go through it is not
 * watched; the Event lists' watch follows the feed instead of reading it again (`eventsFollowed`), and the Run lists'
 * compares a run leaving out its frame's time measured to the read (`runWatchVersion`). `GET /api` is discovery
 * (src/discovery/discovery.ts), every resource read off the `Api`.
 *
 * `GET /api/runs/:runId` with `?raw=` (not `false`) or `?view=` is passed on to the runs' own route (runs/runs.ts), which answers both.
 */
import { ByteSize, Context, Layer } from 'effect';
import { HttpIncomingMessage, HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { type Context as RequestContext, Hono } from 'hono';
import { runWatchVersion } from 'agent-orchestrator';
import { Api } from 'objects';
import { wordsAt } from '../commands/routes.ts';
import { type Guarded, refusedBeforeReading } from '../guard.ts';
import { startGuarded } from '../workflows/workflows.ts';
import { type ApiEnv, type ApiRuntime, served } from '../layer.ts';
import { cardsHandlers } from './cards.ts';
import { factoriesHandlers } from './factories.ts';
import {
  builtinHandlers,
  hiresHandlers,
  mcpServersHandlers,
  partsRoutes,
  schedulesHandlers,
  volumesHandlers,
} from '../factory-parts/index.ts';
import { agentsHandlers, definitionsRoutes, skillsHandlers, workflowsHandlers } from '../definitions/index.ts';
import { delegationsHandlers, proposalsHandlers, proposalsRoutes } from '../proposals/index.ts';
import { placeFor } from '../factories/place.ts';
import { ServedNow } from './refused.ts';
import { runsHandlers } from './runs.ts';
import { watchable } from '../watch/watch.ts';
import { discoveryHandlers } from '../discovery/discovery.ts';
import { eventsFollowed, eventsHandlers, subscriptionsHandlers } from '../feed-objects/index.ts';
import { templatesHandlers } from '../template-objects/templates.ts';

/** Where every path the objects are served on is listed, with what each takes. */
const DOCUMENT = 'GET /openapi/v3/nemia/v1';

/**
 * The most a write's body may be: 1 MiB. The largest object a client writes today is a skill whose body is a whole SKILL.md, 46 KB for
 * the largest in this repository (the orchestrator's `nemia/skills/verbs`), and a workflow written whole with its steps' prompts is
 * about 32 KB (sdlc's `build`): 1 MiB is twenty times the largest, and far below what holding a body in memory costs the api.
 */
export const OBJECT_BODY_LIMIT = ByteSize.mebibytes(1);

/** The limit as a refusal says it: its unit and its bytes. */
const OBJECT_BODY_LIMIT_SAID = `${ByteSize.format(OBJECT_BODY_LIMIT)} (${Number(OBJECT_BODY_LIMIT)} bytes)`;

/** What a list of objects takes in its query. */
const LIST_TAKES =
  '`?limit=<a whole number from 1>` and `?continue=<the token the page before answered>`, each once, and `?labelSelector=<selector>`, given again for another';

/** What a read of one object takes: its names in the path, and nothing else. */
const ONE_TAKES = 'the names in its path, and no body';

/** Whether `text` is a refusal of the api's already: a JSON object whose `error` is a sentence. */
const saysError = (text: string): boolean => {
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string';
  } catch {
    return false;
  }
};

/**
 * `response`, which the objects' handler answered `request` with, in the api's words: a 400 or a 404 HttpApi answered on its own, with no
 * `{ error }`, answered again with the same status and the sentence that names the fix — what the route takes (`takes`, said where the
 * route is one the api forwards), or where the paths are listed — and a 413, a body over `OBJECT_BODY_LIMIT`, with the limit. Anything
 * else as it is.
 */
export async function inApiWords(response: Response, request: Request, takes?: string): Promise<Response> {
  if (response.status !== 400 && response.status !== 404 && response.status !== 413) return response;
  if (saysError(await response.clone().text())) return response;
  const route = `${request.method} ${new URL(request.url).pathname}`;
  const error =
    response.status === 404
      ? `${route} is no path the objects are served on: ${DOCUMENT} lists each, with what it takes. Ask one of those.`
      : response.status === 413
        ? `${route} was sent an object too large: a body may be ${OBJECT_BODY_LIMIT_SAID} at most. Send a smaller one.`
        : `${route} does not read as its route takes it${takes ? `: ${takes}` : ''}. Send it in that shape: ${DOCUMENT} says each key and value.`;
  return new Response(JSON.stringify({ error }), { status: response.status, headers: { 'content-type': 'application/json' } });
}

/**
 * The objects' web handler, its layer built in the app runtime's memo map, each answer in the api's words (`inApiWords`), what the
 * route takes said by the route that hands the request on (`takes`).
 */
export const objectsHandler = (runtime: ApiRuntime) => {
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide([
        runsHandlers,
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
      Layer.provide(HttpServer.layerServices),
      Layer.provideMerge(Layer.succeed(HttpIncomingMessage.MaxBodySize, OBJECT_BODY_LIMIT)),
    ),
    { memoMap: runtime.memoMap, disableLogger: true },
  );
  return {
    dispose: web.dispose,
    handler: async (request: Request, context: Context.Context<ServedNow>, takes?: string): Promise<Response> =>
      inApiWords(await web.handler(request, context), request, takes),
  };
};

/** What a write of a card is said as by the guard's refusals, by its method, its path and its verb. */
const cardWrite = (route: string, does: string, forAnother: string, why: string, shape: string): Guarded => ({
  route,
  does,
  forAnother,
  why,
  reach: "make it from the board's Inbox page",
  instead: "Make it from the board's Inbox page, or with `nemia inbox`",
  shape,
});

/** The Card's writes, each as the guard says it. */
const CARD_WRITES = {
  create: (ns: string) =>
    cardWrite(
      `POST /api/namespaces/${ns}/cards`,
      'files a card',
      'file one',
      "a card's body is what a run started from it is asked to do, in the repository it names",
      '`{ "body": "<what to do>" }`, with `workflow`, `from`, `repo`, `factory` and `label` if you like',
    ),
  update: (ns: string, name: string) =>
    cardWrite(
      `PUT /api/namespaces/${ns}/cards/${name}`,
      'writes a card whole',
      'write one',
      "a card's spec is what a run started from it is asked to do, on the workflow and repository it names",
      '`{ "metadata": { "resourceVersion": "<as read>" }, "spec": { "body": "<what to do>" } }`, with the spec\'s other keys and `metadata.labels` if you like, `spec.queued` as read',
    ),
  delete: (ns: string, name: string) =>
    cardWrite(
      `DELETE /api/namespaces/${ns}/cards/${name}`,
      'drops a card',
      'drop one',
      'a card dropped is an idea gone, and nothing keeps a copy',
      'no body, or `{}`: the card is named in the path',
    ),
  start: (ns: string, name: string) =>
    cardWrite(
      `POST /api/namespaces/${ns}/cards/${name}/start`,
      'starts a card',
      'start one',
      "a card started is a run, asked to do the card's body in the repository it names",
      '`{ "workflow": "<name>" }`, with `from`, `after`, `context`, `brief` and `label` if you like',
    ),
  queue: (ns: string, name: string) =>
    cardWrite(
      `POST /api/namespaces/${ns}/cards/${name}/queue`,
      'queues a card',
      'queue one',
      'a queued card is started by the tick when a run slot frees',
      'no body, or `{}`: the card is named in the path',
    ),
  unqueue: (ns: string, name: string) =>
    cardWrite(
      `POST /api/namespaces/${ns}/cards/${name}/unqueue`,
      'takes a card off the queue',
      'take one off',
      'a card taken off the queue is an idea the tick no longer starts, and its place is lost',
      'no body, or `{}`: the card is named in the path',
    ),
  labels: (ns: string, name: string) =>
    cardWrite(
      `POST /api/namespaces/${ns}/cards/${name}/labels`,
      "edits a card's labels",
      'edit them',
      'a card started is created with its labels, and a selector picks it by them',
      '`{ "labels": ["key=value", "key-"] }`, with `overwrite` to change a value',
    ),
} as const;

/**
 * A run's named action, as the guard's refusals word it: its command's words (`wordsAt`), said of the run and the step its path names —
 * the run spelled `:runId`, as the table's route is, which the objects' handler reads as the `Api`'s `:name`.
 */
const runWrite =
  (command: string) =>
  (c: RequestContext<ApiEnv>): Guarded =>
    wordsAt(command).guard({
      runId: c.req.param('runId') ?? '',
      step: c.req.param('step') ?? '',
      name: '',
      factory: '',
      namespace: c.req.param('namespace') ?? '',
      method: c.req.method,
      path: c.req.path,
    });

/**
 * A start's answer, `response`: where it is a 201 naming the run it started (`id`), with the run's address beside it, `Location:
 * /api/runs/<id>`, where the run object is read whatever namespace its start placed it in.
 */
async function located(response: Response): Promise<Response> {
  if (response.status !== 201) return response;
  const body: unknown = await response.clone().json();
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') return response;
  const headers = new Headers(response.headers);
  headers.set('Location', `/api/runs/${encodeURIComponent(body.id)}`);
  return new Response(response.body, { status: response.status, headers });
}

/** `GET /api/runs/:runId` asked for the record (`?raw=`, not `false`) or a view: the runs' own route answers it. */
const notTheObject = (c: RequestContext<ApiEnv>): boolean => {
  const raw = c.req.query('raw');
  return (raw !== undefined && raw !== 'false') || c.req.query('view') !== undefined;
};

/** How a route hands a request to the objects' handler: as it is, as a list, or guarded first in a write's words. */
type Hand = {
  readonly forward: (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
  readonly listed: (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
  readonly guarded: (write: (c: RequestContext<ApiEnv>) => Guarded) => (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
};

/**
 * The runs' routes on `router`: the `RunList` across namespaces and in one and a run in its namespace, handed on as they are, and each of
 * the run's named actions guarded in its command's words (`runWrite`), the run spelled `:runId` as the command table spells it.
 */
function runsRoutes(router: Hono<ApiEnv>, { forward, listed, guarded }: Hand): Hono<ApiEnv> {
  const RUN = '/api/namespaces/:namespace/runs/:runId';
  return router
    .get('/api/runs', listed)
    .get('/api/namespaces/:namespace/runs', listed)
    .get(RUN, forward)
    .delete(RUN, guarded(runWrite('rm')))
    .post(`${RUN}/refresh`, guarded(runWrite('refresh')))
    .post(`${RUN}/prune`, guarded(runWrite('prune')))
    .post(`${RUN}/labels`, guarded(runWrite('label run')))
    .post(`${RUN}/hold`, guarded(runWrite('hold')))
    .delete(`${RUN}/hold`, guarded(runWrite('hold')))
    .post(`${RUN}/steps/:step/retry`, guarded(runWrite('retry')))
    .post(`${RUN}/steps/:step/approve`, guarded(runWrite('approve')))
    .post(`${RUN}/steps/:step/say`, guarded(runWrite('say')));
}

/** The routes that hand the objects' handler each path it serves, built over the app's runtime. */
export function objectsRoutes(runtime: ApiRuntime): Hono<ApiEnv> {
  const { handler } = objectsHandler(runtime);
  const handed = (c: RequestContext<ApiEnv>, takes: string, request: Request = c.req.raw) =>
    served(c, (s) => handler(request, Context.make(ServedNow, s), takes));
  const forward = (c: RequestContext<ApiEnv>) => handed(c, ONE_TAKES);
  const listed = watchable((c, request) => handed(c, LIST_TAKES, request));
  const events = watchable((c, request) => handed(c, LIST_TAKES, request), { follow: eventsFollowed });
  const runsListed = watchable((c, request) => handed(c, LIST_TAKES, request), { versionOf: runWatchVersion });
  const guarded = (write: (c: RequestContext<ApiEnv>) => Guarded) => (c: RequestContext<ApiEnv>) => {
    const guard = write(c);
    const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    return refused ? c.json({ error: refused.error }, refused.status) : handed(c, guard.shape);
  };
  const at = (c: RequestContext<ApiEnv>) => [c.req.param('namespace') ?? '', c.req.param('name') ?? ''] as const;
  const placed = (c: RequestContext<ApiEnv>, takes: string, request: Request = c.req.raw) =>
    served(c, (s) => {
      const place = placeFor({ factory: c.req.param('namespace'), repo: c.req.query('repo') }, s.env, s.running);
      return handler(request, Context.make(ServedNow, { ...s, repo: place.repo, factory: place.factory }), takes);
    });
  const placedGuarded = (write: (c: RequestContext<ApiEnv>) => Guarded) => (c: RequestContext<ApiEnv>) => {
    const guard = write(c);
    const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    return refused ? c.json({ error: refused.error }, refused.status) : placed(c, guard.shape);
  };
  const placedHand = {
    forward: (c: RequestContext<ApiEnv>) => placed(c, ONE_TAKES),
    listed: watchable((c, request) => placed(c, LIST_TAKES, request)),
    guarded: placedGuarded,
  };
  const definitions = proposalsRoutes(definitionsRoutes(new Hono<ApiEnv>(), placedHand), placedHand);
  const runs = runsRoutes(new Hono<ApiEnv>(), { forward, listed: runsListed, guarded }).post('/api/namespaces/:namespace/runs', async (c) =>
    located(await placedGuarded((c) => startGuarded(at(c)[0]))(c)),
  );
  return partsRoutes(new Hono<ApiEnv>().route('/', definitions).route('/', runs), { forward, listed, guarded })
    .get('/api', forward)
    .get('/api/runs/:runId', (c, next) => (notTheObject(c) ? next() : forward(c)))
    .get('/api/runs/:runId/steps/:step/tries', forward)
    .get('/api/runs/:runId/steps/:step/tries/:try', forward)
    .get('/api/runs/:runId/steps/:step/tries/:try/closeout', forward)
    .get('/api/runs/:runId/steps/:step/told', forward)
    .get('/api/templates', listed)
    .get('/api/templates/:name', forward)
    .get('/api/templates/:name/:plural{workflows|agents|skills}', listed)
    .get('/api/templates/:name/:plural{workflows|agents|skills}/:doc', forward)
    .get('/api/subscriptions', listed)
    .get('/api/subscriptions/:name', forward)
    .get('/api/events', events)
    .get('/api/events/:name', forward)
    .get('/api/namespaces/:namespace/events', events)
    .get('/api/namespaces/:namespace/events/:name', forward)
    .get('/api/cards', listed)
    .get('/api/cards/:name', forward)
    .get('/api/namespaces/:namespace/cards', listed)
    .get('/api/namespaces/:namespace/cards/:name', forward)
    .put(
      '/api/namespaces/:namespace/cards/:name',
      guarded((c) => CARD_WRITES.update(...at(c))),
    )
    .post(
      '/api/namespaces/:namespace/cards',
      guarded((c) => CARD_WRITES.create(at(c)[0])),
    )
    .delete(
      '/api/namespaces/:namespace/cards/:name',
      guarded((c) => CARD_WRITES.delete(...at(c))),
    )
    .post('/api/namespaces/:namespace/cards/:name/start', async (c) => located(await guarded((c) => CARD_WRITES.start(...at(c)))(c)))
    .post(
      '/api/namespaces/:namespace/cards/:name/queue',
      guarded((c) => CARD_WRITES.queue(...at(c))),
    )
    .post(
      '/api/namespaces/:namespace/cards/:name/unqueue',
      guarded((c) => CARD_WRITES.unqueue(...at(c))),
    )
    .post(
      '/api/namespaces/:namespace/cards/:name/labels',
      guarded((c) => CARD_WRITES.labels(...at(c))),
    );
}
