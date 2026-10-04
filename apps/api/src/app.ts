import { Layer, ManagedRuntime } from 'effect';
import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { VERSION } from 'agent-orchestrator';
import { isRefusal, type Refusal } from 'agent-orchestrator/effect';
import { agents, skills } from './agents/index.ts';
import { customInstructions } from './custom/custom.ts';
import { commands } from './commands/index.ts';
import { capabilitiesWithSteps, McpAsker } from './capabilities/index.ts';
import { factories } from './factories/index.ts';
import { ceilingsOf, cordonOf, feed, QuotaAsker, readDaemon } from './factory/index.ts';
import { inbox } from './inbox/inbox.ts';
import { ApiConfig, type ApiEnv, type ApiRuntime, ReadMemo, served, type Services } from './layer.ts';
import { machines } from './machines/machines.ts';
import { runs } from './runs/index.ts';
import { stats } from './stats/stats.ts';
import { steps } from './steps/index.ts';
import { Engine, StoreRoot } from './store.ts';
import { builder, workflows } from './workflows/index.ts';

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
 * `{ error }` in its words; an `HTTPException` its own response; anything else a 500, `{ error }` its message, said on stderr — an `Error`
 * carrying `exitCode` 2 by hand among them, since only a kind says what a refusal is.
 */
export const answerError: ErrorHandler = (err, c) => {
  if (isRefusal(err)) return c.json({ error: err.message }, REFUSAL_STATUS[err._tag]);
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: err.message }, 500);
};

/**
 * Every service the api reads, live, over `env`: the settings read from it on each request (`ApiConfig`), the package's engine
 * (`Engine`) and root (`StoreRoot`), an MCP asker and a quota asker with nothing asked yet (`McpAsker`, `QuotaAsker`), and reads that have
 * kept nothing yet (`ReadMemo`).
 */
export const liveOf = (env: NodeJS.ProcessEnv = process.env): Layer.Layer<Services> =>
  Layer.mergeAll(ApiConfig.layer(env), Engine.live, StoreRoot.live, McpAsker.live, QuotaAsker.live, ReadMemo.live);

