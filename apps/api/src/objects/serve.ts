/**
 * The objects' web handler and the Hono routes that hand it each path it serves (`objectsRoutes`): the `Api` of `objects` built with its
 * groups' handlers (`HttpApiBuilder.layer`) into one web handler (`HttpRouter.toWebHandler`), sharing the app runtime's memo map.
 *
 * Each route runs in `served`, after the app's runtime and `saidRequest` middleware, and hands the request on with the request's
 * services (`ServedNow`), built off the app's runtime as every Hono route's are: so a handler reads the app's one informer, its
 * `StoreRoot`, its place and its memo, the request says one line, and its reads are counted (`POLL_READS`). A write is guarded first
 * (`refusedBeforeReading`, guard.ts): refused 403 for another site and 415 for a body that is not JSON before its body is read.
 *
 * `GET /api/runs/:runId` with `?raw=` (not `false`) or `?view=` is passed on to the runs' own route (runs/runs.ts), which answers both.
 */
import { Context, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { type Context as RequestContext, Hono } from 'hono';
import { Api } from 'objects';
import { type Guarded, refusedBeforeReading } from '../guard.ts';
import { type ApiEnv, type ApiRuntime, served } from '../layer.ts';
import { cardsHandlers } from './cards.ts';
import { ServedNow } from './refused.ts';
import { runsHandlers } from './runs.ts';

/** The objects' web handler, its layer built in the app runtime's memo map. */
export const objectsHandler = (runtime: ApiRuntime) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(Layer.provide([runsHandlers, cardsHandlers]), Layer.provide(HttpServer.layerServices)),
    { memoMap: runtime.memoMap, disableLogger: true },
  );

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
      '`{ "body": "<what to do>" }`, with `workflow`, `from`, `repo` and `label` if you like',
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

/** `GET /api/runs/:runId` asked for the record (`?raw=`, not `false`) or a view: the runs' own route answers it. */
const notTheObject = (c: RequestContext<ApiEnv>): boolean => {
  const raw = c.req.query('raw');
  return (raw !== undefined && raw !== 'false') || c.req.query('view') !== undefined;
};

/** The routes that hand the objects' handler each path it serves, built over the app's runtime. */
export function objectsRoutes(runtime: ApiRuntime): Hono<ApiEnv> {
  const { handler } = objectsHandler(runtime);
  const forward = (c: RequestContext<ApiEnv>) => served(c, (s) => handler(c.req.raw, Context.make(ServedNow, s)));
  const guarded = (write: (c: RequestContext<ApiEnv>) => Guarded) => (c: RequestContext<ApiEnv>) => {
    const refused = refusedBeforeReading(write(c), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    return refused ? c.json({ error: refused.error }, refused.status) : forward(c);
  };
  const at = (c: RequestContext<ApiEnv>) => [c.req.param('namespace') ?? '', c.req.param('name') ?? ''] as const;
  return new Hono<ApiEnv>()
    .get('/api/runs/:runId', (c, next) => (notTheObject(c) ? next() : forward(c)))
    .get('/api/runs/:runId/steps/:step/tries', forward)
    .get('/api/runs/:runId/steps/:step/tries/:try', forward)
    .get('/api/runs/:runId/steps/:step/tries/:try/closeout', forward)
    .get('/api/runs/:runId/steps/:step/told', forward)
    .get('/api/cards', forward)
    .get('/api/namespaces/:namespace/cards', forward)
    .get('/api/namespaces/:namespace/cards/:name', forward)
    .post(
      '/api/namespaces/:namespace/cards',
      guarded((c) => CARD_WRITES.create(at(c)[0])),
    )
    .delete(
      '/api/namespaces/:namespace/cards/:name',
      guarded((c) => CARD_WRITES.delete(...at(c))),
    )
    .post(
      '/api/namespaces/:namespace/cards/:name/start',
      guarded((c) => CARD_WRITES.start(...at(c))),
    )
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
