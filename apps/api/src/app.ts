import { Hono } from 'hono';
import { agents, skills } from './agents/index.ts';
import { asks } from './asks/asks.ts';
import { capabilitiesWithSteps, repoOf } from './capabilities/index.ts';
import { ceilingsOf, feed, readDaemon, readQuota } from './factory/index.ts';
import { inbox } from './inbox/inbox.ts';
import { runs } from './runs/index.ts';
import { steps } from './steps/index.ts';
import { builder, workflows } from './workflows/index.ts';

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
 *   says over its floor. 500 for a `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the daemon's
 *   (`maxRuns`), or a record that does not parse.
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
  .get('/api/ceilings', async (c) => {
    try {
      return c.json(await ceilingsOf());
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  })
  .get('/api/daemon', (c) => {
    try {
      return c.json(readDaemon());
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  })
  .get('/api/quota', async (c) => c.json(await readQuota()))
  .route('/', asks)
  .route('/', steps)
  .route('/', feed);
