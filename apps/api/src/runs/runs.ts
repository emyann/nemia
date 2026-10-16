/**
 * The runs, for the board: every run listed, the runs that wait or move with the counts, a page of the finished runs, one run in full,
 * and what `nemia decide` shows of it.
 */
import { Effect } from 'effect';
import { Hono } from 'hono';
import {
  COMMANDS,
  type FinishedPage,
  type FinishedRun,
  judgedUnlessUnreadable,
  type ListedRun,
  type OpenRuns,
  viewsFor,
  runWith,
  type RunSummary,
  type WaitingRun,
} from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import { decisionOf } from '../decide/decision.ts';
import { detail, type RunDetail } from '../detail/index.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { workflowPageOf, type WorkflowPageAddress } from '../step/step.ts';
import { findRun, noSuchRun, runPlaced } from '../store.ts';

/** A run as the list answers it: its summary, and the address of its workflow's page, null where the board pages none. */
export type RunListing = RunSummary & { workflowPage: WorkflowPageAddress | null };

/** A run as its page answers it: in full (`RunDetail`), and the address of its workflow's page, null where the board pages none. */
export type RunPage = RunDetail & { workflowPage: WorkflowPageAddress | null };

/** What the list adds to a row: the address of its workflow's page, null where the board pages none. */
type Paged = { workflowPage: WorkflowPageAddress | null };

/** The runs that wait on a person and the runs in flight, with the three counts, as `GET /api/runs-open` answers them. */
export type OpenListing = Omit<OpenRuns, 'waiting' | 'inFlight'> & {
  waiting: Array<WaitingRun & Paged>;
  inFlight: Array<ListedRun & Paged>;
};

/** One page of the finished runs, as `GET /api/runs-finished` answers it. */
export type FinishedListing = Omit<FinishedPage, 'runs'> & { runs: Array<FinishedRun & Paged> };

/** Every run's summary (`runs`), an entry of the package's table the api serves alone: on `GET /api/runs`. */
const RUNS = COMMANDS.find((c) => c.name === 'runs')!;

/** The runs that wait or move, with the counts (`runs open`), an entry of the package's table: on `GET /api/runs-open`. */
const RUNS_OPEN = COMMANDS.find((c) => c.name === 'runs open')!;

/** One page of the finished runs (`runs finished`), an entry of the package's table: on `GET /api/runs-finished`. */
const RUNS_FINISHED = COMMANDS.find((c) => c.name === 'runs finished')!;

/**
 * The query keys the two reads of the list take, by the key of the entry's argument each sets. The factory to keep is read off
 * `ofFactory`, as `GET /api/stats` reads it, since `factory` names the place every route is answered in (`served`).
 */
const LIST_KEYS = { factory: 'ofFactory', page: 'page', size: 'size' } as const;

/** The arguments a request gives a read of the list: each key of `LIST_KEYS` its query says, and no other. */
const listArgs = (query: (name: string) => string | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(LIST_KEYS).flatMap(([key, name]) => {
      const value = query(name);
      return value === undefined ? [] : [[key, value]];
    }),
  );

/**
 * What the read `entry` answers `args`, handed the app's memo of runs at rest and its feed's filing times, as `GET /api/runs` hands
 * them.
 */
const listRead = ({ e, placeService, env, home, memo }: Served, entry: (typeof COMMANDS)[number], args: Record<string, string>) =>
  runPlaced(placeService, e, entry.handler(args, env, home, { runs: memo.resting, filings: memo.filings }));

