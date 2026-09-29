import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { isRefusal, type Refusal } from 'agent-orchestrator/effect';
import { agents, skills } from './agents/index.ts';
import { asks } from './asks/asks.ts';
import { capabilitiesWithSteps, repoOf } from './capabilities/index.ts';
import { ceilingsOf, feed, readDaemon, readQuota } from './factory/index.ts';
import { inbox } from './inbox/inbox.ts';
import { runs } from './runs/index.ts';
import { steps } from './steps/index.ts';
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
 * The api: every route the board reads and writes, its groups each in a router of their own.
 *
 * - `GET /api/health` — `{ ok: true }` while the api answers.
 * - `GET /api/capabilities` — what the repository offers a step, read from the checkout on each request (capabilities/capabilities.ts), and
 *   what each step of each workflow gets of it (capabilities/reach.ts). Each MCP server the settings enable is started and asked for its
 *   tools once while the api runs; one that fails is an `error` on its entry, never a failed request.
 * - workflows/workflows.ts — a repository's workflows, listed, and a run of one started, the board's first write, or of an inbox card.
 * - workflows/builder.ts — a folder of yours built on the board: made with a first step, and put back from its steps with the schemas
 *   pasted for them; two writes, guarded as a start is, each through the package's `writeWorkflow`.
 * - agents/agents.ts — the agents beside each place workflows are listed from, each with the nodes that name it; one of yours made, put
 *   back or removed; three writes, guarded as a start is, through the package's `writeAgent` and `removeAgent`.
 * - agents/skills.ts — the skills an agent of yours can be given, by place; one skill on its page; and one of yours written — made,
 *   changed, or one HKB ships copied into your library — each a write, guarded as a start is, through the package's `writeSkill` and
 *   `copySkill`.
 * - inbox/inbox.ts — the inbox: its cards listed, one filed, one dropped; two writes, guarded as a start is.
 * - runs/runs.ts — the runs listed, one run in full, and what `wf decide` shows of it.
 * - `GET /api/ceilings` — the cap on runs in flight the daemon's last pass ran with, and the runs it counts and holds: what the Factory
 *   says over its floor. 422 for a `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the daemon's
 *   (`maxRuns`, an `Invalid`).
 * - `GET /api/daemon` — whether a wf up ticks the store, and since when, and when it last passed: read off daemon.json and the process
 *   table as wf ls reads them, and never written, the file being the daemon's. What the Factory says over its floor when nothing ticks.
 *   500 for a daemon.json that is there and cannot be read — a directory in its place, a permission: the package throws rather than call
 *   it free.
 * - `GET /api/quota` — the subscription's quota, as Claude Code answers its get_usage request, asked at most once a keep however many
 *   boards read (factory/quota.ts): what the Factory says over its floor. Every case is a 200 with a sentence, the harness's failures
 *   included.
 * - asks/asks.ts — a person's asks of a run: a try, a round, words for a running session, an approval and an acceptance; five writes.
 * - steps/steps.ts — a step's own reads: its output, its files, and its conversation, once or followed.
 * - factory/feed.ts — the workflow feed followed, as server-sent events.
 *
 * A route lets the orchestrator's refusals through, and `onError` answers each from `REFUSAL_STATUS`, `{ error }` in its words
 * (`answerError`). The two that carry more than a kind are the one exception, answered by their routes with what they carry: an
 * `AgentWriteError`, with the steps that name the agent (`refusalOf`, agents/agents.ts), and a `SkillWriteError` (`writeRefused`,
 * agents/skills.ts). Any other error is a 500 there: a route that has better words for one, or a truer status, answers it itself.
 */
export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/capabilities', async (c) => c.json(await capabilitiesWithSteps(repoOf())))
  .route('/', workflows)
  .route('/', builder)
  .route('/', agents)
  .route('/', skills)
  .route('/', inbox)
  .route('/', runs)
  .get('/api/ceilings', async (c) => c.json(await ceilingsOf()))
  .get('/api/daemon', (c) => c.json(readDaemon()))
  .get('/api/quota', async (c) => c.json(await readQuota()))
  .route('/', asks)
  .route('/', steps)
  .route('/', feed)
  .onError(answerError);
