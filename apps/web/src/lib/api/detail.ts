/**
 * A run's detail, as its page reads it (`GET /api/runs/:id`, apps/api/src/detail/detail.ts): each step's spec, filing, gate, tries and
 * timeline. Each type has its schema beside it, which `get` decodes the api's answer with.
 */
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { pace } from '../feed.ts';
import { ReadRefusal, get } from './read.ts';
import type { RetryMode, Said } from './asks.ts';
import { RunGraphSchema, type RunGraph } from './graph.ts';
import { WorkflowPageAddressSchema, type WorkflowPageAddress } from './address.ts';
import { BridgeSchema, type Bridge } from './bridge.ts';
import { CheckVerdictSchema, RunCodesFields, StepCodesFields, type CheckVerdict, type RunCodes, type StepCodes } from './reasons.ts';
import { StepLayersSchema, TaskPartSchema, type StepLayers, type TaskPart } from './layers.ts';
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
import {
  StepArtifactSchema,
  StepAttemptsSchema,
  StepCheckSchema,
  StepCloseoutSchema,
  StepTrySchema,
  StepUnreadableSchema,
  type StepArtifact,
  type StepAttempts,
  type StepCheck,
  type StepCloseout,
  type StepTry,
  type StepUnreadable,
} from './tries.ts';
import { RunReadSchema, StepUsedSchema, type RunRead, type StepUsed } from './usage.ts';

/** Decodes a `RetryMode` (asks.ts, which hands out writes and so no schema). */
const RetryModeSchema = decodes<RetryMode>()(Schema.Literals(['nudge', 'fresh', 'recheck']));

/** Decodes a `Said` (asks.ts). */
const SaidSchema = decodes<Said>()(
  Schema.Struct({
    at: Schema.String,
    attempt: Schema.Number,
    text: Schema.String,
    after: Schema.NullOr(Schema.Struct({ kind: Schema.String, id: Schema.String })),
  }),
);

/** Mirrors `StepStatus` in agent-orchestrator's record/record.ts: a step's word, as the package and the CLI's `ls` say it. */
export type StepStatus =
  | 'waiting'
  | 'running'
  | 'blocked'
  | 'unsigned'
  | 'checking'
  | 'verified'
  | 'unverified'
  | 'awaiting approval'
  | 'exhausted'
  | 'over budget'
  | 'budget exhausted'
  | 'denied'
  | 'failed (check)'
  | 'failed'
  | 'stopped';

/** Decodes a `StepStatus`. */
const StepStatusSchema = decodes<StepStatus>()(
  Schema.Literals([
    'waiting',
    'running',
    'blocked',
    'unsigned',
    'checking',
    'verified',
    'unverified',
    'awaiting approval',
    'exhausted',
    'over budget',
    'budget exhausted',
    'denied',
    'failed (check)',
    'failed',
    'stopped',
  ]),
);

/**
 * Mirrors `StepBudget` in apps/api/src/detail/detail.ts: a step's cap in force — the `budget:` the run froze, or what a person raised it to
 * — as its author writes one (`said`, `$3`), what its tries have cost of it (`of`, `$4.25 of $3`, null until measured), and whether that is
 * the cap or more.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/** Decodes a `StepBudget`. */
const StepBudgetSchema = decodes<StepBudget>()(
  Schema.Struct({
    usd: Schema.Number,
    said: Schema.String,
    of: Schema.NullOr(Schema.String),
    over: Schema.Boolean,
  }),
);

/**
 * Mirrors `StepRaise` in apps/api/src/detail/detail.ts: a raise of a step's cap the package takes — with its try (`retry`) or with its
 * loop's round (`round`) — and what the budget has to be more than, as the package refuses less. For a try, the ways the package takes it
 * (`modes`, `recheck` among them where a check did not pass, needing no raise) and how the step ended on its own work, its budget aside
 * (`own`, the package's word: `blocked`, `unsigned`, `failed (check)` …), which its word, `over budget`, does not say. For a round, none,
 * and null.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: StepStatus | null };

/** Decodes a `StepRaise`. */
const StepRaiseSchema = decodes<StepRaise>()(
  Schema.Struct({
    by: Schema.Literals(['retry', 'round']),
    above: Schema.Number,
    said: Schema.String,
    modes: Schema.mutable(Schema.Array(RetryModeSchema)),
    own: Schema.NullOr(StepStatusSchema),
  }),
);

