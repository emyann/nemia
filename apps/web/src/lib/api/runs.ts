/**
 * Every run, as the Factory, the strips and the pickers list them, and the frame's and the Runs page's views of them, each read off the
 * RunList (`runs.listAll`, `runs.list`) and made the board's row of a run (`runRowOf`); and a run's named actions, each in the run's
 * namespace.
 */
import { queryOptions } from '@tanstack/react-query';
import { DEFAULT_NAMESPACE, type Run, type RunHeld, type RunList, type RunRemoved, type RunUnjudged } from 'objects';
import { Concluded as ConcludedAnswer, type RunClock, type RunOutcome, type StepCost } from 'objects';
import { pace } from '../feed.ts';
import { selectorKey } from './selector.ts';
import { call, read, runs, type RunListQuery } from './objects.ts';
import type { RunGraph } from './graph.ts';
import type { AnswerVia, RunPhase, RunReason, StepCheck, StepPhase, StepReason, WaitOn } from 'objects';
import type { AtWork, PlaceKind, RunHolding, RunStatus, RunToDecide, RunTokens, RunWaiting, Spent, StepNeeds } from './judged.ts';

export type { RunClock, RunOutcome, StepCost } from 'objects';

/** The board's row of a run, made of a `Run` (`runRowOf`), or of a run the list could not judge (`unjudgedRowOf`). */
export type RunSummary = {
  id: string;
  /** The repository a repository run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  /** The factory the run was started in, its namespace; null for a run of the default factory (`default`). */
  factory: string | null;
  place: PlaceKind;
  /** Where a folder run's work is: the directory its steps' folders are made under. Null on a repository run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from: its last segment names the workflow (`workflowNameOf`). */
  workflowDir: string;
  /** The agent it tried, for a try started from an agent's page; null for every other run. */
  try: { agent: string } | null;
  createdAt: string;
  /**
   * When the run started: the first filing of any of its tasks, off the engine's feed — for a run started `--after` runs, or held for a run
   * slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That the CLI's `prune` removed the run's worktrees, and its files too once `--artifacts` did, in the CLI `prune`'s words — what it
   * removed and what it kept — for the mark beside its status; null on a run never pruned.
   */
  pruned: { said: string } | null;
  /** The runs this one waits on (the CLI's `start --after`), as its record froze them: the edges into its card on the Factory. */
  after: string[];
  /** The runs it is handed as context (the CLI's `start --from`), read and never waited on: no edge on the Factory but on its focus. */
  context: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  /**
   * The runs a person holds this one until (the CLI's `hold`), as its hold file names them: the edges from their cards to its card, as
   * `after`'s are. None for a run nobody holds.
   */
  holdUntil: string[];
  /** The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. */
  holding: RunHolding | null;
  /**
   * The run in one word, as the CLI's `decide` says it: `failed` where a step broke, `awaiting approval` at its gates alone, `waiting`
   * where a step waits on a person otherwise.
   */
  status: RunStatus;
  /** Where the run is in its life (`RunPhase`), as a code. */
  phase: RunPhase;
  /**
   * Why it is in that phase (`RunReason`): `Waiting` for a running run a person holds, and for one a person's word stops the reason of
   * its first step that waits on them.
   */
  reason: RunReason;
  /** What a `Waiting` run waits on (`run`, a hold), null on any other reason. */
  on: WaitOn | null;
  /** Where an `AwaitingAnswer` run's answer is asked, its first waiting step's; null on any other reason, and where no step says. */
  via: AnswerVia | null;
  /**
   * Whether anything of the run still moves: a task the engine holds for it, or a step or check a tick would still file — the roots of a
   * run waiting on runs that may still land among them, and not those of one waiting on a run that never lands without a person.
   */
  moving: boolean;
  /** What the run has cost so far, every step's tries together, as the CLI's `ls` adds it up (`Spent`); null until a cost was measured. */
  cost: Spent | null;
  /** What the run took at work (`AtWork`), off its tasks' intervals; null where the api could not read it. */
  atWork: AtWork | null;
  /** The tokens its sessions used (`RunTokens`); null until one measured any. */
  tokens: RunTokens | null;
  /**
   * `note` is what the CLI's `ls` prints beside the status — the try or round a step is on, or the one due — and null where it prints
   * nothing. `roundDue`: whether a looping step's next round is due, which the note words. `agent`: the agent the step is given, null for
   * none; `since`: when its task at work started, null while none runs. `needs` and `waitingFor` are what a person has to know to
   * act on it (`StepNeeds`). `phase` and `reason` are where the step stands, as codes, which the board groups and colours by, with `on`
   * and `via` qualifying a `Waiting` and an `AwaitingAnswer` (`StepCodes`); `message` is what the CLI's `ls` prints for it, shown and
   * never compared; `verdict` its check's, as codes, null for a step its check did not judge.
   */
  steps: Array<
    {
      name: string;
      taskId: string | null;
      branch: string | null;
      phase: StepPhase;
      reason: StepReason;
      on: WaitOn | null;
      via: AnswerVia | null;
      message: string;
      verdict: StepCheck['verdict'];
      note: string | null;
      roundDue: boolean;
      agent: string | null;
      since: string | null;
    } & StepNeeds
  >;
  /** The steps as a graph, as the run's page has it: the Factory's card draws its flow off it, with no read of the run. */
  graph: RunGraph;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget. Empty on a cancelled run.
   */
  waitingOnYou: string[];
  /**
   * `waitingOnYou` as the CLI's `ls` names it after `→ waiting on you:`, one entry a step: its name, or for a step at its gate, `approve
   * plan`.
   */
  waitingOnYouWords: string[];
  /** What a person has to decide about the run's result (`RunToDecide`); null while there is nothing — which is every run still going. */
  toDecide: RunToDecide | null;
  /**
   * Why the run is not judged, when a task it reads has a journal that does not read, in the list's words (`RunUnjudged.error`); null
   * for every run judged. Such a run is a bare row (`unjudgedRowOf`): its name, its factory, `running` and moving, and no step.
   */
  unreadable: string | null;
  /** The run's whole label map: its own labels, `workflow`, and `factory` when it names one. */
  labels: Record<string, string>;
};

