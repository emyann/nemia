import { Layer, ManagedRuntime, Metric } from 'effect';
import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { feedHubLayer, gitPlaceLayer, leaseRelease, runningRelease, VERSION } from 'agent-orchestrator';
import { isRefusal, type Refusal } from 'agent-orchestrator';
import { agents, skills } from './agents/index.ts';
import { customInstructions } from './custom/custom.ts';
import { commands } from './commands/index.ts';
import { capabilitiesWithSteps, McpAsker } from './capabilities/index.ts';
import { factories, factoryInstruction, factoryRules } from './factories/index.ts';
import { ceilingsOf, metricsOf, passesOf, seriesOf, pauseNowOf, pauseOf, feed, QuotaAsker, readDaemon } from './factory/index.ts';
import { inbox } from './inbox/inbox.ts';
import { ApiConfig, type ApiEnv, type ApiRuntime, ReadMemo, served, type Services } from './layer.ts';
import { machines } from './machines/machines.ts';
import { nemia } from './nemia/nemia.ts';
import { runs } from './runs/runs.ts';
import { stats } from './stats/stats.ts';
import { step } from './step/step.ts';
import { Followings, steps } from './steps/index.ts';
import { engineRead, Engine, StoreRoot } from './store.ts';
import { builder, remover, workflows, yours } from './workflows/index.ts';

/**
 * The status each kind of the orchestrator's refusal answers, whichever route it came through: what is asked of is not there (404), the
 * state of a run or of the store forbids it (409), what is given is wrong (422). A kind left out is refused by the compiler.
 */
export const REFUSAL_STATUS = { Missing: 404, Conflict: 409, Invalid: 422 } as const satisfies Record<
  Refusal['_tag'],
  ContentfulStatusCode
>;

/**
 * What the api answers an error a route threw: a refusal of the orchestrator's (`isRefusal`, by its class) its status in `REFUSAL_STATUS`,
 * `{ error }` in its words, and `users` beside it where a `Conflict` names the steps that hold what was asked of; an `HTTPException` its
 * own response; anything else a 500, `{ error }` its message, said on stderr — an `Error` carrying `exitCode` 2 by hand among them, since
 * only a kind says what a refusal is.
 */
export const answerError: ErrorHandler = (err, c) => {
  if (isRefusal(err))
    return c.json({ error: err.message, ...(err._tag === 'Conflict' && err.users && { users: err.users }) }, REFUSAL_STATUS[err._tag]);
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err.message }, 500);
};

/** The code this process runs, as the lease records it: an install's kind, folder, tag and commit, not its source; a checkout's folder. */
const RELEASE = leaseRelease(runningRelease());

/**
 * Every service the api reads, live, over `env`: the settings read from it on each request (`ApiConfig`), the package's engine
 * (`Engine`) and root (`StoreRoot`), an MCP asker and a quota asker with nothing asked yet (`McpAsker`, `QuotaAsker`), reads that have
 * kept nothing yet (`ReadMemo`), the steps followed live, none yet (`Followings`), the hub the feed's lines are published to as the
 * process's daemon writes them (`feedHubLayer`), and the git place (`gitPlaceLayer`).
 */
