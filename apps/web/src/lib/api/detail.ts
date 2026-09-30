/**
 * A run's detail, as its page reads it (`GET /api/runs/:id`, apps/api/src/detail/detail.ts): each step's spec, filing, gate, tries and
 * timeline.
 */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { ReadRefusal, getUndecoded } from './read.ts';
import type { RetryMode, Said } from './asks.ts';
import type { RunGraph } from './graph.ts';
import type { RunHolding, RunStatus, RunToDecide, RunWaiting, Spent, StepNeeds } from './judged.ts';
import type { PlaceKind } from './runs.ts';
import type { StepArtifact, StepAttempts, StepCheck, StepCloseout, StepTry, StepUnreadable } from './tries.ts';
import type { RunRead, StepUsed } from './usage.ts';

/**
 * Mirrors `StepBudget` in apps/api/src/detail/detail.ts: a step's cap in force — the `budget:` the run froze, or what a person raised it to
 * — as its author writes one (`said`, `$3`), what its tries have cost of it (`of`, `$4.25 of $3`, null until measured), and whether that is
 * the cap or more.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/**
 * Mirrors `StepRaise` in apps/api/src/detail/detail.ts: a raise of a step's cap the package takes — with its try (`retry`) or with its
 * loop's round (`round`) — and what the budget has to be more than, as the package refuses less. For a try, the ways the package takes it
 * (`modes`, `recheck` among them where a check did not pass, needing no raise) and how the step ended on its own work, its budget aside
 * (`own`, the package's word: `blocked`, `unsigned`, `failed (check)` …), which its word, `over budget`, does not say. For a round, none,
 * and null.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: string | null };

/**
 * Mirrors `StepApproval` in apps/api/src/detail/detail.ts: a person's approval of the try a gated step is on — when, and the words given
 * with it.
 */
export type StepApproval = { try: number; at: string; message: string | null };

/**
 * Mirrors `StepGate` in apps/api/src/detail/detail.ts: a gated step's gate. `awaiting` while it waits at it — `wf ls`'s `awaiting approval`
 * — and `approval` once a person approved the try it is on. Neither, for a gated step not signed off yet.
 */
export type StepGate = { awaiting: boolean; approval: StepApproval | null };

/** As the api's: a person's acceptance of a loop out of rounds (`wf accept`), on the try its looping step is on. */
export type StepAcceptance = { try: number; at: string; message: string };

/**
 * Mirrors `StepAsked` in apps/api/src/detail/detail.ts: a try a person asked for, which the next tick files — once it has stopped the
 * step's session where `stopFirst`, because the harness blocked it.
 */
export type StepAsked = { try: number; mode: RetryMode; model: string | null; message: string | null; stopFirst: boolean };

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

/**
 * Mirrors `StepFiled` in apps/api/src/detail/detail.ts: what the engine filed a step's current try with. Each field is null where the
 * task was filed without it — no deadline, which is no limit, and the harness's own model, effort and tools. `askedModel` is
 * the model a person's `wf retry --model` asked this try for; `runsIn` the permission mode the session runs in, as its harness
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
};

/** Mirrors `RunDetail` in apps/api/src/detail/detail.ts. */
export type RunDetail = {
  id: string;
  brief: string;
  /** A git run's repository, base commit, base branch and whether it cut worktrees; each null on a folder run (`place`), which has none. */
  repo: string | null;
  place: PlaceKind;
  /** Where a folder run's work is: the directory its steps' folders are made under. Null on a git run, whose work is on its branch. */
  work: string | null;
  workflowDir: string;
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
   * That `wf prune` removed the run's worktrees: when, and each it removed with what it held on disk. Its branches and record are kept,
   * and none of its steps can be tried again. `artifacts` is when `wf prune --artifacts` removed its files too, and what that freed; null
   * while they are kept. Null on a run never pruned.
   */
  pruned: { at: string; worktrees: Array<{ path: string; bytes: number }>; artifacts: { at: string; bytes: number } | null } | null;
  /** What `wf prune` would still find of it on disk: its worktrees and its files. The Prune button offers only what is there. */
  onDisk: { worktrees: boolean; files: boolean };
  /** As on `RunSummary`. */
  after: string[];
  /** The inbox card the run was started from, as its record carries it; absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, in `wf decide`'s words (`fromNote` in agent-orchestrator): absent with `from`. */
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
  /** The steps as a graph, from the workflow the run froze: what the canvases draw, so none derives it from `after`. */
  graph: RunGraph;
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    /** What the engine filed its current try with; null for a step not filed. */
    filed: StepFiled | null;
    body: string | null;
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    /**
     * For a step of a folder run, every file its folder holds now — the whole of what it made, not only what its closeout named.
     * Empty for a step of a git run, whose work is a branch, and for one not filed yet.
     */
    files: StepArtifact[];
    /** Why that list is empty when the folder is there and could not be read; null where the list is what the folder holds. */
    filesError: string | null;
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    needs: string | null;
    blockedByHarness: boolean;
    /** As on `RunSummary`: what the harness says the session waits for, and what a person does about it. */
    waitingFor: StepNeeds['waitingFor'];
    approve: string | null;
    /** As on `RunSummary`: what the harness denied its current try, the calls and the line that names them. */
    denied: StepNeeds['denied'];
    /** Its gate, awaiting approval or approved (`StepGate`); null for a step with none. */
    gate: StepGate | null;
    /** For a looping step a person ended out of rounds (`wf accept`), their acceptance of the try it is on; null for any other step. */
    accepted: StepAcceptance | null;
    /** For a step the harness blocked, what its session said last; null for any other, and for one that said nothing the api could read. */
    lastLine: string | null;
    /** What a person said to its current try's session while it ran (`wf say`, or the session page's prompt box), in the order said. */
    said: Said[];
    /** The try a person asked for that the next tick files; null when none is. */
    asked: StepAsked | null;
    closeout: StepCloseout | null;
    unreadable: StepUnreadable | null;
    /** Null for a step with no `check:`. */
    check: StepCheck | null;
    attempts: StepAttempts;
    /** What its current try consumed, in `wf decide`'s words; null for a step not filed. */
    used: StepUsed | null;
    /** What all its tries have cost together, as `wf ls` puts it beside its word; null until a cost was measured. */
    spent: Spent | null;
    /** Its cap in force, and what its tries have cost of it; null for a step with no `budget:`. */
    budget: StepBudget | null;
    /** The raise of its cap the package takes, and how; null where none does, and on a run called off. */
    raise: StepRaise | null;
    /** Every try, earliest first, the current one last: `attempts` counts the current try's task alone. */
    tries: StepTry[];
    /** Where the step's time went, try by try and check by check; empty for a step not filed. */
    timeline: StepTimelineTry[];
  }>;
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
 * Mirrors `StepTimelineTry` in apps/api/src/detail/detail.ts: one try of a step on the clock. `session` is null on a try a recheck reached,
 * whose session is try `sessionOf`'s; `check` null for a try whose check was never filed; `used` what its session consumed, in
 * `wf decide`'s words.
 */
