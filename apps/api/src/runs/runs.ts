/**
 * The runs, for the board: every run listed, the runs that wait or move with the counts, a page of the finished runs, one run in full,
 * and what `nemia decide` shows of it.
 */
import { Effect } from 'effect';
import { type Context, Hono } from 'hono';
import {
  type Command,
  COMMANDS,
  type FinishedPage,
  type FinishedRun,
  Informer,
  judgedUnlessUnreadable,
  type ListedRun,
  type OpenRuns,
  viewsFor,
  runWith,
  runObject,
  runLines,
  type RunLines,
  type RunObject,
  type RunSummary,
  type WaitingRun,
} from 'agent-orchestrator';
import { decisionOf } from '../decide/decision.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { workflowPageOf, type WorkflowPageAddress } from '../step/step.ts';
import { commandNamed, findRun, noSuchRun, runPlaced } from '../store.ts';

/**
 * The types of what the run object's sub-resources and its steps answer, judged by the package: a step's tries (`triesOf`), what it was
 * told (`toldOf`) and what its sessions used (`usedOf`), where the board's mirrors read them.
 */
export type {
  StepAcceptance,
  StepApproval,
  StepAttempts,
  StepCloseout,
  StepGate,
  StepReply,
  StepTry,
  StepUnreadable,
} from 'agent-orchestrator';
export type { StepFiled, StepRaise, TaskPart, RunRead, StepUsed, Usage } from 'agent-orchestrator';

/** A person's hold on a run, as `PUT /api/runs/:id/hold` answers it beside the run (`{ id, lifted: false, hold }`). */
export type { Hold } from 'agent-orchestrator/run';

/** A run as the list answers it: its summary, and the address of its workflow's page, null where the board pages none. */
export type RunListing = RunSummary & { workflowPage: WorkflowPageAddress | null };

/** A run as `GET /api/runs/:id` answers it: the package's run object, `nemia/v1`'s `Run`, the answer of `nemia show`. */
export type RunAnswer = RunObject.Run;

/**
 * The lines read beside the run object (`GET /api/runs/:runId/lines`): the command lines a person types about the run and each of its
 * steps (`runLines`), where it came from, and the address of its workflow's page (`workflowPageOf`), as the list gives it. Constant for a
 * run, off its record alone: the board reads it once and never again on the feed.
 */
export type RunLinesAnswer = RunLines & { workflowPage: WorkflowPageAddress | null };

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
const RUNS = commandNamed('runs');

/** The runs that wait or move, with the counts (`runs open`), an entry of the package's table: on `GET /api/runs-open`. */
const RUNS_OPEN = commandNamed('runs open');

