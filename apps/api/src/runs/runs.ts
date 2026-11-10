/**
 * What `nemia decide` shows of a run, for the board: `GET /api/runs/:runId/decision`, the one read of the run still served by Hono's route
 * here, until it is the runs group's (`objects`' `Api`, served by objects/runs.ts, where the run object, its lines, what it concludes, its
 * record, `nemia ls`'s listing and its named actions are). Not on the board's poll, since it runs `git diff`. Refused as the run's object
 * is: a 404 with no such run, and a 502 when a task it reads does not, in the words the list says it with.
 */
import { Effect } from 'effect';
import { Hono } from 'hono';
import { judgedUnlessUnreadable, viewsFor } from 'agent-orchestrator';
import { decisionOf } from '../decide/decision.ts';
import { type ApiEnv, served } from '../layer.ts';
import { findRun, noSuchRun, runPlaced } from '../store.ts';

export const runs = new Hono<ApiEnv>().get('/api/runs/:runId/decision', (c) =>
  served(c, async ({ e, placeService, home, env, trace }) => {
    const id = c.req.param('runId');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    const { unreadable } = await runPlaced({ placeService, home, trace }, e, viewsFor(e, [run]));
    const read = await runPlaced(
      { placeService, home, trace },
      e,
      judgedUnlessUnreadable(run, unreadable, () =>
        Effect.tryPromise({ try: () => decisionOf(run, e, { placeService, home, trace }, env), catch: (err) => err }),
      ),
    );
    if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
    return c.json(read.judged);
  }),
);