/**
 * Mirrors `StepApproval` in apps/api/src/detail/detail.ts: a person's approval of the try a gated step is on — when, and the words given
 * with it.
 */
export type StepApproval = { try: number; at: string; message: string | null };

/** Decodes a `StepApproval`. */
const StepApprovalSchema = decodes<StepApproval>()(
  Schema.Struct({
    try: Schema.Number,
    at: Schema.String,
    message: Schema.NullOr(Schema.String),
  }),
);

/**
 * Mirrors `StepGate` in apps/api/src/detail/detail.ts: a gated step's gate. `awaiting` while it waits at it — the CLI `ls`'s `awaiting
 * approval` — and `approval` once a person approved the try it is on. Neither, for a gated step yet to sign off.
 */
export type StepGate = { awaiting: boolean; approval: StepApproval | null };

/** Decodes a `StepGate`. */
const StepGateSchema = decodes<StepGate>()(
  Schema.Struct({
    awaiting: Schema.Boolean,
    approval: Schema.NullOr(StepApprovalSchema),
  }),
);

/** As the api's: a person's acceptance of a loop out of rounds (the CLI's `accept`), on the try its looping step is on. */
export type StepAcceptance = { try: number; at: string; message: string };

/** Decodes a `StepAcceptance`. */
const StepAcceptanceSchema = decodes<StepAcceptance>()(
  Schema.Struct({
    try: Schema.Number,
    at: Schema.String,
    message: Schema.String,
  }),
);

/**
 * Mirrors `StepAsked` in apps/api/src/detail/detail.ts: a try a person asked for, which the next tick files — once it has stopped the
 * step's session where `stopFirst`, because the harness blocked it.
 */
export type StepAsked = { try: number; mode: RetryMode; model: string | null; message: string | null; stopFirst: boolean };

/** Decodes a `StepAsked`. */
const StepAskedSchema = decodes<StepAsked>()(
  Schema.Struct({
    try: Schema.Number,
    mode: RetryModeSchema,
    model: Schema.NullOr(Schema.String),
    message: Schema.NullOr(Schema.String),
    stopFirst: Schema.Boolean,
  }),
);

/** Mirrors `StepSpec` in apps/api/src/detail/detail.ts. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`): null for the model's whole window. */
  context: number | null;
  after: string[];
  /**
   * `main` for a step that runs in the repository's own checkout rather than a worktree of the run's: the step that ends the run, whose
   * gate holds before it is filed and whose approval is what files it (`endsTheRun`). Null for every other step.
   */
  workspace: string | null;
  /** `folder` for a step that works in a folder the run makes, with no git repository (`place: folder`); null for one on a repository. */
  place: string | null;
  resume: string | null;
  /** Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`. */
  permissionMode: string | null;
  /** Codex's sandbox (`sandbox:`, or `permissionMode:` where a run froze a codex step's sandbox under that key): null on Claude Code. */
  sandbox: string | null;
  /** Null for the harness's own set, empty for none. */
  tools: string[] | null;
  deadlineSeconds: number | null;
  /** The step a round runs again, for a looping step; and how many rounds its loop may run, the first included. */
  loop: string | null;
  rounds: number | null;
};

/** Decodes a `StepSpec`. */
const StepSpecSchema = decodes<StepSpec>()(
  Schema.Struct({
    harness: Schema.NullOr(Schema.String),
    model: Schema.NullOr(Schema.String),
    effort: Schema.NullOr(Schema.String),
    context: Schema.NullOr(Schema.Number),
    after: StringsSchema,
    workspace: Schema.NullOr(Schema.String),
    place: Schema.NullOr(Schema.String),
    resume: Schema.NullOr(Schema.String),
    permissionMode: Schema.NullOr(Schema.String),
    sandbox: Schema.NullOr(Schema.String),
    tools: Schema.NullOr(StringsSchema),
    deadlineSeconds: Schema.NullOr(Schema.Number),
    loop: Schema.NullOr(Schema.String),
    rounds: Schema.NullOr(Schema.Number),
  }),
);