/** A step of a run as its row has it. */
type RowStep = RunSummary['steps'][number];

/**
 * When the step's task still at work started: the earliest `spawnedAt` of a session or check of its tries that has not ended, as the
 * orchestrator's `atWork` of the step alone says it; null while none runs.
 */
function sinceOf(step: Pick<Run['status']['steps'][number], 'timeline'>): string | null {
  const open = step.timeline
    .flatMap((t) => [t.session, t.check])
    .flatMap((span) => (span && span.spawnedAt !== null && span.endedAt === null ? [span.spawnedAt] : []));
  return open.length === 0 ? null : open.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
}

/** The factory of a run in `namespace`: null for the default factory's, which names none. */
const factoryOf = (namespace: string | undefined): string | null =>
  namespace === undefined || namespace === DEFAULT_NAMESPACE ? null : namespace;

/**
 * The board's row of a run (`RunSummary`), off its object: its name and factory (its namespace, `default` for none), what it froze, what
 * is judged of it, and each step with the agent it froze (`spec.steps`) and when its task at work started (`sinceOf`); its graph without
 * what a step is handed, which the board draws no edge of.
 */
export function runRowOf(run: Run): RunSummary {
  const { metadata, spec, status } = run;
  const agents = new Map(spec.steps.map((s) => [s.name, s.agent ?? null]));
  return {
    id: metadata.name,
    repo: spec.repo,
    factory: factoryOf(metadata.namespace),
    place: spec.place,
    work: spec.work,
    brief: spec.brief,
    workflowDir: spec.workflowDir,
    try: spec.try,
    createdAt: metadata.creationTimestamp,
    startedAt: status.startedAt,
    cancelledAt: status.cancelledAt,
    pruned: status.pruned ? { said: status.pruned.said ?? '' } : null,
    after: spec.after,
    context: spec.context,
    waiting: status.waiting,
    holdUntil: status.holdUntil,
    holding: status.holding,
    status: status.status,
    phase: status.phase,
    reason: status.reason,
    on: status.on,
    via: status.via,
    moving: status.moving,
    cost: status.cost,
    atWork: status.atWork,
    tokens: status.tokens,
    steps: status.steps.map((s): RowStep => ({
      name: s.name,
      taskId: s.taskId,
      branch: s.branch,
      phase: s.phase,
      reason: s.reason,
      on: s.on,
      via: s.via,
      message: s.message,
      verdict: s.verdict,
      note: s.note,
      roundDue: s.roundDue,
      agent: agents.get(s.name) ?? null,
      since: sinceOf(s),
      needs: s.needs,
      waitingFor: s.waitingFor,
      approve: s.approve,
      denied: s.denied,
      sessionUnread: s.sessionUnread,
    })),
    graph: {
      roots: status.graph.roots,
      edges: status.graph.edges.flatMap((e) => (e.kind === 'input' ? [] : [e])),
      ...(status.graph.nodes ? { nodes: status.graph.nodes } : {}),
    },
    waitingOnYou: status.waitingOnYou,
    waitingOnYouWords: status.waitingOnYouWords,
    toDecide: status.toDecide,
    unreadable: null,
    labels: metadata.labels,
  };
}

