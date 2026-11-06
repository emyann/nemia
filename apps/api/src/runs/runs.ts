/**
 * The runs, for the board: the record of one, and what `nemia decide` shows of it. The board's list of the runs is the RunList asked by
 * state (`?fieldSelector=status.state…`, src/objects). The runs as objects — a `RunList` at `GET /api/runs` and
 * `GET /api/namespaces/<namespace>/runs`, a run at `GET /api/namespaces/<namespace>/runs/<name>` and `GET /api/runs/:runId` — and the
 * run's named actions are the objects' (src/objects).
 */
import { Effect } from 'effect';
import { type Context, Hono } from 'hono';
import { type Command, Informer, judgedUnlessUnreadable, viewsFor, runLines, type RunLines, type RunObject } from 'agent-orchestrator';
import { decisionOf } from '../decide/decision.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { workflowPageOf, type WorkflowPageAddress } from '../step/step.ts';
import { selectorOf } from '../labels/index.ts';
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
/** What a step's latest attempt ran on (`StepAttempts.latest`): its release and its harness, where the board's mirrors read them. */
export type { SessionHarness, SessionRelease } from 'agent-orchestrator';

/**
 * A person's hold on a run, as `POST /api/namespaces/:namespace/runs/:runId/hold` answers it beside the run (`{ id, lifted: false, hold
 * }`).
 */
export type { Hold } from 'agent-orchestrator/run';

/** A run as `GET /api/runs/:runId` answers it: the package's run object, `nemia/v1`'s `Run`, the answer of `nemia show`. */
export type RunAnswer = RunObject.Run;

/**
 * The lines read beside the run object (`GET /api/runs/:runId/lines`): the command lines a person types about the run and each of its
 * steps (`runLines`), where it came from, and the address of its workflow's page (`workflowPageOf`), as the board shows it. Constant for a
 * run, off its record alone: the board reads it once and never again on the feed.
 */
export type RunLinesAnswer = RunLines & { workflowPage: WorkflowPageAddress | null };

/**
 * `program` over the app's informer of each run's judgement (`Informer`, the package's), which the store's daemon's pass fills: what the
 * run object and its sub-resources read a run's judgement through (`stepsReading`), and keep on a miss.
 */
const informed = <A, E, R>({ informer }: Served, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(program, Informer, informer);

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
 * The runs' routes: the record of one run, what `nemia decide` shows of it, and what it would hand as
 * context. The run's named actions on it — its removal and its prune among them — are served in its namespace by the objects' handlers
 * (objects/runs.ts), through the command table's pipeline (`commandAnswered`, commands/routes.ts).
 *
 * - `GET /api/runs/:runId` — the run as one object (`RunAnswer`), served by the objects' handler (src/objects, the runs group of `objects`'
 *   `Api`), which this route hands it on to: `?raw=true` (the record, below) and any `view` are answered here. It takes no `view`: the
 *   page `?view=page` once answered is gone, and any `view` is a 422 that says what to read in its place — the object, a step's tries and
 *   told at their sub-resources, and the lines at `…/lines`.
 * - `GET /api/runs/:runId/lines` — the lines beside the object (`RunLinesAnswer`): the run's `decide` and `refresh` lines, each step's
 *   `approve`, `retry` and `say` by its name, where it came from (`fromNote`, null for a run started from no card), and the address of
 *   its workflow's page (`workflowPageOf`), the one the board links. Off the run's record alone (`runLines`): it judges nothing and
 *   reads no task, and it is constant for the run, so the board reads it once. Served by hand, as no entry of the command table answers
 *   it; a 404 when there is no such run, as the object's route.
 * - `GET /api/runs/:runId/decision` — what `nemia decide` shows a person (`decisionOf`), the route of its entry of the command table. Not
 *   on the board's poll, since it runs `git diff`. Refused as the run's object is: a 404 with no such run, and a 502 when a task it reads
 *   does not, in the words the list says it with.
 * - `GET /api/runs/:runId/concluded` — what a run started now with `--from <runId>` would be handed of it (`nemia concluded`): the run,
 *   whether it has landed and its `## From run` section, made by the package as the tick makes it. A 404 with no such run, the package's
 *   `Missing`, answered by `app.onError`.
 * - `GET /api/runs/:runId/steps/:step/tries`, `…/tries/:try`, `…/tries/:try/closeout` and `…/steps/:step/told` — the run object's
 *   sub-resources, served by the objects' handler (src/objects), off the same entries of the package's table.
 */

/**
 * Answers a sub-resource's entry, its path's parameters bound to the argument keys of the same names, and `query`'s arguments beside
 * them (the listing's `?selector=`).
 */
const subResource = (c: Context<ApiEnv>, command: Command, query: Record<string, string[]> = {}) =>
  served(c, async (s) => c.json(await runPlaced(s, s.e, informed(s, command.handler({ ...query, ...c.req.param() }, s.env, s.home)))));

export const runs = new Hono<ApiEnv>()
  .get('/api/runs/:runId', (c, next) => {
    const id = c.req.param('runId');
    const raw = c.req.query('raw');
    if (raw !== undefined && raw !== 'false') return served(c, (s) => rawRecord(c, s, id, raw));
    const view = c.req.query('view');
    if (view !== undefined) return c.json({ error: noView(id, view) }, 422);
    return next();
  })
  .get('/api/runs/:runId/lines', (c) =>
    served(c, async ({ repo, home }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      return c.json({ ...runLines(run), workflowPage: workflowPageOf(run, repo, home) } satisfies RunLinesAnswer);
    }),
  )
  .get('/api/runs/:runId/decision', (c) =>
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
  )
  .get('/api/runs/:runId/concluded', (c) =>
    served(c, async ({ e, placeService, home, trace }) =>
      c.json(await runPlaced({ placeService, home, trace }, e, CONCLUDED.handler({ runId: c.req.param('runId') }))),
    ),
  )
  .get('/api/listing', (c) => subResource(c, LS, selectorOf(c)))
  .get('/api/listing/:runId', (c) => subResource(c, LS, selectorOf(c)));

/**
 * The reads `nemia` prints from, a client of the api, beside the board's: what `nemia ls` lists and a run's record as `nemia show --raw`
 * prints it.
 *
 * - `GET /api/listing` and `GET /api/listing/:runId` — `nemia ls`'s answer (`RunsListed`), every run or the one named, by its entry of the
 *   command table (`ls`), whose lines `nemia` prints: each run with its record, judged or left unjudged, and its result branches; the
 *   daemon's standing; where the branches stand; the pause; and the schedules. A run the store does not have is the package's `Missing`, a
 *   404. Not the board's list, which is the RunList (`GET /api/runs`, by state with `?fieldSelector=status.state…`), and not
 *   in the OpenAPI document, which documents the run object alone.
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
async function rawRecord(c: Context<ApiEnv>, { e, placeService, env, home, trace }: Served, id: string, raw: string) {
  if (raw !== 'true')
    return c.json({ error: `GET /api/runs/${id} takes raw=true for the run's record, or no raw for the run object: not raw=${raw}.` }, 422);
  if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
  const record: RawRecord = await runPlaced({ placeService, home, trace }, e, SHOW.handler({ runId: id, raw: true }, env, home));
  return c.json(record);
}