/**
 * Mirrors `StepFiled` in apps/api/src/detail/detail.ts: what the engine filed a step's current try with. Each field is null where the
 * task was filed without it — no deadline, which is no limit, and the harness's own model, effort and tools. `askedModel` is
 * the model a person's `retry --model` asked this try for; `runsIn` the permission mode the session runs in, as its harness
 * decides it — the mode filed, its choice when none was (`auto` for Claude Code), or a Codex sandbox narrowed by `tools` — and
 * null where the api could not ask the harness.
 */
export type StepFiled = {
  model: string | null;
  askedModel: string | null;
  effort: string | null;
  /** The context window the try was filed with, in tokens: null for the model's whole window. */
  contextTokens: number | null;
  /**
   * The fence the try was filed with, as the engine's task names it: Claude Code's permission mode, or Codex's sandbox (a step's
   * `sandbox:`).
   */
  permissionMode: string | null;
  runsIn: { mode: string; by: 'filed' | 'default' | 'tools' } | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
  /**
   * The remote A2A agent a step on `harness: a2a:<name>` was sent to: its name, and its address as the store's `a2a-agents.json` gives it
   * now — origin and path, never a query string, which can carry a key — or null where the file does not declare it. Null on a harness of
   * ours.
   */
  remote: { name: string; address: string | null } | null;
  /**
   * The session's web link, for a step whose sessions are bridged (`remote: true`): its `url` where the bridge is up, else `why` it is
   * not. Null for a step not bridged.
   */
  bridge: Bridge | null;
};

/** Decodes a `StepFiled`. */
const StepFiledSchema = decodes<StepFiled>()(
  Schema.Struct({
    model: Schema.NullOr(Schema.String),
    askedModel: Schema.NullOr(Schema.String),
    effort: Schema.NullOr(Schema.String),
    contextTokens: Schema.NullOr(Schema.Number),
    permissionMode: Schema.NullOr(Schema.String),
    runsIn: Schema.NullOr(Schema.Struct({ mode: Schema.String, by: Schema.Literals(['filed', 'default', 'tools']) })),
    tools: Schema.NullOr(StringsSchema),
    deadlineSeconds: Schema.NullOr(Schema.Number),
    remote: Schema.NullOr(Schema.Struct({ name: Schema.String, address: Schema.NullOr(Schema.String) })),
    bridge: Schema.NullOr(BridgeSchema),
  }),
);

/**
 * Mirrors `RunPage` in apps/api/src/runs/runs.ts: a run in full (`RunDetail`, apps/api/src/detail/detail.ts), and its workflow page's
 * address.
 */
