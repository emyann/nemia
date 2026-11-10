import fs from 'node:fs/promises';
import { Layer, ManagedRuntime, Metric } from 'effect';
import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  feedHubLayer,
  gitPlaceLayer,
  informerLayer,
  leaseRelease,
  runningRelease,
  storeRootLayer,
  telemetryLayer,
  VERSION,
} from 'agent-orchestrator';
import { DEFAULT_HARNESS } from 'agent-orchestrator/workflow';
import { callerGate } from './caller/caller.ts';
import { agents } from './agents/index.ts';
import { customInstructions } from './custom/custom.ts';
import { commands } from './commands/index.ts';
import { capabilitiesWithSteps, McpAsker } from './capabilities/index.ts';
import { ceilingsOf, metricsOf, passesOf, seriesOf, pauseNowOf, pauseOf, feed, QuotaAsker, readDaemon } from './gauges/index.ts';
import { ApiConfig, type ApiEnv, type ApiRuntime, ReadMemo, served, type Services } from './layer.ts';
import { nemia, nemiaChat } from './nemia/index.ts';
import { bodyOf, MOUNT, mount, noRoute, refusedAs, statusOf } from './objects/index.ts';
import { writeGuard } from './guard.ts';
import { runs } from './runs/index.ts';
import { openapi, REFERENCE_BUNDLE, referenceOf } from './openapi/index.ts';
import { saidRequest } from './request/request.ts';
import { stats } from './stats/stats.ts';
import { step } from './step/step.ts';
import { Followings } from './steps/index.ts';
import { engineRead, Engine } from './store.ts';
import { builder, workflows, yours } from './workflows/index.ts';

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

/** The code this process runs, as the lease records it: an install's kind, folder, tag and commit, not its source; a checkout's folder. */
const RELEASE = leaseRelease(runningRelease());

/** What `GET /api/version` answers. */
export type VersionAnswer = { version: string; release: typeof RELEASE };

