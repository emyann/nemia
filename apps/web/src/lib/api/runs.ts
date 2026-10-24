/** Every run, as the Runs page and the Factory list them (`GET /api/runs`, apps/api/src/runs/runs.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { pace } from '../feed.ts';
import { get, send } from './read.ts';
import { RunGraphSchema, type RunGraph } from './graph.ts';
import { WorkflowPageAddressSchema, type WorkflowPageAddress } from './address.ts';
import {
  CheckVerdictSchema,
  RunPhaseSchema,
  RunReasonSchema,
  StepCodesFields,
  type CheckVerdict,
  type RunPhase,
  type RunReason,
  type StepPhase,
  type StepReason,
} from './reasons.ts';
import {
  AtWorkSchema,
  PlaceKindSchema,
  RunHoldingSchema,
  RunStatusSchema,
  RunToDecideSchema,
  RunTokensSchema,
  RunWaitingSchema,
  SpentSchema,
  StepNeedsFields,
  StringsSchema,
  type AtWork,
  type PlaceKind,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunTokens,
  type RunWaiting,
  type Spent,
  type StepNeeds,
} from './judged.ts';

/** Mirrors `RunListing` in apps/api/src/runs/runs.ts: a run's summary, and the address of its workflow's page. */
export type RunSummary = {
  id: string;
  /** The repository a repository run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  /** The factory the run was started in, as its record names it; null for a run of the default factory, whose record names none. */
  factory: string | null;
  place: PlaceKind;
  /** Where a folder run's work is: the directory its steps' folders are made under. Null on a repository run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from: its last segment names the workflow (`workflowNameOf`). */
  workflowDir: string;
  /** The address of its workflow's page, and each step's under it: null where the board pages none, as for a folder given by path. */
  workflowPage: WorkflowPageAddress | null;
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
  heldUntil: string[];
  /** The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. */
  holding: RunHolding | null;
  /**
   * The run in one word, as the CLI's `decide` says it: `failed` where a step broke, `awaiting approval` at its gates alone, `blocked`
   * where a step waits on an answer.
   */
  status: RunStatus;
  /** Where the run is in its life (`RunPhase`), as a code. */
  phase: RunPhase;
  /** Why it is in that phase (`RunReason`): `Held` for a running run a person holds. */
  reason: RunReason;
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
   * none; `since`: when its task at work started, null while none runs. `needs` and `blockedByHarness` are what a person has to know to
   * act on it (`StepNeeds`). `phase` and `reason` are where the step stands, as codes, which the board groups and colours by; `message`
   * is what the CLI's `ls` prints for it, shown and never compared; `verdict` its check's, as codes, null for a step its check did not
   * judge. `status` is `message` under its old name, which the api still sends and the board reads nowhere.
   */
  steps: Array<
    {
      name: string;
      taskId: string | null;
      branch: string | null;
      phase: StepPhase;
      reason: StepReason;
      message: string;
      verdict: CheckVerdict | null;
      /** @deprecated `message` under its old name: read `message`. */
      status: string;
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
  onYou: string[];
  /** What a person has to decide about the run's result (`RunToDecide`); null while there is nothing — which is every run still going. */
  toDecide: RunToDecide | null;
  /**
   * Why the run is not judged, when a task it reads has a journal that does not read, in the runtime's words; null for every run whose
   * tasks read. Such a run is answered off its record alone: `running`, moving, the unreadable step's status `unreadable`.
   */
  unreadable: string | null;
};

/** Decodes a `RunSummary`: each key the board reads, of its type and words; a key it does not know is dropped. */
const RunSummarySchema = decodes<RunSummary>()(
  Schema.Struct({
    id: Schema.String,
    repo: Schema.NullOr(Schema.String),
    factory: Schema.NullOr(Schema.String),
    place: PlaceKindSchema,
    work: Schema.NullOr(Schema.String),
    brief: Schema.String,
    workflowDir: Schema.String,
    workflowPage: Schema.NullOr(WorkflowPageAddressSchema),
    try: Schema.NullOr(Schema.Struct({ agent: Schema.String })),
    createdAt: Schema.String,
    startedAt: Schema.NullOr(Schema.String),
    cancelledAt: Schema.NullOr(Schema.String),
    pruned: Schema.NullOr(Schema.Struct({ said: Schema.String })),
    after: StringsSchema,
    context: StringsSchema,
    waiting: Schema.NullOr(RunWaitingSchema),
    heldUntil: StringsSchema,
    holding: Schema.NullOr(RunHoldingSchema),
    status: RunStatusSchema,
    phase: RunPhaseSchema,
    reason: RunReasonSchema,
    moving: Schema.Boolean,
    cost: Schema.NullOr(SpentSchema),
    atWork: Schema.NullOr(AtWorkSchema),
    tokens: Schema.NullOr(RunTokensSchema),
    steps: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          taskId: Schema.NullOr(Schema.String),
          branch: Schema.NullOr(Schema.String),
          ...StepCodesFields,
          verdict: Schema.NullOr(CheckVerdictSchema),
          status: Schema.String,
          note: Schema.NullOr(Schema.String),
          roundDue: Schema.Boolean,
          agent: Schema.NullOr(Schema.String),
          since: Schema.NullOr(Schema.String),
          ...StepNeedsFields,
        }),
      ),
    ),
    graph: RunGraphSchema,
    waitingOnYou: StringsSchema,
    onYou: StringsSchema,
    toDecide: Schema.NullOr(RunToDecideSchema),
    unreadable: Schema.NullOr(Schema.String),
  }),
);