export type StepTimelineTry = {
  try: number;
  round: number;
  session: TaskSpan | null;
  sessionOf: number | null;
  check: TaskSpan | null;
  used: StepUsed | null;
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

/**
 * Whether a read of a run's record found no run: the api's 404 (`noSuchRun`), as `wf rm` leaves it. A page open on the run keeps what it
 * last read when a read again fails — a suspense query throws only while it has nothing — so the run's pages read the query's `error`
 * beside its `data`, and say the run is gone rather than draw it as it was.
 */
export const runGone = (error: unknown): boolean => error instanceof ReadRefusal && error.status === 404;

/**
 * Every failure is tried again three times, as react-query does by default, but a run gone from the store: said at once, not seconds later.
 */
export const retryRun = (failures: number, error: unknown): boolean => !runGone(error) && failures < 3;

export const runQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id],
    queryFn: () => getUndecoded<RunDetail>(`/api/runs/${encodeURIComponent(id)}`).then((detail) => withGraph(id, detail)),
    refetchInterval: () => pace(5_000),
    retry: retryRun,
  });

/**
 * A run's detail, as the api answered it, refused unless it carries what the run's pages draw: its `graph`, the only graph the canvases
 * draw (none is worked out from `after`); each step's `tries`, `said`, `timeline`, `approve` and `gate`; the run's `timeline` totals and
 * its `onYou`. A detail without a step's `approve` would offer Approve on a route the api that sent it does not have.
 *
 * An api process older than this board answers without some of them: the refusal names the field missing and says to restart the api
 * and reload the page, so the run's page and the Factory's card show it rather than a render throwing on `undefined`.
 */
export function withGraph(id: string, detail: RunDetail): RunDetail {
  const restart = 'Restart the api (`npm run dev` from the repository, or whatever serves /api), then reload the page.';
  const graph = (detail as { graph?: Partial<RunGraph> | null }).graph;
  if (!graph || !Array.isArray(graph.roots) || !Array.isArray(graph.edges)) {
    throw new Error(
      `The api answered run '${id}' without its graph, so it is older than this board, which draws only the graph the api gives. ${restart}`,
    );
  }
  const bare = (detail.steps ?? []).find((step) => !Array.isArray((step as { tries?: unknown }).tries));
  if (bare) {
    throw new Error(
      `The api answered run '${id}' without the tries of its step '${bare.name}', so it is older than this board, which shows every round a step ran. ${restart}`,
    );
  }
  const unsaid = detail.steps.find((step) => !Array.isArray((step as { said?: unknown }).said));
  if (unsaid) {
    throw new Error(
      `The api answered run '${id}' without what was said to its step '${unsaid.name}', so it is older than this board, whose session page shows what a person said to a step. ${restart}`,
    );
  }
  const untimed = detail.steps.find((step) => !Array.isArray((step as { timeline?: unknown }).timeline));
  const totals = (detail as { timeline?: Partial<RunDetail['timeline']> | null }).timeline;
  if (untimed || !totals || !Array.isArray(totals.rounds) || !totals.run) {
    const what = untimed ? `the timeline of its step '${untimed.name}'` : 'the timeline of the run';
    throw new Error(
      `The api answered run '${id}' without ${what}, so it is older than this board, whose run page shows where a run's time went. ${restart}`,
    );
  }
  const ungated = detail.steps.find((step) => !Object.hasOwn(step, 'approve') || !Object.hasOwn(step, 'gate'));
  if (ungated || !Array.isArray((detail as { onYou?: unknown }).onYou)) {
    const what = ungated ? `the gate of its step '${ungated.name}'` : "who it waits on in wf ls's words";
    throw new Error(
      `The api answered run '${id}' without ${what}, so it is older than this board, whose run page approves a step at its gate. ${restart}`,
    );
  }
  return detail;
}