export type RunDetail = RunCodes & {
  id: string;
  brief: string;
  /** The line that prints what there is to decide on the run. */
  decide: string;
  /**
   * A repository run's repository, base commit, base branch and whether it cut worktrees; each null on a folder run (`place`), which has
   * none.
   */
  repo: string | null;
  place: PlaceKind;
  /** Where a folder run's work is: the directory its steps' folders are made under. Null on a repository run, whose work is a branch. */
  work: string | null;
  workflowDir: string;
  /** The address of its workflow's page, and each step's under it: null where the board pages none, as for a folder given by path. */
  workflowPage: WorkflowPageAddress | null;
  /** The agent it tried, for a try started from an agent's page; null for every other run. */
  try: { agent: string } | null;
  baseRef: string | null;
  branch: string | null;
  isolate: boolean | null;
  createdAt: string;
  /** As on `RunSummary`. */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That the CLI's `prune` removed the run's worktrees: when, and each it removed with what it held on disk. Its branches and record are
   * kept, and none of its steps can be tried again. `artifacts` is when the CLI's `prune --artifacts` removed its files too, and what that
   * freed; null while they are kept. Null on a run never pruned.
   */
  pruned: { at: string; worktrees: Array<{ path: string; bytes: number }>; artifacts: { at: string; bytes: number } | null } | null;
  /** What the CLI's `prune` would still find of it on disk: its worktrees and its files. The Prune button offers only what is there. */
  onDisk: { worktrees: boolean; files: boolean };
  /** As on `RunSummary`. */
  after: string[];
  /** As on `RunSummary`. */
  context: string[];
  /** The inbox card the run was started from, as its record carries it; absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, in the CLI `decide`'s words (`fromNote` in agent-orchestrator): absent with `from`. */
  fromNote?: string;
  waiting: RunWaiting | null;
  /** As on `RunSummary`. */
  heldUntil: string[];
  /** As on `RunSummary`. */
  holding: RunHolding | null;
  status: RunStatus;
  moving: boolean;
  /** As on `RunSummary`. */
  cost: Spent | null;
  /** As on `RunSummary`. */
  atWork: AtWork | null;
  /** As on `RunSummary`, whose split the run's page shows. */
  tokens: RunTokens | null;
  /** What every try of every step read, by price, beside `cost` (`RunRead`); null where none of it was measured. */
  read: RunRead | null;
  waitingOnYou: string[];
  /** As on `RunSummary`. */
  onYou: string[];
  /** As on `RunSummary` (`RunToDecide`). */
  toDecide: RunToDecide | null;
  /** The steps the run is gated at, in the order they run: those its workflow gates, and those it was started with. */
  gates: string[];
  warning: string | null;
  /**
   * The kinds whose files have moved past what the run resolved, as the api works them out on its read: the kind (a workflow folder,
   * an agent, a skill, a factory's rules), its name, the revision the run resolved and the one its next filing would take — lower when
   * the files went back to an older content — and, for a line about a step that has already been filed, that step's name.
   */
  kinds: Array<{ kind: 'workflow' | 'agent' | 'skill' | 'rules'; name: string; pinned: number; now: number; step?: string }>;
  /** The line the api says to type to take the new revisions, so the board spells no command. */
  refresh: string;
  /** The steps as a graph, from the workflow the run froze: what the canvases draw, so none derives it from `after`. */
  graph: RunGraph;
  steps: Array<
    StepCodes & {
      name: string;
      spec: StepSpec | null;
      /** What the engine filed its current try with; null for a step not filed. */
      filed: StepFiled | null;
      body: string | null;
      told: string | null;
      /** What it was told, by layer, from what the run froze; null for a run that froze no workflow, whose `told` is all there is. */
      layers: StepLayers | null;
      /** The task split into its own text and each run it was handed, how it was handed; null for a step not filed. */
      taskParts: TaskPart[] | null;
      taskId: string | null;
      workspace: string | null;
      /**
       * For a step of a folder run, every file its folder holds now — the whole of what it made, not only what its closeout named.
       * Empty for a step of a repository run, whose work is a branch, and for one not filed yet.
       */
      files: StepArtifact[];
      /** Why that list is empty when the folder is there and could not be read; null where the list is what the folder holds. */
      filesError: string | null;
      branch: string | null;
      /** As on `RunSummary`: the sentence a person reads beside its codes (`StepCodes`), never compared. */
      message: string;
      /** As on `RunSummary`: its check's verdict as codes, null for a step its check did not judge. */
      verdict: CheckVerdict | null;
      /** @deprecated As on `RunSummary`: `message` under its old name, which the board reads nowhere. */
      status: string;
      /** As on `RunSummary`. */
      note: string | null;
      /** As on `RunSummary`. */
      roundDue: boolean;
      /** The lines a person types for what the step's controls do: its approval, a try in its session, and words said to it. */
      commands: { approve: string; retry: string; say: string };
      needs: string | null;
      blockedByHarness: boolean;
      /** As on `RunSummary`: what the harness says the session waits for, and what a person does about it. */
      waitingFor: StepNeeds['waitingFor'];
      approve: string | null;
      /** As on `RunSummary`: what the harness denied its current try, the calls and the line that names them. */
      denied: StepNeeds['denied'];
      /** As on `RunSummary`: why the runtime could not read its session alone, in its words; null where it read it. */
      sessionUnread: StepNeeds['sessionUnread'];
      /** Its gate, awaiting approval or approved (`StepGate`); null for a step with none. */
      gate: StepGate | null;
      /** For a looping step a person ended out of rounds (the CLI's `accept`), their acceptance of the try it is on; else null. */
      accepted: StepAcceptance | null;
      /**
       * For a step the harness blocked, what its session said last; null for any other, and for one that said nothing the api could read.
       */
      lastLine: string | null;
      /** What a person said to its current try's session while it ran (the CLI's `say`, or the session page's composer), in order. */
      said: Said[];
      /** The try a person asked for that the next tick files; null when none is. */
      asked: StepAsked | null;
      closeout: StepCloseout | null;
      unreadable: StepUnreadable | null;
      /** Null for a step with no `check:`. */
      check: StepCheck | null;
      attempts: StepAttempts;
      /** What its current try consumed, in the CLI `decide`'s words; null for a step not filed. */
      used: StepUsed | null;
      /** What all its tries have cost together, as the CLI's `ls` puts it beside its word; null until a cost was measured. */
      spent: Spent | null;
      /** Its cap in force, and what its tries have cost of it; null for a step with no `budget:`. */
      budget: StepBudget | null;
      /** The raise of its cap the package takes, and how; null where none does, and on a run called off. */
      raise: StepRaise | null;
      /** Every try, earliest first, the current one last: `attempts` counts the current try's task alone. */
      tries: StepTry[];
      /** Where the step's time went, try by try and check by check; empty for a step not filed. */
      timeline: StepTimelineTry[];
    }
  >;
  /** The run's time together: each round of its loop, and the whole run — with what the sessions in each cost. */
  timeline: { rounds: TimelineTotal[]; run: TimelineTotal };
};