export const liveOf = (env: NodeJS.ProcessEnv = process.env): Layer.Layer<Services> =>
  Layer.mergeAll(
    ApiConfig.layer(env, runningRelease()),
    Engine.live,
    StoreRoot.live,
    McpAsker.live,
    QuotaAsker.live,
    ReadMemo.live,
    Followings.live,
    feedHubLayer(),
    gitPlaceLayer,
  );

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
 * - factories/factories.ts — the factories a request may be answered in, each with its repositories, workflows and hires. Every route is
 *   answered in the factory and on the repository its query names (`?factory=`, `?repo=`), resolved before its handler runs, and refused
 *   when it names a repository no factory has (`placeFor`, factories/place.ts); a request naming neither is answered on the api's own.
 * - factories/rules.ts — a factory's rules, what every agent hired into it is told, read through `nemia factory rules`'s entry; written
 *   and removed on the routes the table generates from it.
 * - factories/instruction.ts — a factory's instruction, what Nemia is to know of it, read through `nemia factory instruction`'s entry;
 *   where it is kept put and cleared, and the store's text written and cleared, on the routes the table generates from it and
 *   `nemia factory instruct`'s.
 * - `GET /api/capabilities` — what the repository offers a step, read from the checkout on each request (capabilities/capabilities.ts), and
 *   what each step of each workflow gets of it (capabilities/reach.ts). Each MCP server the settings enable is started and asked for its
 *   tools once while the app runs (`McpAsker`); one that fails is an `error` on its entry, never a failed request.
 * - workflows/workflows.ts — a repository's workflows, listed, and a run of one started, the board's first write, or of an inbox card.
 * - workflows/builder.ts — a folder of yours built on the board: made with a first step, and put back from its steps with the schemas
 *   pasted for them; two writes, guarded as a start is, each through the package's entry `workflows write`.
 * - workflows/remove.ts — a folder of yours removed whole, its version checked, guarded as a start is, through the package's entry
 *   `workflows remove`.
 * - workflows/yours.ts — your store's folders under the store root, and the line that files a factory in it.
 * - agents/agents.ts — the agents beside each place workflows are listed from, each with the nodes that name it; one of yours made, put
 *   back or removed; three writes, guarded as a start is, through the package's entries `agents write` and `agents remove`.
 * - custom/custom.ts — a person's custom instructions for an agent, by its name, read through `nemia agents custom`'s entry; written and
 *   cleared on the routes the table generates from it (commands/routes.ts).
 * - agents/skills.ts — the skills an agent of yours can be given, by place; one skill on its page; and one of yours written — made,
 *   changed, or one Nemia ships copied into your library — each a write, guarded as a start is, through the package's entry `skills write`.
 * - inbox/inbox.ts — the inbox: its cards listed and one filed, through `nemia inbox`'s and `nemia inbox add`'s entries; one dropped and
 *   one queued on the routes the table generates (commands/routes.ts).
 * - runs/runs.ts — the runs listed, one run in full, and what `nemia decide` shows of it.
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
 *   factory/ceilings.ts), in the registry of the app's runtime: the files the runtime read for each request, its journals and every
 *   other, by its route's pattern (`api.poll.reads`, about, since a pass or another request reading at the same time is counted too),
 *   and the pass's (`pass.duration`, `pass.phase.duration`, `pass.journal_reads`, `store.runs`, `sessions.queued`, `sessions.admitted`)
 *   only where this process ticks: an api started with `--no-tick`, or beside a `nemia up`, has none of them.
 * - `GET /api/pause` — the store's pause, `{ pause, finishing, staged, held }`: since when, by whom and why, or null; each task still
 *   finishing under it (`{ run, step, kind }`, a `session`, `check` or `landing`), none once it is Paused; each landing it holds with its
 *   merge staged in the repository's checkout (MERGE_HEAD), and each other step signed off (`{ run, step }`), its check not filed until
 *   it resumes (`pausedRead`). Put on
 *   `POST /api/pause` and lifted on `DELETE /api/pause` (commands/routes.ts).
 * - `GET /api/pause/now` — what a pause at once (`POST /api/pause` with `now`) would stop, `{ interrupts, cost }`: each step session or
 *   check at work, of a run not called off, but a landing (`{ run, step, kind, taskId }`, a `session` or `check`), and the sentence of
 *   what an interrupted step costs (`nowRead`). Read off one view of the engine, and nothing written.
 * - `GET /api/daemon` — whether a nemia up ticks the store, and since when, and when it last passed: read off daemon.json and the process
 *   table as nemia ls reads them, and never written, the file being the daemon's. What the Factory says over its floor when nothing ticks.
 *   500 for a daemon.json that is there and cannot be read — a directory in its place, a permission: the package throws rather than call
 *   it free.
 * - `GET /api/quota` — the subscription's quota, as the engine's `quota` answers it for the `claude` harness (Claude Code's get_usage
 *   request), asked at most once a keep however many boards read (`QuotaAsker`, factory/quota.ts): what the Factory says over its floor.
 *   Every case is a 200 with a sentence, the harness's failures and the engine's refusals included.
 * - commands/routes.ts — a person's asks of a run, generated from the package's command table: a try (with answers to its questions,
 *   commands/extend.ts and asks/answers.ts), a round, words for a running session, an approval and an acceptance; five writes. And the
 *   store's pause put and lifted, `nemia pause` and `nemia resume`'s routes; an inbox card dropped, queued and taken off the queue; an
 *   agent's custom instructions written and cleared; and a factory's instruction put where it is kept, and written and cleared.
 * - steps/steps.ts — a step's own reads: its output, its files, and its conversation, once or followed.
 * - factory/feed.ts — the workflow feed followed, as server-sent events.
 * - machines/machines.ts — the state machines the board draws, listed, and one machine's graph, read off its code.
 * - nemia/nemia.ts — Nemia, the store's own agent: where she is (`nemia level`'s read), and the facts she keeps (`nemia memory`). Her
 *   level is set on the route the table generates from `nemia level`.
 *
 * A route lets the orchestrator's refusals through, and `onError` answers each from `REFUSAL_STATUS`, `{ error }` in its words
 * (`answerError`). Any other error is a 500 there: a route that has better words for one, or a truer status, answers it itself.
 */