/**
 * Every run. Read again on each event of the workflow feed (`useFeed`), and every 5 s while the feed is not followed — every minute while
 * it is.
 */
export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get('/api/runs', Schema.mutable(Schema.Array(RunSummarySchema))),
  refetchInterval: () => pace(5_000),
});

/**
 * Mirrors `ListedRun` in agent-orchestrator: the list's own row, its wall time (`wallMs`), when its work stopped, null while it has
 * not, and where that wall time went (`clock`), null where the api could not read it. Every row of both tables carries the clock, which
 * is what its Clock cell breaks down.
 */
export type ListedRun = RunSummary & { wallMs: number; finishedAt: string | null; clock: RunClock | null };

/**
 * Mirrors `RunClock` in agent-orchestrator: where a run's wall time went, in five parts that add up to `wallMs`: sessions at work,
 * checks running, a wait on a person, a wait for a slot, and the rest.
 */
export type RunClock = { wallMs: number; sessionsMs: number; checksMs: number; personMs: number; slotMs: number; restMs: number };

/** Mirrors `StepCost` of the light answer: what a step's tries cost; null for a step no cost was measured of. */
export type StepCost = { step: string; cost: Spent | null };

/**
 * Mirrors `WaitingRun` in agent-orchestrator: a run that waits on a person, with, beyond every row's `clock`, the cost of each of its
 * steps (`stepCosts`) and the instant its present wait on a person began (`waitingSince`), each null where the api could not read it,
 * the last also where the api dates no such wait.
 */
export type WaitingRun = ListedRun & { stepCosts: StepCost[] | null; waitingSince: string | null };

/**
 * Mirrors `OpenListing` in apps/api/src/runs/runs.ts: the instant it was read at (`asOf`), the runs that wait on a person (`waiting`)
 * and the runs in flight (`inFlight`), each run in one of the two, a run that moves and also waits among the waiting; and `counts` of
 * each and of the finished runs, which the answer lists none of.
 */
export type OpenRuns = {
  asOf: string;
  counts: { waiting: number; inFlight: number; finished: number };
  waiting: WaitingRun[];
  inFlight: ListedRun[];
};

/** Decodes a `RunClock`. */
const RunClockSchema = decodes<RunClock>()(
  Schema.Struct({
    wallMs: Schema.Number,
    sessionsMs: Schema.Number,
    checksMs: Schema.Number,
    personMs: Schema.Number,
    slotMs: Schema.Number,
    restMs: Schema.Number,
  }),
);

/** The keys a listed row adds to the whole list's (`ListedRun`). */
const ListedFields = {
  ...RunSummarySchema.fields,
  wallMs: Schema.Number,
  finishedAt: Schema.NullOr(Schema.String),
  clock: Schema.NullOr(RunClockSchema),
};

/** Decodes a `ListedRun`. */
const ListedRunSchema = decodes<ListedRun>()(Schema.Struct(ListedFields));

/** Decodes a `WaitingRun`: the listed row with its clock, its steps' costs and when its present wait began. */
const WaitingRunSchema = decodes<WaitingRun>()(
  Schema.Struct({
    ...ListedFields,
    stepCosts: Schema.NullOr(Schema.mutable(Schema.Array(Schema.Struct({ step: Schema.String, cost: Schema.NullOr(SpentSchema) })))),
    waitingSince: Schema.NullOr(Schema.String),
  }),
);