/**
 * Mirrors `TaskSpan` in agent-orchestrator's timeline.ts: one task of a try on the clock — its session, or its check. `filedAt` is off the
 * engine's feed, and null where the feed has none; `spawnedAt` its first attempt's spawn; `endedAt` its last attempt's end once it settled.
 * `at` is where it stands, and `queued` (filed → spawned, the wait for a slot) and `ran` (spawned → ended) the package's words for its two
 * times.
 */
export type TaskSpan = {
  taskId: string;
  at: 'unknown' | 'queued' | 'starting' | 'running' | 'ended' | 'unspawned';
  filedAt: string | null;
  spawnedAt: string | null;
  endedAt: string | null;
  attempts: number;
  queuedMs: number | null;
  ranMs: number | null;
  queued: string;
  ran: string;
};

/**
 * Mirrors `TurnSpan` in agent-orchestrator's timeline/turns.ts: the turn of an earlier try's session a try ran — `asked` where the turn
 * before it blocked, so this one answers a person — and when the turn before it ended (`heldFrom`), and its own spawn and end.
 */
export type TurnSpan = { asked: boolean; heldFrom: string | null; spawnedAt: string | null; endedAt: string | null };

/**
 * Mirrors `StepTimelineTry` in apps/api/src/detail/detail.ts: one try of a step on the clock. `session` is null on a try a recheck reached,
 * whose session is try `sessionOf`'s; `check` null for a try whose check was never filed; `used` what its session consumed, in
 * the CLI `decide`'s words; `turn` the turn of an earlier try's session it ran, absent for a try on a task of its own.
 */
export type StepTimelineTry = {
  try: number;
  round: number;
  session: TaskSpan | null;
  sessionOf: number | null;
  check: TaskSpan | null;
  used: StepUsed | null;
  turn?: TurnSpan;
};

/**
 * Mirrors `StepTimelineTotal` in apps/api/src/detail/detail.ts — `TimelineTotal` in agent-orchestrator's timeline.ts, with its cost: a
 * round of a loop — `loop` its looping step, counting the steps that round files again — or the run's, every step's (`loop` and `round`
 * null); sums over its tasks, and its wall, in words; and what the sessions in it cost, null where none was measured.
 */
export type TimelineTotal = {
  loop: string | null;
  round: number | null;
  tasks: number;
  inFlight: number;
  queuedMs: number;
  ranMs: number;
  wallMs: number | null;
  queued: string;
  ran: string;
  wall: string;
  cost: Spent | null;
};

/** Decodes a `TurnSpan`. */
const TurnSpanSchema = decodes<TurnSpan>()(
  Schema.Struct({
    asked: Schema.Boolean,
    heldFrom: Schema.NullOr(Schema.String),
    spawnedAt: Schema.NullOr(Schema.String),
    endedAt: Schema.NullOr(Schema.String),
  }),
);

