/** The runs, for the board: every run listed, one run in full, and what `wf decide` shows of it. */
import { Hono } from 'hono';
import { COMMANDS, judgedUnlessUnreadable, runsSummarized, verifiesRest, viewsFor } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import { decisionOf } from '../decide/decision.ts';
import { detail } from '../detail/index.ts';
import { type ApiEnv, served } from '../layer.ts';
import { findRun, noSuchRun } from '../store.ts';

/** One run read for its page (`run`), an entry of the package's table the api serves alone: on `GET /api/runs/:id`. */
const RUN = COMMANDS.find((c) => c.name === 'run')!;

/**
 * The runs' routes: the list, one run in full, and what `wf decide` shows of it. The board's writes on a run — its removal and its prune
 * among them — are the command table's routes (`commands`, commands/routes.ts).
 *
 * - `GET /api/runs` — every run's summary (`RunSummary`), in the store's order. One request costs, however many runs there are, one
 *   harness observation (one `claude agents --json`, one scan of the detached runs' files), a read of every task journal in the engine's
 *   store, and each run's record and workflow folder. The records are read before the engine: `wf` files a step's task before it writes
 *   the id on the run, so every id read is in the listing that follows; the other way round, a task filed between the two reads would show
 *   as `unknown` until the next poll. A run that waits on runs reads each of them off the same views (`seenBy`): its record and git, and
 *   its tasks as they were listed. The feed's filing times are read once, on from where the last read stopped (`filedTimes`): when each
 *   run started. A run at rest is answered from the list's memo (`restingRead`) while nothing it was judged on has moved, so a poll reads
 *   the journals of the runs still moving and of none other; the rest are read through the request's own engine and git (`viewsFor`,
 *   `branchReader`). With `WF_VERIFY_REST` a kept answer is judged afresh too, and one that differs fails the request.
 * - `GET /api/runs/:id` — a run in full (`detail`), found by the package's entry (`run`): refused with a 404 when there is no such run,
 *   and with a 502 when a task it reads does not, in the words the list says it with (`RunSummary.unreadable`).
 * - `GET /api/runs/:runId/decision` — what `wf decide` shows a person (`decisionOf`), the route of its entry of the command table. Not on
 *   the page's poll, since it runs `git diff`. Refused as the run's page is: a 404 with no such run, and a 502 when a task it reads does
 *   not, in the words the list says it with (`RunSummary.unreadable`).
 */

export const runs = new Hono<ApiEnv>()
  .get('/api/runs', (c) =>
    served(c, async ({ e, env, home, memo }) =>
      c.json(await runsSummarized(e, { home, memo: memo.resting, filings: memo.filings, verify: verifiesRest(env) })),
    ),
  )
  .get('/api/runs/:id', (c) =>
    served(c, async (s) => {
      const id = c.req.param('id');
      const { run } = (await RUN.handler(s.e, { id })) as { run: Run | null };
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const full = await detail(run, s);
      if ('unjudged' in full) return c.json({ error: full.unjudged }, 502);
      return c.json(full);
    }),
  )
  .get('/api/runs/:runId/decision', (c) =>
    served(c, async ({ e, home, env }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const { unreadable } = await viewsFor(e, [run]);
      const read = await judgedUnlessUnreadable(run, unreadable, () => decisionOf(run, e, home, env));
      if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
      return c.json(read.judged);
    }),
  );
