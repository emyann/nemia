import fs from 'node:fs/promises';
import { Layer, ManagedRuntime } from 'effect';
import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { feedHubLayer, gitPlaceLayer, informerLayer, runningRelease, storeConfigLayer, telemetryLayer } from 'agent-orchestrator';
import { callerGate } from './caller/caller.ts';
import { McpAsker } from './capabilities/index.ts';
import { QuotaAsker } from './gauges/index.ts';
import { ApiConfig, type ApiEnv, type ApiRuntime, ReadMemo, type Services } from './layer.ts';
import { bodyOf, MOUNT, mount, noRoute, refusedAs, statusOf } from './objects/index.ts';
import { writeGuard } from './guard.ts';
import { openapi, REFERENCE_BUNDLE, referenceOf } from './openapi/index.ts';
import { saidRequest } from './request/request.ts';
import { Followings } from './steps/index.ts';
import { Engine } from './store.ts';

/**
 * What the api answers an error a route on Hono threw: a refusal — the orchestrator's by its tag, the api's own refusal of a session token
 * (`Unauthorized`, caller/caller.ts), an error of `objects`' — as the `Api` answers it (`refusedAs`, objects/refused.ts, the one map), at
 * its class's status (`statusOf`), `{ error }` and its class's other keys (a `Conflict`'s `users`, a `Forbidden`'s `reason`); an
 * `HTTPException` its own response; anything else a 500, `{ error }` its message, said on stderr — an `Error` carrying `exitCode` 2 by hand
 * among them, since only a kind says what a refusal is.
 */
export const answerError: ErrorHandler = (err, c) => {
  const refused = refusedAs(err);
  if (refused !== undefined) return c.json(bodyOf(refused), statusOf(refused) as ContentfulStatusCode);
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err.message }, 500);
};

/**
 * Every service the api reads, live, over `env`: the settings read from it on each request (`ApiConfig`), the package's engine (`Engine`)
 * and the store's root and settings, read from `env` (`StoreRoot` and `StoreConfig`, `storeConfigLayer`: `WF_ROOT` and every `WF_`
 * setting), an MCP asker and a quota asker with nothing asked yet
 * (`McpAsker`, `QuotaAsker`), reads that have kept nothing yet (`ReadMemo`), an informer of each run's judgement holding none, which the
 * daemon's passes fill and every request reads (`informerLayer`: one per app, so the store's daemon and the board's reads judge a run
 * once), the steps followed live, none yet (`Followings`), the hub the feed's lines are published to as the process's daemon writes them
 * (`feedHubLayer`), and the git place (`gitPlaceLayer`).
 *
 * And the process's telemetry (`telemetryLayer`): the line logger every log of the app goes through — each request's among them — and,
 * where `env` names an OTLP collector, the tracer, the exporters and their `Flusher` besides. Held here and not around the process's
 * program, since the handlers run on this runtime and nothing provided around `main.ts`'s program reaches them, and `--no-tick` runs no
 * program of its own; once per process, since `Metric.MetricRegistry`'s default map is shared and a second provider exports every metric
 * twice. Merged last, so a test's own `Logger.layer` given after it still wins.
 */
export const liveOf = (env: NodeJS.ProcessEnv = process.env): Layer.Layer<Services> =>
  Layer.mergeAll(
    ApiConfig.layer(env, runningRelease()),
    Engine.live(env),
    storeConfigLayer(env),
    McpAsker.live,
    QuotaAsker.live,
    ReadMemo.live,
    informerLayer(),
    Followings.live,
    feedHubLayer(),
    gitPlaceLayer,
    telemetryLayer(env),
  );

let bundle: Promise<string> | undefined;
/** The OpenAPI page's viewer script, read from the installed package once and kept: a reread would serve the same file. */
const viewerScript = () => (bundle ??= fs.readFile(REFERENCE_BUNDLE, 'utf8'));

/**
 * An api over `layer`, and the runtime its handlers run on (`ManagedRuntime`), built from the layer once, the first time a request or
 * `runtime.context()` needs it, and put on every request before any router is reached (`served`, layer.ts). A service the layer gives
 * twice is the one given last (`Layer.merge`): how a test gives the api an engine, a root or an asker of its own.
 *
 * Hono is the host alone. Every route the api serves is an endpoint of `objects`' `Api`, the one route table, served by the mount
 * (`.all(MOUNT, mount(runtime))`, objects/serve.ts): its body decoded by the endpoint's Schema (a 400 naming the `field`), its handler
 * in the folder of its group (runs/, steps/, decide/, server/, nemia/, workflows/, agents/, skills/, factory/, proposals/, objects/),
 * each calling the package's verbs by type, and a GET answering a `…List` watched on `?watch=true` (watch/watch.ts) and a `Table` where
 * the request accepts one (objects/table.ts). Only the three OpenAPI routes stay outside it: the document, its page and the page's
 * script (openapi/). A path neither serves is the api's own 404 (`noRoute`).
 *
 * Before any of them, every request says one line and is traced as a server span (`saidRequest`, request/request.ts); who it is from is
 * resolved (`callerGate`, caller/caller.ts: the person with no `Authorization`, an agent's session by the token it presents, a token
 * refused 401 whatever the route); and every write under `/api/` meets the one guard (`writeGuard`, guard.ts: a 403 off the host or the
 * site, a 415 off JSON). A refusal thrown anywhere is answered by the one map (`refusedAs`, objects/refused.ts), at its class's status
 * (`answerError`).
 */
export function appOf(layer: Layer.Layer<Services>): { app: Hono<ApiEnv>; runtime: ApiRuntime } {
  const runtime = ManagedRuntime.make(layer);
  const app = new Hono<ApiEnv>()
    .use(async (c, next) => {
      c.set('runtime', runtime);
      await next();
    })
    .use(saidRequest)
    .use(callerGate)
    .use(writeGuard)
    .route('/', openapi)
    .route('/', referenceOf(viewerScript))
    .all(MOUNT, mount(runtime))
    .notFound(noRoute)
    .onError(answerError);
  return { app, runtime };
}

/** The api the process serves (main.ts), over the live services and `process.env`, and its runtime. */
export const { app, runtime } = appOf(liveOf());