/** Decodes a `TaskSpan`. */
const TaskSpanSchema = decodes<TaskSpan>()(
  Schema.Struct({
    taskId: Schema.String,
    at: Schema.Literals(['unknown', 'queued', 'starting', 'running', 'ended', 'unspawned']),
    filedAt: Schema.NullOr(Schema.String),
    spawnedAt: Schema.NullOr(Schema.String),
    endedAt: Schema.NullOr(Schema.String),
    attempts: Schema.Number,
    queuedMs: Schema.NullOr(Schema.Number),
    ranMs: Schema.NullOr(Schema.Number),
    queued: Schema.String,
    ran: Schema.String,
  }),
);

/** Decodes a `StepTimelineTry`. */
const StepTimelineTrySchema = decodes<StepTimelineTry>()(
  Schema.Struct({
    try: Schema.Number,
    round: Schema.Number,
    session: Schema.NullOr(TaskSpanSchema),
    sessionOf: Schema.NullOr(Schema.Number),
    check: Schema.NullOr(TaskSpanSchema),
    used: Schema.NullOr(StepUsedSchema),
    turn: Schema.optionalKey(TurnSpanSchema),
  }),
);

/** Decodes a `TimelineTotal`. */
const TimelineTotalSchema = decodes<TimelineTotal>()(
  Schema.Struct({
    loop: Schema.NullOr(Schema.String),
    round: Schema.NullOr(Schema.Number),
    tasks: Schema.Number,
    inFlight: Schema.Number,
    queuedMs: Schema.Number,
    ranMs: Schema.Number,
    wallMs: Schema.NullOr(Schema.Number),
    queued: Schema.String,
    ran: Schema.String,
    wall: Schema.String,
    cost: Schema.NullOr(SpentSchema),
  }),
);

/** Decodes a step of a `RunDetail`. */
const DetailStepSchema = decodes<RunDetail['steps'][number]>()(
  Schema.Struct({
    name: Schema.String,
    spec: Schema.NullOr(StepSpecSchema),
    filed: Schema.NullOr(StepFiledSchema),
    body: Schema.NullOr(Schema.String),
    told: Schema.NullOr(Schema.String),
    layers: Schema.NullOr(StepLayersSchema),
    taskParts: Schema.NullOr(Schema.mutable(Schema.Array(TaskPartSchema))),
    taskId: Schema.NullOr(Schema.String),
    workspace: Schema.NullOr(Schema.String),
    files: Schema.mutable(Schema.Array(StepArtifactSchema)),
    filesError: Schema.NullOr(Schema.String),
    branch: Schema.NullOr(Schema.String),
    ...StepCodesFields,
    verdict: Schema.NullOr(CheckVerdictSchema),
    status: Schema.String,
    note: Schema.NullOr(Schema.String),
    roundDue: Schema.Boolean,
    commands: Schema.Struct({ approve: Schema.String, retry: Schema.String, say: Schema.String }),
    ...StepNeedsFields,
    gate: Schema.NullOr(StepGateSchema),
    accepted: Schema.NullOr(StepAcceptanceSchema),
    lastLine: Schema.NullOr(Schema.String),
    said: Schema.mutable(Schema.Array(SaidSchema)),
    asked: Schema.NullOr(StepAskedSchema),
    closeout: Schema.NullOr(StepCloseoutSchema),
    unreadable: Schema.NullOr(StepUnreadableSchema),
    check: Schema.NullOr(StepCheckSchema),
    attempts: StepAttemptsSchema,
    used: Schema.NullOr(StepUsedSchema),
    spent: Schema.NullOr(SpentSchema),
    budget: Schema.NullOr(StepBudgetSchema),
    raise: Schema.NullOr(StepRaiseSchema),
    tries: Schema.mutable(Schema.Array(StepTrySchema)),
    timeline: Schema.mutable(Schema.Array(StepTimelineTrySchema)),
  }),
);

/**
 * Decodes a `RunDetail`: each key the run's pages read, of its type and words — its `graph`, each step's gate, tries and timeline, the
 * run's totals — and a key the board does not know dropped.
 */