/** Decodes an `OpenRuns`: a waiting row with its costs and its wait besides, each row with its wall time and its clock. */
const OpenRunsSchema = decodes<OpenRuns>()(
  Schema.Struct({
    asOf: Schema.String,
    counts: Schema.Struct({ waiting: Schema.Number, inFlight: Schema.Number, finished: Schema.Number }),
    waiting: Schema.mutable(Schema.Array(WaitingRunSchema)),
    inFlight: Schema.mutable(Schema.Array(ListedRunSchema)),
  }),
);

/**
 * The light answer (`GET /api/runs-open`): the runs that wait and move with the counts, of every factory, or of `factory` alone
 * (`?ofFactory=`), `default` naming the runs of none. What the board's frame reads on every page. Keyed `['runs-open']`, and
 * `['runs-open', factory]` for one factory; read again on each event of the workflow feed (`useFeed`), and paced as `runsQuery` is.
 */
export const openRunsQuery = (factory?: string) =>
  queryOptions({
    queryKey: factory === undefined ? ['runs-open'] : ['runs-open', factory],
    queryFn: () => get(`/api/runs-open${factory === undefined ? '' : `?ofFactory=${encodeURIComponent(factory)}`}`, OpenRunsSchema),
    refetchInterval: () => pace(5_000),
  });

/** How a finished run ended, in the api's words: `undecided` for one whose result nobody has decided. */
export type RunOutcome = 'succeeded' | 'failed' | 'cancelled' | 'undecided';

/**
 * Mirrors a row of `FinishedListing` in apps/api/src/runs/runs.ts: the list's own row, when its work stopped (`finishedAt`), its wall
 * time from its creation until then (`wallMs`), how it ended (`outcome`), and where that wall time went (`clock`), read where its work
 * stopped and so standing still.
 */
export type FinishedRun = RunSummary & { wallMs: number; finishedAt: string; outcome: RunOutcome; clock: RunClock | null };

/**
 * Mirrors `FinishedListing`: one page of the finished runs, newest finished first, read at `asOf`. `total` rows in all, `page` from 1
 * of `pages`, at least one, of `size` rows each. A page past the last is answered with no row, and says the `pages` there are.
 */
export type FinishedPage = { asOf: string; total: number; page: number; size: number; pages: number; runs: FinishedRun[] };

/** Decodes a `FinishedPage`: each row the list's (`RunSummarySchema`) with its three facts and its clock. */
const FinishedPageSchema = decodes<FinishedPage>()(
  Schema.Struct({
    asOf: Schema.String,
    total: Schema.Number,
    page: Schema.Number,
    size: Schema.Number,
    pages: Schema.Number,
    runs: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          ...RunSummarySchema.fields,
          wallMs: Schema.Number,
          finishedAt: Schema.String,
          outcome: Schema.Literals(['succeeded', 'failed', 'cancelled', 'undecided']),
          clock: Schema.NullOr(RunClockSchema),
        }),
      ),
    ),
  }),
);

/** How many finished runs a page of the board holds. */
export const FINISHED_SIZE = 9;

/**
 * One page of the finished runs (`GET /api/runs-finished`), `FINISHED_SIZE` rows, of every factory, or of `factory` alone
 * (`?ofFactory=`). Keyed `['runs-finished', factory, page]`, the factory null for every factory's; read again on each event of the
 * workflow feed (`useFeed`), and paced as `runsQuery` is.
 */
export const finishedRunsQuery = (factory: string | undefined, page: number) =>
  queryOptions({
    queryKey: ['runs-finished', factory ?? null, page],
    queryFn: () =>
      get(
        `/api/runs-finished?page=${page}&size=${FINISHED_SIZE}${factory === undefined ? '' : `&ofFactory=${encodeURIComponent(factory)}`}`,
        FinishedPageSchema,
      ),
    refetchInterval: () => pace(5_000),
  });

/**
 * What a run started now with this one as context would be handed of it, as the CLI's `concluded` prints it: the run, whether it has
 * landed, and its section, in the words the run's steps would read.
 */
export type Concluded = { run: string; landed: boolean; section: string };

/** Decodes a `Concluded`. */
const ConcludedSchema = decodes<Concluded>()(
  Schema.Struct({
    run: Schema.String,
    landed: Schema.Boolean,
    section: Schema.String,
  }),
);