/** One page of the finished runs (`runs finished`), an entry of the package's table: on `GET /api/runs-finished`. */
const RUNS_FINISHED = commandNamed('runs finished');

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
 * `program` over the app's informer of each run's judgement (`Informer`, the package's), which the store's daemon's pass fills: what the
 * run object and its sub-resources read a run's judgement through (`stepsReading`), and keep on a miss.
 */
const informed = <A, E, R>({ informer }: Served, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, Informer, informer);

/** What a list's read hands the package to keep between requests: the app's informer and its feed's filing times. */
const keptOf = ({ informer, memo }: Served) => ({ ...(informer ? { runs: informer } : {}), filings: memo.filings });

/** What the read `entry` answers `args`, handed the app's informer and its feed's filing times, as `GET /api/runs` hands them. */
const listRead = (s: Served, entry: (typeof COMMANDS)[number], args: Record<string, string>) =>
  runPlaced(s, s.e, entry.handler(args, s.env, s.home, keptOf(s)));

/** `rows`, each with the address of its workflow's page (`workflowPageOf`), as the whole list gives it. */
const paged = <R extends RunSummary>(rows: readonly R[], { repo, home }: Served): Array<R & Paged> =>
  rows.map((run) => ({ ...run, workflowPage: workflowPageOf(run, repo, home) }));

/**
 * Why `GET /api/runs/:id` refuses `?view=`, the page's `view=page` among them: it answers the run object alone, and names where the rest
 * is read.
 */
const noView = (id: string, view: string): string =>
  `GET /api/runs/${id} takes no view, not view=${view}: drop it — the route answers the run object; read a step's tries at ` +
  `/api/runs/${id}/steps/<step>/tries, what it was told at /api/runs/${id}/steps/<step>/told, and the command lines and the ` +
  `workflow's page at /api/runs/${id}/lines.`;

/** What a run would hand a run started with it as context (`concluded`), an entry of the package's table: on `GET …/concluded`. */
const CONCLUDED = commandNamed('concluded');

/**
 * The runs' routes: the list, one run in full, what `nemia decide` shows of it, and what it would hand as context. The board's writes on a
 * run — its removal and its prune among them — are the command table's routes (`commands`, commands/routes.ts).
 *
 * - `GET /api/runs` — every run's summary (`RunListing`), each with the address of its workflow's page (`workflowPageOf`), in the
 *   store's order: the package's entry (`runs`), handed the app's informer (`Informer`) and its feed's filing times. One request costs,
 *   however many runs there are, one harness observation (one listing of the sessions it holds, one scan of the detached runs' files),
 *   a read of every task journal in the engine's store, and each run's record and workflow folder. That is a cold read's cost: a warm
 *   one costs the store's stamp walk (one `readdir`, and a `stat` of each run's files) and the records and journals of the runs still
 *   moving, and reads no record of a run at rest — the informer hands the store the run it judged (`given`) in place of a read of it. The
 *   records are read before the engine: `nemia` files a step's task before it writes the id on the run, so every id read is in the
 *   listing that follows; the other way round, a task filed between the two reads would show as `unknown` until the next poll. A run
 *   that waits on runs reads each of them off the same views (`seenBy`): its record and git, and its tasks as they were listed. The
 *   feed's filing times are read once, on from where the last read stopped (`filedTimes`): when each run started. Each run's judgement is
 *   the informer's, the one the store's daemon's pass made and the run's object reads (`informerRead`): a run at rest is answered from it
 *   while nothing it was judged on has moved, and a moving one within the pass that judged it, so a poll reads the journals of the runs
 *   still moving and of none other; the rest are read through the request's own engine and the tick's last standing (`viewsFor`,
 *   `standingSnapshot`). With `WF_VERIFY_REST` a kept answer is judged afresh too, and one that differs fails the request: such a read
 *   is handed nothing from memory and reads every record again.
 * - `GET /api/runs-open` — the light answer (`OpenListing`), by the package's entry (`runs open`): the runs that wait on a person
 *   (`waiting`) and the runs in flight (`inFlight`), each in the store's order, and `counts` of each and of the finished runs; a run that
 *   moves and also waits is among the waiting, once. Each row is the list's own (`RunListing`) with its `wallMs`, created until now, and
 *   `finishedAt: null`. Every row, waiting or in flight, carries `clock`, its wall time in five parts that add up to it: sessions,
 *   checks, a wait on a person, a wait for a slot, and the rest; null where a task of the run does not read, or its record is gone since
 *   the list was read. A waiting row carries `stepCosts` besides, the cost of each of its steps, and `waitingSince`, the instant its
 *   present wait on a person began: the end of the waiting step's last try (the gate reached, the question asked) or the placing of a
 *   hold only a person lifts, the earliest where several are open; null where a task does not read or the record does not date the wait,
 *   as for a run that waits on one which never lands. A row in flight has neither of those two keys.
 *   `?ofFactory=` keeps the runs of one factory, `default` those whose record names none, compared as strings: a name no run carries
 *   answers empty lists and zero counts. Read off the same memo as `GET /api/runs`, with the journals of the waiting runs and of the runs
 *   in flight read for their breakdowns: it does not grow with the finished runs, and warm it costs no record of one.
 * - `GET /api/runs-finished` — one page of the finished runs (`FinishedListing`), by the package's entry (`runs finished`): newest first
 *   by `finishedAt`, when their work stopped — the later of the end of the last session or check and the cancellation — two that stopped
 *   together by id. Each row is the list's own with `finishedAt`, its `wallMs` until then, and its `outcome`: `succeeded`, `failed`,
 *   `cancelled`, or `undecided` for a run whose result nobody has decided. `?page=` is the page, from 1, and `?size=` its rows, 9 where
 *   none is said and at most 100; the answer says `total`, `page`, `size` and `pages`, at least 1. A page past the last is an empty page,
 *   200. A run that finishes between two reads moves every later row down one: a row is read twice, never skipped. `?ofFactory=` as
 *   above. A `page` that is no whole number from 1, or a `size` that is none from 1 to 100, is a 422 in the package's words (`Invalid`).
 *   Each row carries `clock` too, as a row of the light answer does, read where its work stopped so its five parts add up to its own
 *   `wallMs` and the breakdown of a finished run stands still. The page is cut before anything is read for it, so beyond what a warm
 *   `GET /api/runs` costs this read costs the records and the task journals of that page's rows alone — nine where the board asks, at
 *   most `?size=`'s hundred — and nothing for the finished runs it does not answer.
 * - `GET /api/runs/:id` — the run as one object (`RunAnswer`), the route of its entry of the command table (`show`), judged by the
 *   package (`runObject`) as `nemia show` judges it, off the app's informer (`Informer`) where it holds the run's judgement, handed the
 *   app's memo and the request's doors (`inRequest`), which the entry's own
 *   handler is not: so it is served here, by hand. Found among the runs the store lists, never by a path made of its id: refused with a
 *   404 when there is no such run, and with a 502 when a task it reads does not, in the words the list says it with
 *   (`RunSummary.unreadable`). It takes no `view`: the page `?view=page` once answered is gone, and any `view` is a 422 that says what
 *   to read in its place — the object here, a step's tries and told at their sub-resources, and the lines at `…/lines`.
 * - `GET /api/runs/:runId/lines` — the lines beside the object (`RunLinesAnswer`): the run's `decide` and `refresh` lines, each step's
 *   `approve`, `retry` and `say` by its name, where it came from (`fromNote`, null for a run started from no card), and the address of
 *   its workflow's page (`workflowPageOf`), the one the list gives the run. Off the run's record alone (`runLines`): it judges nothing and
 *   reads no task, and it is constant for the run, so the board reads it once. Served by hand, as no entry of the command table answers
 *   it; a 404 when there is no such run, as the object's route.
 * - `GET /api/runs/:runId/decision` — what `nemia decide` shows a person (`decisionOf`), the route of its entry of the command table. Not
 *   on the board's poll, since it runs `git diff`. Refused as the run's object is: a 404 with no such run, and a 502 when a task it reads
 *   does not, in the words the list says it with (`RunSummary.unreadable`).
 * - `GET /api/runs/:runId/concluded` — what a run started now with `--from <runId>` would be handed of it (`nemia concluded`): the run,
 *   whether it has landed and its `## From run` section, made by the package as the tick makes it. A 404 with no such run, the package's
 *   `Missing`, answered by `app.onError`.
 * - `GET /api/runs/:runId/steps/:step/tries`, `…/tries/:try`, `…/tries/:try/closeout` and `…/steps/:step/told` — the run object's
 *   sub-resources (`tries`, `try`, `closeout`, `told`): a step's tries, one try, its closeout, and the layers it was told. Each binds its
 *   path into the entry's arguments, as the CLI's flags do; a step or a try the run does not have is the package's `Missing`, a 404.
 */

/** The run object's sub-resources, each a read of the package's table served on its route. */
const TRIES = commandNamed('tries');
const TRY = commandNamed('try');
const CLOSEOUT = commandNamed('closeout');
const TOLD = commandNamed('told');

/** Answers a sub-resource's entry, its path's parameters bound to the argument keys of the same names. */
const subResource = (c: Context<ApiEnv>, command: Command) =>
  served(c, async (s) => c.json(await runPlaced(s, s.e, informed(s, command.handler(c.req.param(), s.env, s.home)))));

export const runs = new Hono<ApiEnv>()
  .get('/api/runs', (c) =>
    served(c, async (s) => {
      const summaries = (await runPlaced(s, s.e, RUNS.handler({}, s.env, s.home, keptOf(s)))) as unknown as RunSummary[];
      return c.json(summaries.map((run): RunListing => ({ ...run, workflowPage: workflowPageOf(run, s.repo, s.home) })));
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
  .get('/api/runs/:runId', (c) =>
    served(c, async (s) => {
      const id = c.req.param('runId');
      const raw = c.req.query('raw');
      if (raw !== undefined && raw !== 'false') return rawRecord(c, s, id, raw);
      const view = c.req.query('view');
      if (view !== undefined) return c.json({ error: noView(id, view) }, 422);
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const object = await runPlaced(s, s.e, informed(s, runObject(run, s)));
      if ('unjudged' in object) return c.json({ error: object.unjudged }, 502);
      return c.json(object satisfies RunAnswer);
    }),
  )
  .get('/api/runs/:runId/lines', (c) =>
    served(c, async ({ repo, home }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      return c.json({ ...runLines(run), workflowPage: workflowPageOf(run, repo, home) } satisfies RunLinesAnswer);
    }),
  )
  .get('/api/runs/:runId/decision', (c) =>
    served(c, async ({ e, placeService, home, env }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const { unreadable } = await runWith(e, viewsFor(e, [run]));
      const read = await runPlaced(
        { placeService, home },
        e,
        judgedUnlessUnreadable(run, unreadable, () =>
          Effect.tryPromise({ try: () => decisionOf(run, e, { placeService, home }, env), catch: (err) => err }),
        ),
      );
      if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
      return c.json(read.judged);
    }),
  )
  .get('/api/runs/:runId/steps/:step/tries', (c) => subResource(c, TRIES))
  .get('/api/runs/:runId/steps/:step/tries/:try', (c) => subResource(c, TRY))
  .get('/api/runs/:runId/steps/:step/tries/:try/closeout', (c) => subResource(c, CLOSEOUT))
  .get('/api/runs/:runId/steps/:step/told', (c) => subResource(c, TOLD))
  .get('/api/runs/:runId/concluded', (c) =>
    served(c, async ({ e, placeService, home }) =>
      c.json(await runPlaced({ placeService, home }, e, CONCLUDED.handler({ runId: c.req.param('runId') }))),
    ),
  )
  .get('/api/listing', (c) => subResource(c, LS))
  .get('/api/listing/:runId', (c) => subResource(c, LS));

/**
 * The reads `nemia` prints from, a client of the api, beside the board's: what `nemia ls` lists and a run's record as `nemia show --raw`
 * prints it.
 *
 * - `GET /api/listing` and `GET /api/listing/:runId` — `nemia ls`'s answer (`RunsListed`), every run or the one named, by its entry of the
 *   command table (`ls`), whose lines `nemia` prints: each run with its record, judged or left unjudged, and its result branches; the
 *   daemon's standing; where the branches stand; the pause; and the schedules. A run the store does not have is the package's `Missing`, a
 *   404. Not the board's list, which is `GET /api/runs`, and not in the OpenAPI document, which documents the run object alone.
 * - `GET /api/runs/:runId?raw=true` — the run's record as `nemia show --raw` prints it (`RawRecord`), by `show`'s entry with `raw` set:
 *   its brief cut at 120 characters and each frozen step's body at 60. `raw=false` is the object, as with no `raw`; any other value a 422
 *   naming `raw=true`; a run the store does not have a 404, as the object's.
 *
 * This is `nemia ls`'s entry of the package's table, served on the first two.
 */
const LS = commandNamed('ls');

/** `nemia show`'s entry of the package's table, whose `raw` answers the record. */
const SHOW = commandNamed('show');

/** A run's record as `GET /api/runs/:runId?raw=true` answers it: as `nemia show --raw` prints it. */
export type RawRecord = Readonly<Record<string, unknown>>;

/** `GET /api/runs/:runId?raw=…`: the record for `raw=true`, else a 422 naming it. */
async function rawRecord(c: Context<ApiEnv>, { e, placeService, env, home }: Served, id: string, raw: string) {
  if (raw !== 'true')
    return c.json({ error: `GET /api/runs/${id} takes raw=true for the run's record, or no raw for the run object: not raw=${raw}.` }, 422);
  if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
  const record: RawRecord = await runPlaced({ placeService, home }, e, SHOW.handler({ runId: id, raw: true }, env, home));
  return c.json(record);
}