/**
 * Every service the api reads, live, over `env`: the settings read from it on each request (`ApiConfig`), the package's engine (`Engine`)
 * and the store's root, read from `env` (`StoreRoot`, `storeRootLayer`: `WF_ROOT`), an MCP asker and a quota asker with nothing asked yet
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
    Engine.live,
    storeRootLayer(env),
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
 * The api's routes: every one the board reads and writes, its groups each in a router of their own. Each is declared by an entry of the
 * package's command table — a command of the CLI's on its route, or one the api serves alone (`only: api`), the board's library, pages
 * and merge check among them — or is the api's own, a stream or a read of the server or the machine, each with why
 * (`OWN` in test/served.test.ts).
 *
 * - `GET /api/health` — `{ ok: true }` while the api answers.
 * - `GET /api/version` — `{ version, release }`, the orchestrator's package version (`VERSION`) and the code the api runs (`RELEASE`), a
 *   checkout or an install: what the board's bottom bar says.
 * - factory/factories.ts, and factory/parts/: mcp-servers.ts, schedules.ts, hires.ts, volumes.ts — the factories as objects, and their
 *   servers, schedules, hires and volumes in each factory's namespace, served through `objects`' Api by the mount (objects/serve.ts,
 *   the handlers through factory/index.ts). A handler of a namespaced kind is answered in its namespace's factory and on the repository
 *   `?repo=` names (`answeredIn`, objects/refused.ts), refused when it names a repository no factory has (`placeFor`, factory/place.ts).
 * - `GET /api/capabilities` — what the repository offers a step, read from the checkout on each request (capabilities/capabilities.ts), and
 *   what each step of each workflow gets of it (capabilities/reach.ts). Each MCP server the settings enable is started and asked for its
 *   tools once while the app runs (`McpAsker`); one that fails is an `error` on its entry, never a failed request.
 * - definitions/ — the Workflows, Agents and Skills as objects, each in a namespace (`default`, the api's repository and your library, or a
 *   factory's), served through `objects`' Api (objects/serve.ts): listed, read by origin, and yours written in `default` alone.
 * - proposals/ — a factory's Proposals, made by any caller of the factory, approved by the person or a delegated agent at auto and
 *   applied, declined by the person; and its Delegations, written by the person alone; served through `objects`' Api (objects/serve.ts),
 *   each judged by who calls (`caller`, caller/caller.ts).
 * - workflows/workflows.ts — a run of a workflow started, the board's first write, or of an inbox card.
 * - workflows/builder.ts — what a step's form is drawn from (`GET /api/workflows/keys`), and the builder's write the Workflow's PUT calls.
 * - workflows/yours.ts — your store's folders under the store root, and the line that files a factory in it.
 * - agents/agents.ts — where agents are looked for (`GET /api/agents/sources`), and the reads and writes the Agent object calls.
 * - custom/custom.ts — a person's custom instructions for an agent, by its name, read through `nemia agents custom`'s entry; written and
 *   cleared on the routes the table generates from it (commands/routes.ts).
 * - agents/skills.ts — the reads and writes of a skill the Skill object calls.
 * - inbox/inbox.ts — what a card filed through the Card's verb files, and the inbox listed with each card's body. The Card's verbs —
 *   listed, read alone with its file as written, written whole, filed, dropped, started, queued, labelled — are the objects'
 *   (objects/cards.ts).
 * - runs/runs.ts — what `nemia decide` shows of a run; the runs themselves are the objects' (objects/runs.ts).
 * - stats/stats.ts — the flow numbers of every run in the store, as `nemia stats --json` prints them.
 * - `GET /api/ceilings` — the cap on runs in flight the daemon's last pass ran with, and the runs it counts and holds: what the Factory
 *   says over its floor. 422 for a `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the daemon's
 *   (`maxRuns`, an `Invalid`).
 * - `GET /api/passes` — what the recent passes of the tick cost, `{ recent, histogram, parts, summary, bounds }`, as `nemia passes --json`
 *   prints it: read off the store's `tick-recent.json`, which the ticking process keeps, the api's own or a `nemia up`'s. `?last=<n>` keeps
 *   the last n; 422 for one that is not a whole number from 1.
 * - `GET /api/series` — the system's series over a range, `{ range, span, from, to, series }`, as `nemia series --json` prints it: read
 *   off the store's `metrics/` minute lines for `?range=24h` (the default) and its hour lines for `7d`, `30d` and `all`, which the ticking
 *   process keeps; a past day off the app's memo while its file has not moved. 422 for a range it does not take.
 * - `GET /api/metrics` — the process's metrics, each `{ name, type, description, attributes }` and its value (`MetricRead`,
 *   gauges/ceilings.ts), in the registry of the app's runtime: the files the runtime read for each request, its journals and every
 *   other, by its route's pattern (`api.poll.reads`, about, since a pass or another request reading at the same time is counted too),
 *   and the pass's (`pass.duration`, `pass.phase.duration`, `pass.journal_reads`, `store.runs`, `sessions.queued`, `sessions.admitted`)
 *   only where this process ticks: an api started with `--no-tick`, or beside a `nemia up`, has none of them.
 * - `GET /api/pause` — the store's pause, `{ pause, finishing, staged, held }`: since when, by whom and why, or null; each task still
 *   finishing under it (`{ run, step, kind, calling? }`, a `session`, `check` or `landing`, and the tool a session is in a call to),
 *   none once it is Paused; each landing it holds with its merge staged in the repository's checkout (MERGE_HEAD), and each other step
 *   signed off (`{ run, step }`), its check not filed until it resumes (`pausedRead`). Put on
 *   `POST /api/pause` and lifted on `DELETE /api/pause` (commands/routes.ts).
 * - `GET /api/pause/now` — what a pause at once (`POST /api/pause` with `now`) would stop, `{ interrupts, cost }`: each step session or
 *   check at work, of a run not called off, but a landing (`{ run, step, kind, taskId }`, a `session` or `check`), and the sentence of
 *   what an interrupted step costs (`nowRead`). Read off one view of the engine, and nothing written.
 * - `GET /api/daemon` — whether a nemia up ticks the store, and since when, and when it last passed: read off daemon.json and the process
 *   table as nemia ls reads them, and never written, the file being the daemon's. What the Factory says over its floor when nothing ticks.
 *   500 for a daemon.json that is there and cannot be read — a directory in its place, a permission: the package throws rather than call
 *   it free.
 * - `GET /api/quota` — the subscription's quota, as the engine's `quota` answers it for the `claude` harness (Claude Code's get_usage
 *   request), asked at most once a keep however many boards read (`QuotaAsker`, gauges/quota.ts): what the Factory says over its floor.
 *   Every case is a 200 with a sentence, the harness's failures and the engine's refusals included.
 * - commands/routes.ts — the routes the package's table generates, each through one pipeline: the store's pause put and lifted,
 *   `nemia pause` and `nemia resume`'s routes; an agent's custom instructions
 *   written and cleared; and a factory's instruction put where it is kept, and written and cleared.
 * - gauges/feed.ts — the workflow feed followed, as server-sent events.
 * - nemia/nemia.ts — Nemia, the store's own agent: where she is (`nemia level`'s read), and the facts she keeps (`nemia memory`). Her
 *   level is set on the route the table generates from `nemia level`.
 * - nemia/chat.ts — Nemia's chat: her history paged and followed, the person's words sent, and their read mark moved.
 *
 * A route lets the orchestrator's refusals through, and `onError` answers each as the one map says (`refusedAs`, objects/refused.ts), at
 * its class's status, `{ error }` in its words (`answerError`). Any other error is a 500 there: a route that has better words for one, or
 * a truer status, answers it itself.
 *
 * Every write under `/api/` meets the one guard first (`writeGuard`, guard.ts), whatever route serves it. After the routes still on Hono,
 * the mount hands every other request under `/api/` to the web handler of `objects`' `Api` (`.all(MOUNT, mount(runtime))`,
 * objects/serve.ts); a path neither serves is the api's own 404 (`noRoute`).
 *
 * Every request, whichever route answers it, says one line and is traced as a server span: `saidRequest` (request/request.ts), registered
 * after the runtime's middleware and before every router, on the runtime the request carries. Then who it is from (`callerGate`,
 * caller/caller.ts): the person with no `Authorization`, an agent's session by the token it presents, a token refused 401 whatever the
 * route.
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
    .get('/api/health', (c) => c.json({ ok: true }))
    .get('/api/version', (c) => c.json({ version: VERSION, release: RELEASE }))
    .get('/api/capabilities', (c) =>
      served(c, async ({ e, placeService, env, repo, home, mcp, inRequest, trace }) =>
        c.json(await capabilitiesWithSteps(repo, { e, placeService, trace, env, home, asker: mcp, inRequest })),
      ),
    )
    .route('/', workflows)
    .route('/', step)
    .route('/', builder)
    .route('/', yours)
    .route('/', agents)
    .route('/', customInstructions)
    .route('/', runs)
    .route('/', stats)
    .get('/api/ceilings', (c) => served(c, async (s) => c.json(await ceilingsOf(s))))
    .get('/api/passes', (c) =>
      served(c, async ({ e, placeService, home, trace }) => c.json(await passesOf(e, { placeService, home, trace }, c.req.query('last')))),
    )
    .get('/api/series', (c) =>
      served(c, async ({ e, placeService, memo, home, trace }) =>
        c.json(await seriesOf(e, { placeService, home, trace }, c.req.query('range'), memo.series)),
      ),
    )
    .get('/api/metrics', async (c) => c.json(metricsOf(await runtime.runPromise(Metric.snapshot))))
    .get('/api/pause', (c) =>
      served(c, async ({ e, placeService, home, trace }) => c.json(await pauseOf(e, { placeService, home, trace }))),
    )
    .get('/api/pause/now', (c) =>
      served(c, async ({ e, placeService, memo, home, trace }) =>
        c.json(await pauseNowOf(e, { placeService, home, trace }, memo.records.pause)),
      ),
    )
    .get('/api/daemon', (c) => c.json(readDaemon()))
    .get('/api/quota', (c) =>
      served(c, async ({ e, env, quota }) => {
        const harness = DEFAULT_HARNESS;
        return c.json(await quota({ env, harness, ask: () => engineRead('quota', e.quota(harness)) }));
      }),
    )
    .route('/', commands)
    .route('/', feed)
    .route('/', nemia)
    .route('/', nemiaChat)
    .all(MOUNT, mount(runtime))
    .notFound(noRoute)
    .onError(answerError);
  return { app, runtime };
}

/** The api the process serves (main.ts), over the live services and `process.env`, and its runtime. */
export const { app, runtime } = appOf(liveOf());