/**
 * The row of a run the list could not judge (`RunUnjudged`): its name, its factory and why (`unreadable`), and nothing judged — `running`
 * and moving, as the tick counts it in flight, with no step, so its card is bare.
 */
export const unjudgedRowOf = (run: RunUnjudged): RunSummary => ({
  id: run.name,
  repo: null,
  factory: factoryOf(run.namespace),
  place: 'git',
  work: null,
  brief: '',
  workflowDir: '',
  try: null,
  createdAt: '',
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  after: [],
  context: [],
  waiting: null,
  holdUntil: [],
  holding: null,
  status: 'running',
  phase: 'running',
  reason: 'Running',
  on: null,
  via: null,
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  steps: [],
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  waitingOnYouWords: [],
  toDecide: null,
  unreadable: run.error,
  labels: {},
});

/** Every row of a list: each run judged, then each it could not judge, in name order as the list's. */
export const rowsOf = (list: RunList): RunSummary[] =>
  [...list.items.map(runRowOf), ...(list.unjudged ?? []).map(unjudgedRowOf)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Every run of `query`, the RunList whole: a plain list, no page and no state, so no run's frame is measured. */
const everyRun = (query: RunListQuery = {}): Promise<RunSummary[]> => runs.listAll(query).then(rowsOf);

/**
 * Every run (`GET /api/runs`). Read again on each event of the workflow feed (`useFeed`), and every 5 s while the feed is not followed —
 * every minute while it is.
 */
export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => everyRun(),
  refetchInterval: () => pace(5_000),
});

/** The runs `selector` takes by their labels (`GET /api/runs?labelSelector=`), under `['runs']`, read again as it is. */
export const runsSelectedQuery = (selector: string) =>
  queryOptions({
    queryKey: ['runs', ...selectorKey(selector)],
    queryFn: () => everyRun(selector.trim() === '' ? {} : { labelSelector: selector.trim() }),
    refetchInterval: () => pace(5_000),
  });

/**
 * A run's row in the frame, as a list asked by state carries it: its wall time to the list's `asOf` (`wallMs`), when its work stopped,
 * null while it has not, and where that wall time went (`clock`), null where the api could not read it — what its Clock cell breaks down.
 */
export type ListedRun = RunSummary & { wallMs: number; finishedAt: string | null; clock: RunClock | null };

/**
 * A run that waits on a person, as the frame lists it: beyond every row's `clock`, the cost of each of its steps (`stepCosts`) and the
 * instant its present wait on a person began (`waitingSince`), each null where the api could not read it, the last also where the api
 * dates no such wait.
 */
export type WaitingRun = ListedRun & { stepCosts: StepCost[] | null; waitingSince: string | null };

/**
 * The frame, off the list of the runs not finished: the instant it is measured to (`asOf`), the runs that wait on a person (`waiting`)
 * and the runs in flight (`inFlight`), each in one by its `status.state`, and `counts` of each and of the finished runs, which it lists
 * none of.
 */
export type OpenRuns = {
  asOf: string;
  counts: { waiting: number; inFlight: number; finished: number };
  waiting: WaitingRun[];
  inFlight: ListedRun[];
};

/** A run's row with the frame's parts its by-state list carries, each none where a plain list answered. */
const listedOf = (row: RunSummary, status: Partial<Run['status']>): ListedRun => ({
  ...row,
  wallMs: status.wallMs ?? 0,
  finishedAt: status.finishedAt ?? null,
  clock: status.clock ?? null,
});