const RunDetailSchema = decodes<RunDetail>()(
  Schema.Struct({
    id: Schema.String,
    brief: Schema.String,
    decide: Schema.String,
    repo: Schema.NullOr(Schema.String),
    place: PlaceKindSchema,
    work: Schema.NullOr(Schema.String),
    workflowDir: Schema.String,
    workflowPage: Schema.NullOr(WorkflowPageAddressSchema),
    try: Schema.NullOr(Schema.Struct({ agent: Schema.String })),
    baseRef: Schema.NullOr(Schema.String),
    branch: Schema.NullOr(Schema.String),
    isolate: Schema.NullOr(Schema.Boolean),
    createdAt: Schema.String,
    startedAt: Schema.NullOr(Schema.String),
    cancelledAt: Schema.NullOr(Schema.String),
    pruned: Schema.NullOr(
      Schema.Struct({
        at: Schema.String,
        worktrees: Schema.mutable(Schema.Array(Schema.Struct({ path: Schema.String, bytes: Schema.Number }))),
        artifacts: Schema.NullOr(Schema.Struct({ at: Schema.String, bytes: Schema.Number })),
      }),
    ),
    onDisk: Schema.Struct({ worktrees: Schema.Boolean, files: Schema.Boolean }),
    after: StringsSchema,
    context: StringsSchema,
    from: Schema.optionalKey(Schema.Struct({ inbox: Schema.String })),
    fromNote: Schema.optionalKey(Schema.String),
    waiting: Schema.NullOr(RunWaitingSchema),
    heldUntil: StringsSchema,
    holding: Schema.NullOr(RunHoldingSchema),
    status: RunStatusSchema,
    ...RunCodesFields,
    moving: Schema.Boolean,
    cost: Schema.NullOr(SpentSchema),
    atWork: Schema.NullOr(AtWorkSchema),
    tokens: Schema.NullOr(RunTokensSchema),
    read: Schema.NullOr(RunReadSchema),
    waitingOnYou: StringsSchema,
    onYou: StringsSchema,
    toDecide: Schema.NullOr(RunToDecideSchema),
    gates: StringsSchema,
    warning: Schema.NullOr(Schema.String),
    kinds: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          kind: Schema.Literals(['workflow', 'agent', 'skill', 'rules']),
          name: Schema.String,
          pinned: Schema.Number,
          now: Schema.Number,
          step: Schema.optionalKey(Schema.String),
        }),
      ),
    ),
    refresh: Schema.String,
    graph: RunGraphSchema,
    steps: Schema.mutable(Schema.Array(DetailStepSchema)),
    timeline: Schema.Struct({ rounds: Schema.mutable(Schema.Array(TimelineTotalSchema)), run: TimelineTotalSchema }),
  }),
);

/**
 * Whether a read of a run's record found no run: the api's 404 (`noSuchRun`), as the CLI's `rm` leaves it. A page open on the run keeps
 * what it last read when a read again fails — a suspense query throws only while it has nothing — so the run's pages read the query's
 * `error` beside its `data`, and say the run is gone rather than draw it as it was.
 */
export const runGone = (error: unknown): boolean => error instanceof ReadRefusal && error.status === 404;

/**
 * Every failure is tried again three times, as react-query does by default, but a run gone from the store: said at once, not seconds later.
 */
export const retryRun = (failures: number, error: unknown): boolean => !runGone(error) && failures < 3;

/** A run's detail, decoded (`RunDetailSchema`). Read again every 5 s while the feed is not followed — every minute while it is. */
export const runQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id],
    queryFn: () => get(`/api/runs/${encodeURIComponent(id)}`, RunDetailSchema),
    refetchInterval: () => pace(5_000),
    retry: retryRun,
  });

/**
 * What a run's page loads before it draws: the run read into `client`'s cache (`runQuery`), and `gone` when the store has no such run
 * (`runGone`), so the page says so in place of a failure; any other failure is thrown, for the route's error to say.
 */
export const loadRun = (client: QueryClient, id: string): Promise<{ gone: boolean }> =>
  client.ensureQueryData(runQuery(id)).then(
    () => ({ gone: false }),
    (error: unknown) => {
      if (runGone(error)) return { gone: true };
      throw error;
    },
  );
