/** The runs, for the board: every run listed, one run in full, and what `nemia decide` shows of it. */
import { Effect } from 'effect';
import { Hono } from 'hono';
import { COMMANDS, judgedUnlessUnreadable, viewsFor, runWith, type RunSummary } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import { decisionOf } from '../decide/decision.ts';
import { detail, type RunDetail } from '../detail/index.ts';
import { type ApiEnv, served } from '../layer.ts';
import { workflowPageOf, type WorkflowPageAddress } from '../step/step.ts';
import { findRun, noSuchRun, runPlaced } from '../store.ts';

/** A run as the list answers it: its summary, and the address of its workflow's page, null where the board pages none. */
export type RunListing = RunSummary & { workflowPage: WorkflowPageAddress | null };

/** A run as its page answers it: in full (`RunDetail`), and the address of its workflow's page, null where the board pages none. */
export type RunPage = RunDetail & { workflowPage: WorkflowPageAddress | null };

/** Every run's summary (`runs`), an entry of the package's table the api serves alone: on `GET /api/runs`. */
const RUNS = COMMANDS.find((c) => c.name === 'runs')!;

/** One run read for its page (`run`), an entry of the package's table the api serves alone: on `GET /api/runs/:id`. */
const RUN = COMMANDS.find((c) => c.name === 'run')!;

/** What a run would hand a run started with it as context (`concluded`), an entry of the package's table: on `GET …/concluded`. */
const CONCLUDED = COMMANDS.find((c) => c.name === 'concluded')!;

/**
 * The runs' routes: the list, one run in full, what `nemia decide` shows of it, and what it would hand as context. The board's writes on a
 * run — its removal and its prune among them — are the command table's routes (`commands`, commands/routes.ts).
 *
 * - `GET /api/runs` — every run's summary (`RunListing`), each with the address of its workflow's page (`workflowPageOf`), in the store's
 *   order: the package's entry (`runs`), handed the app's memo of runs at rest and its feed's filing times. One request costs, however many
 *   runs there are, one harness observation (one listing of the sessions it holds, one scan of the detached runs' files), a read of every
 *   task journal in the engine's store, and each run's record and workflow folder. The records are read before the engine: `nemia` files a
 *   step's task before it writes the id on the run, so every id read is in the listing that follows; the other way round, a task filed
 *   between the two reads would show as `unknown` until the next poll. A run that waits on runs reads each of them off the same views
 *   (`seenBy`): its record and git, and its tasks as they were listed. The feed's filing times are read once, on from where the last read
 *   stopped (`filedTimes`): when each run started. A run at rest is answered from the list's memo (`restingRead`) while nothing it was
 *   judged on has moved, so a poll reads the journals of the runs still moving and of none other; the rest are read through the request's
 *   own engine and the tick's last standing (`viewsFor`, `standingSnapshot`). With `WF_VERIFY_REST` a kept answer is judged afresh
 *   too, and one that differs fails the request.
 * - `GET /api/runs/:id` — a run in full (`detail`) with the address of its workflow's page (`RunPage`), found by the package's entry
 *   (`run`): refused with a 404 when there is no such run, and with a 502 when a task it reads does not, in the words the list says it with
 *   (`RunSummary.unreadable`).
 * - `GET /api/runs/:runId/decision` — what `nemia decide` shows a person (`decisionOf`), the route of its entry of the command table. Not
 *   on the page's poll, since it runs `git diff`. Refused as the run's page is: a 404 with no such run, and a 502 when a task it reads does
 *   not, in the words the list says it with (`RunSummary.unreadable`).
 * - `GET /api/runs/:runId/concluded` — what a run started now with `--from <runId>` would be handed of it (`nemia concluded`): the run,
 *   whether it has shipped and its `## From run` section, made by the package as the tick makes it. A 404 with no such run, the package's
 *   `Missing`, answered by `app.onError`.
 */

export const runs = new Hono<ApiEnv>()
  .get('/api/runs', (c) =>
    served(c, async ({ e, placeService, env, home, memo, repo }) => {
      const summaries = (await runPlaced(
        placeService,
        e,
        RUNS.handler({}, env, home, { runs: memo.resting, filings: memo.filings }),
      )) as unknown as RunSummary[];
      return c.json(summaries.map((run): RunListing => ({ ...run, workflowPage: workflowPageOf(run, repo, home) })));
    }),
  )
  .get('/api/runs/:id', (c) =>
    served(c, async (s) => {
      const id = c.req.param('id');
      const { run } = (await runPlaced(s.placeService, s.e, RUN.handler({ id }))) as { run: Run | null };
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const full = await detail(run, s);
      if ('unjudged' in full) return c.json({ error: full.unjudged }, 502);
      return c.json({ ...full, workflowPage: workflowPageOf(run, s.repo, s.home) } satisfies RunPage);
    }),
  )
  .get('/api/runs/:runId/decision', (c) =>
    served(c, async ({ e, placeService, home, env }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const { unreadable } = await runWith(e, viewsFor(e, [run]));
      const read = await runWith(
        e,
        judgedUnlessUnreadable(run, unreadable, () =>
          Effect.tryPromise({ try: () => decisionOf(run, e, placeService, home, env), catch: (err) => err }),
        ),
      );
      if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
      return c.json(read.judged);
    }),
  )
  .get('/api/runs/:runId/concluded', (c) =>
    served(c, async ({ e, placeService }) => c.json(await runPlaced(placeService, e, CONCLUDED.handler({ runId: c.req.param('runId') })))),
  );