/** What a run would hand as context now (`GET /api/runs/:runId/concluded`): read again with the runs, since a source in flight moves on. */
export const concludedQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id, 'concluded'],
    queryFn: () => get(`/api/runs/${encodeURIComponent(id)}/concluded`, ConcludedSchema),
  });

/** What a removal answers: the run removed. */
const RemovedSchema = decodes<{
  id: string;
  removed: true;
}>()(Schema.Struct({ id: Schema.String, removed: Schema.Literal(true) }));

/**
 * Remove a try's run, as the CLI's `rm` removes it: its record, and the folders it worked in. The api removes only a try, and not one still
 * in flight; rejects with its refusal in full — the package's words, which say to cancel it first — or the api's own about the request.
 */
export const removeRun = (id: string): Promise<{ id: string; removed: true }> =>
  send('DELETE', `/api/runs/${encodeURIComponent(id)}`, RemovedSchema, {
    body: {},
    may: 'The run may be removed: look on the Runs page before removing it again.',
  });

/** What a lift answers: the run whose hold is lifted. The hold that was is dropped: nothing reads it. */
const LiftedSchema = decodes<{
  id: string;
  lifted: true;
}>()(Schema.Struct({ id: Schema.String, lifted: Schema.Literal(true) }));

/**
 * Lift a person's hold on a run, as the CLI's `hold <run> --off` lifts it: the hold's file removed, and the run goes on at the next tick.
 * Rejects with the api's refusal in full — the package's words for a run nobody holds — or its own about the request.
 */
export const liftHold = (id: string): Promise<{ id: string; lifted: true }> =>
  send('DELETE', `/api/runs/${encodeURIComponent(id)}/hold`, LiftedSchema, {
    body: {},
    may: "The hold may be lifted: look at the run's page before lifting it again.",
  });

/** Mirrors `Hold` in agent-orchestrator: when a person put a hold, the runs it waits on, why, and who put it. */
export type Hold = { at: string; until: string[]; why?: string; by?: string };

/** What a hold put answers: the run, and the hold as the package wrote it. */
export type Held = { id: string; lifted: false; hold: Hold };

/** Decodes a `Held`: `why` and `by` absent where the hold has none. */
const HeldSchema = decodes<Held>()(
  Schema.Struct({
    id: Schema.String,
    lifted: Schema.Literal(false),
    hold: Schema.Struct({
      at: Schema.String,
      until: StringsSchema,
      why: Schema.optionalKey(Schema.String),
      by: Schema.optionalKey(Schema.String),
    }),
  }),
);

/**
 * Hold a run until the runs `until` names land, as the CLI's `hold <run> --until <run>… --why <words>` holds it, `why` sent only where it
 * says something; who put it is the user the api runs as. Rejects with the api's refusal in full — the package's words for a run it will
 * not hold, or a run to wait on it will not take — or its own about the request.
 */
export const putHold = (id: string, until: readonly string[], why: string): Promise<Held> =>
  send('POST', `/api/runs/${encodeURIComponent(id)}/hold`, HeldSchema, {
    body: { until, ...(why.trim() ? { why } : {}) },
    may: 'The run may be held: look at its page before holding it again.',
  });

/**
 * What a prune gives back beyond the run's worktrees, as the CLI's `prune` takes it: `--artifacts`, its files; `--unmerged`, a run nobody
 * merged.
 */
export type PruneHow = { artifacts: boolean; unmerged: boolean };

/** What the api answers a prune with: the CLI `prune`'s lines, and how many places it could not remove (`left`), which those lines name. */
export type Pruned = { id: string; pruned: true; lines: string[]; left: number };

/** Decodes the api's answer to a prune: its lines, and each place it could not remove, by its path. */
const PruneAnswerSchema = Schema.Struct({
  pruned: Schema.Literal(true),
  lines: StringsSchema,
  left: Schema.Array(Schema.Struct({ path: Schema.String })),
});

/**
 * Prune a finished run, as the CLI's `prune <run> --yes` does: its worktrees removed, and its files with `artifacts`; a run nobody merged
 * only with `unmerged`. No branch is deleted. Rejects with the api's refusal in full — the package's words for a run not over, one already
 * pruned, or one nobody merged — or its own about the request.
 */
export async function pruneRun(id: string, how: PruneHow): Promise<Pruned> {
  const answer = await send('POST', `/api/runs/${encodeURIComponent(id)}/prune`, PruneAnswerSchema, {
    body: how,
    may: 'The run may be pruned: look at its page before pruning it again.',
  });
  return { id, pruned: true, lines: answer.lines, left: answer.left.length };
}