/** A waiting run's row, with its steps' costs and the start of its wait. */
const waitingOf = (row: RunSummary, status: Partial<Run['status']>): WaitingRun => ({
  ...listedOf(row, status),
  stepCosts: status.stepCosts ?? null,
  waitingSince: status.waitingSince ?? null,
});

/** The counts a by-state list carries, none where a list carries none. */
const NO_COUNTS = { waiting: 0, inFlight: 0, finished: 0 };

/** Each run of a by-state list with its state and its frame's parts, judged or not, in name order. */
const statedOf = (list: RunList): Array<{ row: RunSummary; state: Run['status']['state']; status: Partial<Run['status']> }> =>
  [
    ...list.items.map((run) => ({ row: runRowOf(run), state: run.status.state, status: run.status })),
    ...(list.unjudged ?? []).map((u) => ({ row: unjudgedRowOf(u), state: u.state ?? ('inFlight' as const), status: {} })),
  ].sort((a, b) => (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));

/** The frame (`OpenRuns`) off the list of the runs not finished: each run in its state's part, the counts and `asOf` the list's. */
export function openOf(list: RunList): OpenRuns {
  const stated = statedOf(list);
  return {
    asOf: list.metadata.asOf ?? new Date().toISOString(),
    counts: list.metadata.counts ?? NO_COUNTS,
    waiting: stated.flatMap((s) => (s.state === 'waiting' ? [waitingOf(s.row, s.status)] : [])),
    inFlight: stated.flatMap((s) => (s.state === 'waiting' || s.state === 'finished' ? [] : [listedOf(s.row, s.status)])),
  };
}

/** The field selector of the frame: every run not finished. */
export const OPEN_SELECTOR = 'status.state!=finished';

/** The field selector of the finished runs, newest finished first. */
export const FINISHED_SELECTOR = 'status.state=finished';

/** A list of runs, of every factory or of `factory` alone (its namespace, `default` the runs of none). */
const listOf = (factory: string | undefined, query: RunListQuery): Promise<RunList> =>
  factory === undefined ? runs.listAll(query) : runs.list(factory, query);

/** `query` with the label selector `selector` says, none for none. */
const labelled = (query: RunListQuery, selector: string | undefined): RunListQuery =>
  selector === undefined || selector.trim() === '' ? query : { ...query, labelSelector: selector.trim() };

/**
 * The frame (`GET /api/runs?fieldSelector=status.state!=finished`, or `/api/namespaces/<factory>/runs` for one factory, `default` naming
 * the runs of none): the runs that wait and move with the counts, what the board's frame reads on every page. Keyed `['runs-open']`, and
 * `['runs-open', factory]` for one factory; read again on each event of the workflow feed (`useFeed`), and paced as `runsQuery` is.
 */
export const openRunsQuery = (factory?: string, selector?: string) =>
  queryOptions({
    queryKey: [...(factory === undefined ? ['runs-open'] : ['runs-open', factory]), ...selectorKey(selector)],
    queryFn: () => listOf(factory, labelled({ fieldSelector: OPEN_SELECTOR }, selector)).then(openOf),
    refetchInterval: () => pace(5_000),
  });

/**
 * A finished run's row: when its work stopped (`finishedAt`), its wall time from its creation until then (`wallMs`), how it ended
 * (`outcome`), and where that wall time went (`clock`), read where its work stopped and so standing still.
 */
type FinishedRun = RunSummary & { wallMs: number; finishedAt: string; outcome: RunOutcome; clock: RunClock | null };

/**
 * One page of the finished runs, newest finished first, measured to `asOf`: `total` finished in all (the list's count), the rows of this
 * page, and the token of the next, older page (`continue`), null on the last. A token past the last is answered with no row.
 */
export type FinishedPage = { asOf: string; total: number; runs: FinishedRun[]; continue: string | null };

/**
 * A page of the finished runs off the list asked `status.state=finished`: each run judged with its finish, in the list's order. A run the
 * list could not judge has no finish to say and is no row of it; the count holds it.
 */