export function appOf(layer: Layer.Layer<Services>): { app: Hono<ApiEnv>; runtime: ApiRuntime } {
  const runtime = ManagedRuntime.make(layer);
  const app = new Hono<ApiEnv>()
    .use(async (c, next) => {
      c.set('runtime', runtime);
      await next();
    })
    .get('/api/health', (c) => c.json({ ok: true }))
    .get('/api/version', (c) => c.json({ version: VERSION, release: RELEASE }))
    .get('/api/capabilities', (c) =>
      served(c, async ({ e, placeService, env, repo, home, mcp }) =>
        c.json(await capabilitiesWithSteps(repo, { e, placeService, env, home, asker: mcp })),
      ),
    )
    .route('/', factories)
    .route('/', factoryRules)
    .route('/', factoryInstruction)
    .route('/', workflows)
    .route('/', step)
    .route('/', builder)
    .route('/', remover)
    .route('/', yours)
    .route('/', agents)
    .route('/', customInstructions)
    .route('/', skills)
    .route('/', inbox)
    .route('/', runs)
    .route('/', stats)
    .get('/api/ceilings', (c) => served(c, async ({ e, placeService, env }) => c.json(await ceilingsOf(e, placeService, env))))
    .get('/api/passes', (c) => served(c, async ({ e, placeService }) => c.json(await passesOf(e, placeService, c.req.query('last')))))
    .get('/api/series', (c) =>
      served(c, async ({ e, placeService, memo }) => c.json(await seriesOf(e, placeService, c.req.query('range'), memo.series))),
    )
    .get('/api/metrics', async (c) => c.json(metricsOf(await runtime.runPromise(Metric.snapshot))))
    .get('/api/pause', (c) => served(c, async ({ e, placeService }) => c.json(await pauseOf(e, placeService))))
    .get('/api/pause/now', (c) => served(c, async ({ e, placeService }) => c.json(await pauseNowOf(e, placeService))))
    .get('/api/daemon', (c) => c.json(readDaemon()))
    .get('/api/quota', (c) =>
      served(c, async ({ e, env, quota }) => c.json(await quota({ env, ask: () => engineRead('quota', e.quota('claude')) }))),
    )
    .route('/', commands)
    .route('/', steps)
    .route('/', feed)
    .route('/', machines)
    .route('/', nemia)
    .onError(answerError);
  return { app, runtime };
}

/** The api the process serves (main.ts), over the live services and `process.env`, and its runtime. */
export const { app, runtime } = appOf(liveOf());