/**
 * An api over `layer`, and the runtime its handlers run on (`ManagedRuntime`), built from the layer once, the first time a request or
 * `runtime.context()` needs it, and put on every request before any router is reached (`served`, layer.ts). A service the layer gives
 * twice is the one given last (`Layer.merge`): how a test gives the api an engine, a root or an asker of its own.
 *
 * The api's routes: every one the board reads and writes, its groups each in a router of their own.
 *
 * - `GET /api/health` — `{ ok: true }` while the api answers.
 * - `GET /api/version` — `{ version }`, the orchestrator's package version (`VERSION`): what the board's bottom bar says.
 * - factories/factories.ts — the factories a request may be answered in, each with its repositories, workflows and hires. Every route is
 *   answered in the factory and on the repository its query names (`?factory=`, `?repo=`), resolved before its handler runs, and refused
 *   when it names a repository no factory has (`placeFor`, factories/place.ts); a request naming neither is answered on the api's own.
 * - `GET /api/capabilities` — what the repository offers a step, read from the checkout on each request (capabilities/capabilities.ts), and
 *   what each step of each workflow gets of it (capabilities/reach.ts). Each MCP server the settings enable is started and asked for its
 *   tools once while the app runs (`McpAsker`); one that fails is an `error` on its entry, never a failed request.
 * - workflows/workflows.ts — a repository's workflows, listed, and a run of one started, the board's first write, or of an inbox card.
 * - workflows/builder.ts — a folder of yours built on the board: made with a first step, and put back from its steps with the schemas
 *   pasted for them; two writes, guarded as a start is, each through the package's `writeWorkflow`.
 * - agents/agents.ts — the agents beside each place workflows are listed from, each with the nodes that name it; one of yours made, put
 *   back or removed; three writes, guarded as a start is, through the package's `writeAgent` and `removeAgent`.
 * - custom/custom.ts — a person's custom instructions for an agent, by its name, read through `wf agents custom`'s entry; written and
 *   cleared on the routes the table generates from it (commands/routes.ts).
 * - agents/skills.ts — the skills an agent of yours can be given, by place; one skill on its page; and one of yours written — made,
 *   changed, or one Nemia ships copied into your library — each a write, guarded as a start is, through the package's `writeSkill` and
 *   `copySkill`.
 * - inbox/inbox.ts — the inbox: its cards listed and one filed, through `wf inbox`'s and `wf inbox add`'s entries; one dropped and one
 *   queued on the routes the table generates (commands/routes.ts).
 * - runs/runs.ts — the runs listed, one run in full, and what `wf decide` shows of it.
 * - stats/stats.ts — the flow numbers of every run in the store, as `wf stats --json` prints them.
 * - `GET /api/ceilings` — the cap on runs in flight the daemon's last pass ran with, and the runs it counts and holds: what the Factory
 *   says over its floor. 422 for a `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the daemon's
 *   (`maxRuns`, an `Invalid`).
 * - `GET /api/cordon` — the store's cordon, `{ cordon, staged }`: since when, by whom and why, or null; and each landing it holds with its
 *   merge staged in the repository's checkout (MERGE_HEAD), its check not filed until the lift (`cordonRead`). Put on
 *   `POST /api/cordon` and lifted on `DELETE /api/cordon` (commands/routes.ts).
 * - `GET /api/daemon` — whether a wf up ticks the store, and since when, and when it last passed: read off daemon.json and the process
 *   table as wf ls reads them, and never written, the file being the daemon's. What the Factory says over its floor when nothing ticks.
 *   500 for a daemon.json that is there and cannot be read — a directory in its place, a permission: the package throws rather than call
 *   it free.
 * - `GET /api/quota` — the subscription's quota, as the engine's `quota` answers it for the `claude` harness (Claude Code's get_usage
 *   request), asked at most once a keep however many boards read (`QuotaAsker`, factory/quota.ts): what the Factory says over its floor.
 *   Every case is a 200 with a sentence, the harness's failures and the engine's refusals included.
 * - commands/routes.ts — a person's asks of a run, generated from the package's command table: a try (with answers to its questions,
 *   commands/extend.ts and asks/answers.ts), a round, words for a running session, an approval and an acceptance; five writes. And the
 *   store's cordon put and lifted, `wf cordon` and `wf uncordon`'s routes; an inbox card dropped, queued and taken off the queue; and an
 *   agent's custom instructions written and cleared.
 * - steps/steps.ts — a step's own reads: its output, its files, and its conversation, once or followed.
 * - factory/feed.ts — the workflow feed followed, as server-sent events.
 * - machines/machines.ts — the state machines the board draws, listed, and one machine's graph, read off its code.
 *
 * A route lets the orchestrator's refusals through, and `onError` answers each from `REFUSAL_STATUS`, `{ error }` in its words
 * (`answerError`). The two that carry more than a kind are the one exception, answered by their routes with what they carry: an
 * `AgentWriteError`, with the steps that name the agent (`refusalOf`, agents/agents.ts), and a `SkillWriteError` (`writeRefused`,
 * agents/skills.ts). Any other error is a 500 there: a route that has better words for one, or a truer status, answers it itself.
 */
export function appOf(layer: Layer.Layer<Services>): { app: Hono<ApiEnv>; runtime: ApiRuntime } {
  const runtime = ManagedRuntime.make(layer);
  const app = new Hono<ApiEnv>()
    .use(async (c, next) => {
      c.set('runtime', runtime);
      await next();
    })
    .get('/api/health', (c) => c.json({ ok: true }))
    .get('/api/version', (c) => c.json({ version: VERSION }))
    .get('/api/capabilities', (c) =>
      served(c, async ({ env, repo, home, mcp }) => c.json(await capabilitiesWithSteps(repo, { env, home, asker: mcp }))),
    )
    .route('/', factories)
    .route('/', workflows)
    .route('/', builder)
    .route('/', agents)
    .route('/', customInstructions)
    .route('/', skills)
    .route('/', inbox)
    .route('/', runs)
    .route('/', stats)
    .get('/api/ceilings', (c) => served(c, async ({ e, env }) => c.json(await ceilingsOf(e, env))))
    .get('/api/cordon', (c) => served(c, async ({ e }) => c.json(await cordonOf(e))))
    .get('/api/daemon', (c) => c.json(readDaemon()))
    .get('/api/quota', (c) => served(c, async ({ e, env, quota }) => c.json(await quota({ env, ask: () => e.quota('claude') }))))
    .route('/', commands)
    .route('/', steps)
    .route('/', feed)
    .route('/', machines)
    .onError(answerError);
  return { app, runtime };
}

/** The api the process serves (main.ts), over the live services and `process.env`, and its runtime. */
export const { app, runtime } = appOf(liveOf());