export function finishedOf(list: RunList): FinishedPage {
  return {
    asOf: list.metadata.asOf ?? new Date().toISOString(),
    total: list.metadata.counts?.finished ?? list.items.length,
    runs: list.items.map((run) => ({
      ...runRowOf(run),
      wallMs: run.status.wallMs ?? 0,
      finishedAt: run.status.finishedAt ?? run.metadata.creationTimestamp,
      outcome: run.status.outcome ?? 'undecided',
      clock: run.status.clock ?? null,
    })),
    continue: list.metadata.continue || null,
  };
}

/** How many finished runs a page of the board holds. */
export const FINISHED_SIZE = 9;

/**
 * One page of the finished runs (`GET /api/runs?fieldSelector=status.state=finished&limit=9`), of every factory or of `factory` alone, from
 * the token the page before it answered, the last of `older` (`continue`), the first page for none. Keyed `['runs-finished', factory,
 * token]`, the factory and the token null for every factory's and the first page; read again on each event of the workflow feed
 * (`useFeed`), and paced as `runsQuery` is.
 */
export const finishedRunsQuery = (factory: string | undefined, older: readonly string[], selector?: string) => {
  const from = older.at(-1);
  return queryOptions({
    queryKey: ['runs-finished', factory ?? null, from ?? null, ...selectorKey(selector)],
    queryFn: () =>
      listOf(
        factory,
        labelled({ fieldSelector: FINISHED_SELECTOR, limit: FINISHED_SIZE, ...(from === undefined ? {} : { continue: from }) }, selector),
      ).then(finishedOf),
    refetchInterval: () => pace(5_000),
  });
};

/** What a run would hand as context now (`GET /api/runs/:runId/concluded`): read again with the runs, since a source in flight moves on. */
export const concludedQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id, 'concluded'],
    queryFn: () => call((c) => c.runs.concluded({ params: { name: id } }), read(ConcludedAnswer)),
  });

/**
 * Remove a try's run, as the CLI's `rm` removes it: its record, and the folders it worked in, in the run's namespace (`namespaceOf`). The
 * api removes only a try, and not one still in flight; rejects with its refusal in full — the package's words, which say to cancel it
 * first — or the api's own about the request.
 */
export const removeRun = (namespace: string, id: string): Promise<RunRemoved> =>
  runs.delete(namespace, id, 'The run may be removed: look on the Runs page before removing it again.');

/**
 * Lift a person's hold on a run, as the CLI's `hold <run> --off` lifts it: the hold's file removed, and the run goes on at the next tick.
 * Rejects with the api's refusal in full — the package's words for a run nobody holds — or its own about the request.
 */
export const liftHold = (namespace: string, id: string): Promise<RunHeld> =>
  runs.unhold(namespace, id, "The hold may be lifted: look at the run's page before lifting it again.");

/**
 * Hold a run until the runs `until` names land, as the CLI's `hold <run> --until <run>… --why <words>` holds it, `why` sent only where it
 * says something; who put it is the user the api runs as. Rejects with the api's refusal in full — the package's words for a run it will
 * not hold, or a run to wait on it will not take — or its own about the request.
 */
export const putHold = (namespace: string, id: string, until: readonly string[], why: string): Promise<RunHeld> =>
  runs.hold(namespace, id, { until, ...(why.trim() ? { why } : {}) }, 'The run may be held: look at its page before holding it again.');

/**
 * What a prune gives back beyond the run's worktrees, as the CLI's `prune` takes it: `--artifacts`, its files; `--unmerged`, a run nobody
 * merged.
 */
export type PruneHow = { artifacts: boolean; unmerged: boolean };

/** What a prune did, as the board says it: the CLI `prune`'s lines, and how many places it could not remove (`left`), which they name. */
type Pruned = { id: string; pruned: true; lines: string[]; left: number };

/**
 * Prune a finished run, as the CLI's `prune <run> --yes` does: its worktrees removed, and its files with `artifacts`; a run nobody merged
 * only with `unmerged`. No branch is deleted. Rejects with the api's refusal in full — the package's words for a run not over, one already
 * pruned, or one nobody merged — or its own about the request.
 */
export async function pruneRun(namespace: string, id: string, how: PruneHow): Promise<Pruned> {
  const answer = await runs.prune(namespace, id, how, 'The run may be pruned: look at its page before pruning it again.');
  return { id, pruned: true, lines: [...answer.lines], left: answer.left.length };
}