/** `rows`, each with the address of its workflow's page (`workflowPageOf`), as the whole list gives it. */
const paged = <R extends RunSummary>(rows: readonly R[], { repo, home }: Served): Array<R & Paged> =>
  rows.map((run) => ({ ...run, workflowPage: workflowPageOf(run, repo, home) }));

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
 *   task journal in the engine's store, and each run's record and workflow folder. That is a cold read's cost: a warm one costs the
 *   store's stamp walk (one `readdir`, and a `stat` of each run's files) and the records and journals of the runs still moving, and reads
 *   no record of a run at rest — the memo hands the store the run it judged (`given`) in place of a read of it. The records are read before the engine: `nemia` files a
 *   step's task before it writes the id on the run, so every id read is in the listing that follows; the other way round, a task filed
 *   between the two reads would show as `unknown` until the next poll. A run that waits on runs reads each of them off the same views
 *   (`seenBy`): its record and git, and its tasks as they were listed. The feed's filing times are read once, on from where the last read
 *   stopped (`filedTimes`): when each run started. A run at rest is answered from the list's memo (`restingRead`) while nothing it was
 *   judged on has moved, so a poll reads the journals of the runs still moving and of none other; the rest are read through the request's
 *   own engine and the tick's last standing (`viewsFor`, `standingSnapshot`). With `WF_VERIFY_REST` a kept answer is judged afresh
 *   too, and one that differs fails the request: such a read is handed nothing from memory and reads every record again.
 * - `GET /api/runs-open` — the light answer (`OpenListing`), by the package's entry (`runs open`): the runs that wait on a person
 *   (`waiting`) and the runs in flight (`inFlight`), each in the store's order, and `counts` of each and of the finished runs; a run that
 *   moves and also waits is among the waiting, once. Each row is the list's own (`RunListing`) with its `wallMs`, created until now, and
 *   `finishedAt: null`. A waiting row carries `stepCosts`, the cost of each of its steps, and `clock`, its wall time in five parts that add
 *   up to it: sessions, checks, a wait on a person, a wait for a slot, and the rest; both null where a task of the run does not read.
 *   It carries `waitingSince` too, the instant its present wait on a person began: the end of the waiting step's last try (the gate
 *   reached, the question asked) or the placing of a hold only a person lifts, the earliest where several are open; null where a task
 *   does not read or the record does not date the wait, as for a run that waits on one which never ships. A row in flight has no such key.
 *   `?ofFactory=` keeps the runs of one factory, `default` those whose record names none, compared as strings: a name no run carries
 *   answers empty lists and zero counts. Read off the same memo as `GET /api/runs`, with the journals of the waiting runs read for their
 *   breakdowns: it does not grow with the finished runs, and warm it costs no record of one.
 * - `GET /api/runs-finished` — one page of the finished runs (`FinishedListing`), by the package's entry (`runs finished`): newest first
 *   by `finishedAt`, when their work stopped — the later of the end of the last session or check and the cancellation — two that stopped
 *   together by id. Each row is the list's own with `finishedAt`, its `wallMs` until then, and its `outcome`: `succeeded`, `failed`,
 *   `cancelled`, or `undecided` for a run whose result nobody has decided. `?page=` is the page, from 1, and `?size=` its rows, 9 where
 *   none is said and at most 100; the answer says `total`, `page`, `size` and `pages`, at least 1. A page past the last is an empty page,
 *   200. A run that finishes between two reads moves every later row down one: a row is read twice, never skipped. `?ofFactory=` as
 *   above. A `page` that is no whole number from 1, or a `size` that is none from 1 to 100, is a 422 in the package's words (`Invalid`).
 *   A warm read costs what a warm `GET /api/runs` costs, and no journal and no record of a run at rest.
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
  .get('/api/runs-open', (c) =>
    served(c, async (s) => {
      const open = (await listRead(
        s,
        RUNS_OPEN,
        listArgs((name) => c.req.query(name)),
      )) as unknown as OpenRuns;
      return c.json({ ...open, waiting: paged(open.waiting, s), inFlight: paged(open.inFlight, s) } satisfies OpenListing);
    }),
  )
  .get('/api/runs-finished', (c) =>
    served(c, async (s) => {
      const page = (await listRead(
        s,
        RUNS_FINISHED,
        listArgs((name) => c.req.query(name)),
      )) as unknown as FinishedPage;
      return c.json({ ...page, runs: paged(page.runs, s) } satisfies FinishedListing);
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
