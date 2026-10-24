/** One run in full, for a person reading it (`GET /api/runs/:id`): the spec, and per step what it was told and how it went. */
import fs from 'node:fs';
import path from 'node:path';
import {
  type AtWork,
  atWork,
  artifactsDir,
  budgetWord,
  type Bridge,
  bridgeOf,
  closeoutAsked,
  closeoutReader,
  consumption,
  dollars,
  exitVerdicts,
  fromNote,
  HARNESSES,
  phaseOfView,
  remoteAgents,
  type Retry,
  type RetryMode,
  runStartedAt,
  type RunTokens,
  runTokens,
  type Said,
  type Spend,
  type SpendOf,
  stepSpend,
  type Timeline,
  timeline,
  type TimelineTotal,
  type TimelineTry,
  bare,
  filedTimes,
  judgedSteps,
  stepNames,
  type TaskView,
  type Views,
  workflowsOf,
  tryOf,
  runWith,
  needsOf,
  runSaid,
  stepSaid,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunWaiting,
  type Spent,
  spentOf,
  type StepNeeds,
  type Drift,
} from 'agent-orchestrator';
import {
  addSpend,
  budgetOf,
  gatesOf,
  isRepositoryRun,
  loopOver,
  overBudget,
  ownStatus,
  type PlaceKind,
  placeOf,
  retryable,
  type Run,
  type StepRecord,
  type StepStatus,
  type ToldLayers,
} from 'agent-orchestrator/run';
import { loopSpan, remoteNameOf, type Workflow } from 'agent-orchestrator/workflow';
import { folderFiles, type StepArtifact } from '../steps/artifacts.ts';
import { type RunGraph, runGraph } from 'agent-orchestrator';
import type { CheckVerdict, RunPhase, RunReason, StepPhase, StepReason } from 'agent-orchestrator';

import { checksOf, refusedStderr, type StepCheck } from '../steps/logs.ts';
import { engineRead, type Engine, judgedOn, workFolderOf } from '../store.ts';
import {
  acceptedOf,
  attemptsIn,
  closeoutIn,
  driftOf,
  kindsOf,
  type StepAttempts,
  type StepCloseout,
  type StepTry,
  type StepUnreadable,
  gateOf,
  triesOf,
  unreadableIn,
} from './tries.ts';
import { type TaskPart, toldOf } from './told.ts';
import { decideLine, refreshLine, stepCommands, type StepCommands } from './commands.ts';
import type { Served } from '../layer.ts';
import { readOf, type RunRead, type StepUsed, totalOf, usedOf } from './usage.ts';

/**
 * A step's cap, and what its tries have cost of it. `usd` is the cap in force (`budgetOf`): the `budget:` the run froze, until a person
 * raises it (`nemia retry --budget`, `nemia round --budget`). `said` is the cap as its author writes one (`budgetWord`: `$3`), and `of`
 * what the step's tries have cost of it, as `nemia ls` puts it in `over budget $4.25 of $3` — null until a cost was measured. `over` is
 * whether they have cost the cap or more (`overBudget`). Past the cap alone holds nothing: the step is held only where its `status` word
 * says `over budget` or `budget exhausted` — where another session of it is the way on. A job (`claude -p`) is ended at its cap; a
 * background session (`background: true`, `claude --bg`) keeps none and is not stopped, so such a step — the package refuses a budget
 * beside it, but a frozen record may carry both — can finish past it with nothing waiting on a raise.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/**
 * A raise of a step's cap the package takes, and how it is asked for: `retry` — `nemia retry --budget`, the board's `POST …/retry` — for a
 * step over its budget or ended at it that a try takes on (`retryable`'s `raise`); `round` — `nemia round --budget`, `POST …/round` — for a
 * looping step whose round waits on a step of its loop over its budget (`loopOver`). `above` is what the budget has to be more than, as the
 * package refuses one that is not — what the tries have cost, or the cap a session was ended at — and `said` that, in dollars (`dollars`).
 *
 * For a try, `modes` are the ways the package takes it (`retryable`) — `recheck` among them where a check did not pass, which costs nothing
 * and needs no raise — and `own` how the step ended on its own work, its budget aside (`ownStatus`): `blocked` for a step that signed off
 * blocked, whose try is answered with its raise (`nemia retry --budget <amount> --message "<answer>"`, as `nemia decide` offers it),
 * `unsigned`, `failed (check)`, `failed`, `stopped`, `denied` or `budget exhausted`. Over its budget, a step's word is `over budget`, so
 * the word alone does not say which. For a round, no modes, and `own` null: a round is asked for as it is, with a budget.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: StepStatus | null };

/**
 * A person's approval of the try a gated step is on (`approvalOf`), off their file (`nemia approve`): the try, when, and the words given
 * with it — handed to every step after the gate under `## Approved` — null where none were.
 */
export type StepApproval = { try: number; at: string; message: string | null };

/**
 * A gated step's gate: its own `gate: true`, or one the run was started with (`hasGate`). `awaiting` while it waits at it — signed off,
 * verified first where it has a check, and the try it is on not approved: `nemia ls`'s `awaiting approval`, whatever else is asked of it.
 * And `approval`, once a person approved that try. Neither, for a gated step not signed off yet.
 */
export type StepGate = { awaiting: boolean; approval: StepApproval | null };

/**
 * A person's acceptance of a loop out of rounds, on the try its looping step is on (`acceptanceOf`), off their file (`nemia accept`): the
 * try, when, and the words given. The step's closeout still says `again: true` — the acceptance does not rewrite what the reviewer said —
 * so whoever reads the step's last word needs this beside it, or a gate after the loop reads as if another round were still asked for.
 */
export type StepAcceptance = { try: number; at: string; message: string };

/**
 * A try a person asked for — with `nemia retry`, or the board's answer box or Continue — that the next tick files: `assess`'s, off their
 * ask file. `model` is the one a `--model` named, and `message` what they said with it; each null where the ask has none. `stopFirst`
 * is the package's (`Retry.stopFirst`): the harness blocked the step's session, so a tick stops that session first, and a later one files
 * the try, once it has stopped.
 */
export type StepAsked = { try: number; mode: RetryMode; model: string | null; message: string | null; stopFirst: boolean };

/** A step's frontmatter, from the workflow the run is judged by. `null` where the step does not set it. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  /** How hard the harness is told to think, in its own words. */
  effort: string | null;
  /** The session's context window, in tokens (`context:`): null for the model's whole window. */
  context: number | null;
  after: string[];
  /**
   * `main` for a step that runs in the repository's own checkout rather than a worktree of the run's (`workspace: main`): the step that
   * ends the run, whose gate holds before it is filed and whose approval is what files it. Null for every other step, which works in a
   * worktree. What tells such a gate from any other on the board, where the two read the same off the record: unfiled and awaiting
   * approval.
   */
  workspace: string | null;
  /** `folder` for a step that works in a folder the run makes, with no git repository (`place: folder`); null for one on a repository. */
  place: string | null;
  resume: string | null;
  /**
   * Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`, but for a codex step frozen before the
   * rename, which holds its sandbox here.
   */
  permissionMode: string | null;
  /** Codex's sandbox (`sandbox:`): null on Claude Code, and on a codex step frozen with its sandbox under `permissionMode`. */
  sandbox: string | null;
  /** The only tools the session may have: null for the harness's own set, empty for none. */
  tools: string[] | null;
  deadlineSeconds: number | null;
  /** The step a round runs again, on a looping step. */
  loop: string | null;
  /** How many rounds its loop may run, the first included: set on every looping step, as the parser sets it. */
  rounds: number | null;
};

/**
 * What the engine filed a step's current try with, off its record of the task: what the step runs with where its workflow
 * leaves a field to the engine. Each field is null where the task was filed without it — a deadline, which is then no limit; a
 * model, effort or tools, which are then the harness's own; a permission mode, which its harness chooses, and `runsIn` says.
 */
export type StepFiled = {
  model: string | null;
  /**
   * The model a person's `nemia retry --model` asked this try for, off the run's record (`EarlierTry.model`): what tells a model the
   * try was filed on from a default. Null when nobody asked.
   */
  askedModel: string | null;
  effort: string | null;
  /** The context window the try was filed with, in tokens (`contextTokens`): null for the model's whole window. */
  contextTokens: number | null;
  /**
   * The fence the try was filed with, as the engine's task names it: Claude Code's permission mode, or Codex's sandbox (a step's
   * `sandbox:`).
   */
  permissionMode: string | null;
  /**
   * The permission mode the session runs in, which the engine files as given and its harness decides (`runsInOf`): the mode filed
   * (`filed`); the harness's choice when none was — `auto` for Claude Code, `workspace-write` for Codex (`default`); or, for Codex,
   * `read-only` because `tools` has none that writes, whatever was named (`tools`). Null for a harness the api cannot ask.
   */
  runsIn: { mode: string; by: 'filed' | 'default' | 'tools' } | null;
  /**
   * The remote A2A agent the try was sent to, for a step that says `harness: a2a:<name>` (`remoteOf`): its name, and its address as the
   * store's `a2a-agents.json` gives it now — origin and path, never a query or a secret, which is never in the file — or null where the
   * file does not declare it or cannot be read. Null for a local harness, whose mode is `runsIn`.
   */
  remote: { name: string; address: string | null } | null;
  /**
   * The session's web link, for a step whose sessions are bridged (`remote: true`), off its task's view (`bridgeOf`): its `url` where the
   * bridge is up, else `why` it is not. Null for a step not bridged, an A2A remote step among them.
   */
  bridge: Bridge | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
};

/** One run in full, for a person reading it: the spec, and per step what it was told and how it went. */
export type RunDetail = {
  id: string;
  brief: string;
  /** The line that prints what there is to decide on the run, built off the table (`decideLine`). */
  decide: string;
  /** A repository run's repository, base commit, base branch and whether it cut worktrees; each null on a folder run, which has none. */
  repo: string | null;
  place: PlaceKind;
  /**
   * Where a folder run's work is: the directory its steps' folders are made under (`workRoot`), which is what a person is given in
   * place of a repository and a branch — there is nothing to check out, and nothing to merge. Null on a repository run, whose work is on
   * its branch.
   */
  work: string | null;
  workflowDir: string;
  /** The agent it tried, for a try started from an agent's page (`tryOf`, try.ts); null for every other run. */
  try: { agent: string } | null;
  baseRef: string | null;
  branch: string | null;
  isolate: boolean | null;
  createdAt: string;
  /** As on `RunSummary`. */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That `nemia prune` removed the run's worktrees (`Run.pruned`): when, and each it removed with what it held on disk. Its branches,
   * record and files are kept, so the rest of the page reads as before; what it does not offer is anything that would work in a worktree.
   * Null for a run never pruned. `artifacts` is when `nemia prune --artifacts` removed its files directory too, and what that freed: each
   * file a closeout named there then reads `pruned`, and the artifacts route answers 410. Null while its files are kept.
   */
  pruned: { at: string; worktrees: Array<{ path: string; bytes: number }>; artifacts: { at: string; bytes: number } | null } | null;
  /**
   * What `nemia prune` would still find of the run on disk: its worktrees' directory (`worktrees/<id>`, which a prune removes once it has
   * removed what is in it) and its files directory (`runs/<id>/artifacts`). The board offers to prune only what is there, so no button it
   * draws can be answered `nothing to prune`; the api judges the prune again all the same.
   */
  onDisk: { worktrees: boolean; files: boolean };
  /** As on `RunSummary`. */
  after: string[];
  /** As on `RunSummary`. */
  context: string[];
  /** The inbox card the run was started from, as its record carries it (`Run.from`); absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, as `nemia decide` says it under the run's line (`fromNote`): absent with `from`. */
  fromNote?: string;
  waiting: RunWaiting | null;
  /** As on `RunSummary`. */
  heldUntil: string[];
  /** As on `RunSummary` (`RunHolding`). */
  holding: RunHolding | null;
  /** As on `RunSummary`: the list's word, `awaiting approval` or `blocked` for a run a person alone stops, never `failed`. */
  status: RunStatus;
  /** As on `RunSummary`. */
  phase: RunPhase;
  /** As on `RunSummary`. */
  reason: RunReason;
  /** As on `RunSummary`. */
  moving: boolean;
  /** As on `RunSummary`. */
  cost: Spent | null;
  /** As on `RunSummary`. */
  atWork: AtWork | null;
  /** As on `RunSummary`, whose split the run's page shows. */
  tokens: RunTokens | null;
  /**
   * What the sessions of every try of every step read, by price, beside `cost`, which is theirs too (`RunRead`): each class only where
   * every session measured it, and the largest peak against the cap of the step that reached it. Null where none of it was measured.
   */
  read: RunRead | null;
  waitingOnYou: string[];
  /** As on `RunSummary`. */
  onYou: string[];
  /** As on `RunSummary` (`RunToDecide`). */
  toDecide: RunToDecide | null;
  /** The steps the run is gated at, in the order they run (`gatesOf`): those its workflow gates, and those it was started with. */
  gates: string[];
  /** Set when the workflow folder cannot be read, or lacks steps the run started with. */
  warning: string | null;
  /**
   * The kinds this run is behind the revisions ledger on, in `Drift`'s words: one entry per kind and name whose number the ledger has
   * moved past since the run resolved it — without `step`, what a filing after this would take (`nemia refresh`); with `step`, what a step
   * that has already been filed ran on, where the run's own pin has moved past it. `[]` for a run on the newest of every kind, and for a
   * record written before revisions, which pinned nothing.
   */
  kinds: readonly Drift[];
  /** The line to type to take the new revisions, built off the table (`refreshLine`): what the board shows beside the drift. */
  refresh: string;
  /**
   * The steps as a graph, from the workflow the run is judged by (`judgedSteps`), for every client to draw the same:
   * `runGraph`. A step the page shows and that workflow does not have waits on nothing, so it is a root.
   */
  graph: RunGraph;
  /** The recorded steps in the order the run started with them, then — on a record with no frozen workflow — any the folder has gained. */
  steps: Array<{
    name: string;
    /** From the workflow the run froze at `nemia start`; for a record that froze none, the folder. */
    spec: StepSpec | null;
    /** What the engine filed its current try with; null for a step not filed, or a task the engine has no record of. */
    filed: StepFiled | null;
    body: string | null;
    /** For a filed step, the brief the engine was filed with; for one not yet filed, what it would be given now. */
    told: string | null;
    /**
     * What it was told, by layer (`toldLayers`): its agent's instructions, the person's custom instructions, the factory's rules, the
     * step's policy and the task, each from the step the run froze at `nemia start`, the task cut from `told`. Null for a record that
     * froze no workflow, never read from the folder.
     */
    layers: ToldLayers | null;
    /** The task by part (`TaskPart`): its own text and each run it was handed, with how; null where nothing was told. */
    taskParts: TaskPart[] | null;
    taskId: string | null;
    workspace: string | null;
    /**
     * For a step of a folder run, every file its folder holds now, each as `folderFiles` reads it: the whole of what it made, not
     * only what its closeout named. Empty for a step of a repository run, whose work is a branch to read, and for one not filed yet.
     */
    files: StepArtifact[];
    /**
     * Why that list is empty when the folder is there and could not be read (`folderFiles`); null where the list is what the folder holds.
     */
    filesError: string | null;
    branch: string | null;
    /** As on `RunSummary`: where the step stands, as codes, and the sentence a person reads, never compared. */
    phase: StepPhase;
    reason: StepReason;
    message: string;
    /** As on `RunSummary`: its check's verdict as codes, null for a step not judged by its check. */
    verdict: CheckVerdict | null;
    /** @deprecated As on `RunSummary`: `message` under its old name, kept for one card. */
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    /** As on `RunSummary`. */
    roundDue: boolean;
    /** The lines a person types for what the step's controls do, built off the table (`stepCommands`). */
    commands: StepCommands;
    /** As on `RunSummary` (`StepNeeds`): read off that type, field by field, so a field it gains is declared here too and not only sent. */
    needs: StepNeeds['needs'];
    blockedByHarness: StepNeeds['blockedByHarness'];
    waitingFor: StepNeeds['waitingFor'];
    approve: StepNeeds['approve'];
    denied: StepNeeds['denied'];
    sessionUnread: StepNeeds['sessionUnread'];
    /**
     * Its gate, awaiting approval or approved (`StepGate`); null for a step with none. Judged by the workflow the run is: a step it does
     * not have is gated only where the run was started with its gate.
     */
    gate: StepGate | null;
    /** For a looping step a person ended out of rounds (`nemia accept`), their acceptance of the try it is on; null for any other step. */
    accepted: StepAcceptance | null;
    /**
     * For a step the harness blocked, what its session said last, as the engine's `transcript` reads it: its last `text` or `system`
     * event, trimmed. Null for any other step, and for one whose session said none or whose conversation cannot be read.
     */
    lastLine: string | null;
    /**
     * What a person said to the session of the step's current try while it ran — with `nemia say`, or the session page's prompt box — in
     * the order said: the engine's `said` entries on its task, off the views the request already read, each with the last event of the
     * session's transcript before its words went (`after`). Empty for a step not filed, and one nobody told.
     */
    said: Said[];
    /** The try a person asked for, which the next tick files (`StepAsked`); null when none is asked. */
    asked: StepAsked | null;
    closeout: StepCloseout | null;
    /**
     * Why its current try's closeout could not be read (`unreadableIn`), where `closeout` is null; null when it was read or there is none.
     */
    unreadable: StepUnreadable | null;
    /** Null for a step with no `check:` in the workflow the run froze. */
    check: StepCheck | null;
    attempts: StepAttempts;
    /**
     * What its current try consumed, in `nemia decide`'s words, its peak against the `context:` its sessions ran under as the run judges
     * the step; null for a step not filed, which consumed nothing.
     */
    used: StepUsed | null;
    /**
     * What every try of it has cost together, each session once, as `nemia ls` puts it beside the step's word (`stepSpend`); null until a
     * cost was measured.
     */
    spent: Spent | null;
    /** Its cap in force, and what its tries have cost of it (`StepBudget`); null for a step with no `budget:`. */
    budget: StepBudget | null;
    /**
     * The raise of its cap the package takes, and how (`StepRaise`); null for a step no raise takes on, and on a run called off, pruned or
     * held.
     */
    raise: StepRaise | null;
    /**
     * Every try, earliest first, the current one last and marked: `attempts` counts the current try's task alone, and each
     * round of a loop, and each try within one, is a task of its own — but a person's answer to a task held open, a turn of the
     * same task, each try reading its own turn's attempts and closeout (`attemptsIn`).
     */
    tries: StepTry[];
    /** Where the step's time went, try by try and check by check (`StepTimelineTry`); empty for a step not filed. */
    timeline: StepTimelineTry[];
  }>;
  /**
   * The run's time together, in the package's words (`timeline`): each round of its loop, and the whole run — with what the sessions in
   * each cost.
   */
  timeline: { rounds: StepTimelineTotal[]; run: StepTimelineTotal };
};

/**
 * A total of the run's time, as the package's `timeline` has it (`TimelineTotal`), and what the sessions it counts cost (`Spent`): the
 * run's, every step's tries (`runSpend`), or a round's — each session of a try its loop filed again in that round (`roundSpend`).
 */
export type StepTimelineTotal = TimelineTotal & { cost: Spent | null };

/**
 * One try of a step on the clock, as the package's `timeline` has it (`TimelineTry`): its session's task and its check's, each filed,
 * spawned and ended, with how long it queued for a slot and ran (the package's `TaskSpan`) — and what its session used, in `nemia decide`'s
 * words, where it ran one.
 */
export type StepTimelineTry = Omit<TimelineTry, 'used'> & { used: StepUsed | null };

/**
 * Where the run works, as a person reads it: its repository, the kind of place its steps work in, a folder run's work directory, the
 * workflow folder it was started from, the agent a try started from an agent's page tried, and its base commit, branch and whether it cut
 * worktrees.
 */
const whereOf = (
  run: Run,
  home: string,
): Pick<RunDetail, 'repo' | 'place' | 'work' | 'workflowDir' | 'try' | 'baseRef' | 'branch' | 'isolate'> => ({
  repo: run.repo ?? null,
  place: placeOf(run),
  work: isRepositoryRun(run) ? null : run.workspace,
  workflowDir: run.workflowDir,
  try: tryOf(run, home),
  baseRef: run.baseRef ?? null,
  branch: run.branch ?? null,
  isolate: run.isolate ?? null,
});

/**
 * What a step's tries have cost, against its cap, and the raise of that cap the package takes (`Spent`, `StepBudget`, `StepRaise`) — off
 * the views the request already read, which hold every try's task, with no observation of its own. `steps` are the workflow the run is
 * judged by: a step it does not have has no `budget:`. No raise on a run called off, pruned or held: a raise is asked with a try or a
 * round, which the verb refuses while a hold stands (`heldRefusal`).
 */
function costOf(
  run: Run,
  name: string,
  steps: readonly Workflow[],
  views: Views,
  spendOf: SpendOf,
): { spent: Spent | null; budget: StepBudget | null; raise: StepRaise | null } {
  const step = steps.find((s) => s.name === name);
  const spent = spentOf(stepSpend(run, name, spendOf));
  const cap = step ? budgetOf(step, run.steps[name]) : undefined;
  const budget =
    step && cap !== undefined
      ? {
          usd: cap,
          said: budgetWord(cap),
          of: spent && `${spent.said} of ${budgetWord(cap)}`,
          over: Boolean(overBudget(step, run, spendOf)),
        }
      : null;
  return { spent, budget, raise: step && !run.cancelledAt && !run.pruned && !run.hold ? raiseOf(run, step, steps, views, spendOf) : null };
}

/**
 * The raise of a step's cap the package takes (`StepRaise`), or null. A try's, where `retryable` carries one — a settled step over its
 * budget or ended at it, that a try takes on — and it may be tried; else a round's, for a looping step over its budget or out of rounds
 * whose loop has a step over its budget (`loopOver`): `nemia round --budget` has to pass the most any of them has cost, as `roundAsk`
 * refuses less.
 */
function raiseOf(run: Run, step: Workflow, steps: readonly Workflow[], views: Views, spendOf: SpendOf): StepRaise | null {
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const { status, modes, raise } = retryable(step, run, phase, reader, asked, steps, () => false, spendOf, exitVerdicts(views, run));
  if (raise && modes.length) {
    return {
      by: 'retry',
      above: raise.above,
      said: dollars(raise.above),
      modes,
      own: ownStatus(step, run, phase, reader, asked, steps, spendOf),
    };
  }
  const over = step.loop && (status === 'over budget' || status === 'exhausted') ? loopOver(steps, step, run, spendOf) : [];
  if (!over.length) return null;
  const above = Math.max(0, ...over.map((o) => o.spent.usd));
  return { by: 'round', above, said: dollars(above), modes: [], own: null };
}

/**
 * What a round of a loop cost: the session of each try the package's `timeline` counts in that round — the steps the loop files again
 * (`loopSpan`), a session each once, which a try a recheck reached has none of — as `taskSpend` reads it, added up (`addSpend`). The
 * package's `timeline` times a round and carries no cost of one; this adds up the sessions of its own tries, with its own functions.
 */
function roundSpend(clock: Timeline, steps: readonly Workflow[], total: TimelineTotal, spendOf: SpendOf): Spend {
  const looping = steps.find((s) => s.name === total.loop);
  const names = looping ? loopSpan(steps, looping) : [];
  return addSpend(
    names.flatMap((name) =>
      (clock.steps[name] ?? []).flatMap((t) => (t.round === total.round && t.session ? [spendOf(t.session.taskId)] : [])),
    ),
  );
}

/**
 * Where the last read of a blocked session's conversation stopped, and what it had said last by then: by task and attempt. One for an app,
 * of its engine's sessions (`ReadMemo`, layer.ts).
 */
export type LastSaid = Map<string, { cursor: string; line: string | null }>;

/**
 * What a session said last — its last `text` or `system` event, trimmed — through the engine's `transcript`, or null when it has said
 * none or its conversation cannot be read. What it said, not what it was told: a brief, a `nemia say` and every tool result come back as
 * `user` events (`TranscriptEvent`), and reading a person's own words back to them says nothing about why the harness stopped.
 *
 * Each read costs an observation of the task's harness: the attempt of a session the harness blocked has not ended, so its session's id
 * is on no record, and the engine asks the registry for it (one `claude agents` call). Read on a run's detail, as a refused check's output
 * is, and never on the list.
 *
 * Read from where the last read of the same attempt stopped, so a page polled every five seconds reads what the session wrote since,
 * not its whole conversation again (`said`); a cursor the engine refuses, of a transcript replaced since, is read again from the start. A
 * read's cache, and nothing is decided by it: a fresh app reads from the start.
 */
async function lastLineOf(e: Engine['Service'], view: TaskView, said: LastSaid): Promise<string | null> {
  const key = `${view.id}#${view.state.attempts.length}`;
  const read = (after?: string) => engineRead('transcript', e.transcript(view.id, after)).catch(() => undefined);
  let from = said.get(key);
  let got = from ? await read(from.cursor) : undefined;
  if (!got) {
    from = undefined;
    got = await read();
  }
  if (!got) return null;
  const last = got.events
    .filter((event) => event.role !== 'user' && (event.kind === 'text' || event.kind === 'system') && event.text?.trim())
    .at(-1);
  const line = last?.text?.trim() ?? from?.line ?? null;
  said.set(key, { cursor: got.cursor, line });
  return line;
}

/**
 * Every file that folder holds (`folderFiles`), for a person who never opens a terminal; empty where there is no folder. A folder the
 * api cannot read answers with why instead of a list, since the board words an empty list as the step having made nothing.
 */
function filesOf(run: Run, step: string): { files: StepArtifact[]; filesError: string | null } {
  const dir = workFolderOf(run, step);
  const { files, error } = dir ? folderFiles(run, step, dir) : { files: [], error: null };
  return { files, filesError: error };
}

/** A try asked for, as the page says it (`StepAsked`). */
const askedOf = (r: Retry | undefined): StepAsked | null =>
  r ? { try: r.try, mode: r.mode, model: r.model ?? null, message: r.message ?? null, stopFirst: r.stopFirst === true } : null;

const specOf = (step: Workflow): StepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  effort: step.effort ?? null,
  context: step.context ?? null,
  after: step.after,
  workspace: step.workspace ?? null,
  place: step.place ?? null,
  resume: step.resume ?? null,
  permissionMode: step.permissionMode ?? null,
  sandbox: step.sandbox ?? null,
  tools: step.tools ?? null,
  deadlineSeconds: step.deadlineSeconds ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
});

/**
 * Where what a page shows of a step's workflow is read from: the workflow the run froze at `nemia start`, which the tick
 * files from and `judgedSteps` judges by; the folder only for a record that froze none. Null when neither reads.
 */
const shownWorkflow = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] | null => run.workflow ?? folder;

/** The runs a run waits on (`after`) and is handed as context (`context`), as its page shows them: none where it names none. */
const handedRuns = (run: Run): Pick<RunDetail, 'after' | 'context'> => ({ after: run.after ?? [], context: run.context ?? [] });

/** What `nemia prune` took of a run, as the page shows it: when, each worktree and what it held, and its artifacts; null for none. */
const prunedOf = (run: Run): RunDetail['pruned'] =>
  run.pruned
    ? {
        at: run.pruned.at,
        worktrees: run.pruned.worktrees.map(({ path, bytes }) => ({ path, bytes })),
        artifacts: run.pruned.artifacts ? { at: run.pruned.artifacts.at, bytes: run.pruned.artifacts.bytes } : null,
      }
    : null;

/** What `detail` reads of the app's services: the engine, the place, the store's root, and what it read before. */
type Detailing = Pick<Served, 'e' | 'placeService' | 'home' | 'memo'>;

/**
 * A run in full, judged off the views of its tasks; or, when its unfrozen folder does not load or a task it reads does not
 * (`judgedUnlessUnreadable`), why it is not judged, in the words the list says it with (`RunSummary.unreadable`), and nothing else: the
 * page shows no step as the engine's missing record, or a folder the tick does not read, would.
 *
 * The run's tasks, every try's, are read over one look at the harnesses (`viewsFor`), as the list reads them, the record first — never a
 * `view`, an observation, for each task of each try, one after another, on a page polled every five seconds — and only the run's own. A
 * refused check's streams are read through the engine's `output`, which observes nothing (`refusedStderr`, `checksOf`), and one more
 * observation is made for each blocked session's last line (`lastLineOf`), which only a run's own detail reads. What its tries consumed and
 * cost, and its timeline, come off the same views and the feed's filing times (`filedTimes`), with no observation of their own; the
 * timeline's rounds are of the loops of the steps the run is judged by. Read through the app's engine and root, what it read before kept in
 * its `memo`.
 */
export async function detail(run: Run, { e, placeService, home, memo }: Detailing): Promise<RunDetail | { unjudged: string }> {
  const folder = workflowsOf(run, home);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  const { views, read } = await judgedOn(e, placeService, run, names, workflows);
  if ('unreadable' in read) return { unjudged: read.unreadable };
  const judged = read.judged;
  const steps = judgedSteps(run, workflows);
  const stderr = await refusedStderr(e, run, views);
  const checks = await checksOf(e, run, steps, views, stderr);
  const source = shownWorkflow(run, workflows);
  const used = consumption(views, run);
  const filed = await runWith(e, filedTimes(e, memo.filings));
  const clock = timeline(run, views, filed, steps);
  return {
    id: run.id,
    brief: run.brief,
    decide: decideLine(run.id),
    ...whereOf(run, home),
    createdAt: run.createdAt,
    startedAt: runStartedAt(run, filed),
    cancelledAt: run.cancelledAt ?? null,
    pruned: prunedOf(run),
    onDisk: onDiskOf(run, home),
    ...handedRuns(run),
    ...(run.from ? { from: run.from, fromNote: fromNote(run)! } : {}),
    waiting: judged.waiting,
    heldUntil: judged.holding ? run.hold!.until : [],
    holding: judged.holding,
    ...runSaid(judged),
    moving: judged.moving,
    cost: judged.cost,
    atWork: atWork(run, views),
    tokens: runTokens(run, views),
    read: runRead(clock, steps, names),
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
    gates: gatesOf(steps, run),
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    kinds: kindsOf(run),
    refresh: refreshLine(run.id),
    graph: runGraph(steps, names),
    steps: await Promise.all(
      names.map(async (name) => {
        const step = source?.find((s) => s.name === name);
        const taskId = run.steps[name]?.taskId ?? null;
        const judgedContext = steps.find((s) => s.name === name)?.context;
        const needs = needsOf(run, name, views, judged);
        const current = {
          ...stepSaid(judged, name),
          check: checks.get(name) ?? null,
          closeout: closeoutIn(run, name, step ?? bare(name), taskId, views),
          unreadable: unreadableIn(taskId, views),
          attempts: attemptsIn(taskId, views),
        };
        return {
          name,
          spec: step ? specOf(step) : null,
          filed: filedOf(run.steps[name], views),
          body: step?.body ?? null,
          ...toldOf(run, name, source, views, placeService),
          taskId,
          workspace: run.steps[name]?.workspace ?? null,
          ...filesOf(run, name),
          branch: run.steps[name]?.branch ?? null,
          note: judged.notes.get(name) ?? null,
          roundDue: judged.roundDue.has(name),
          commands: stepCommands(run.id, name),
          ...needs,
          lastLine: needs.blockedByHarness ? await lastLineOf(e, views.get(taskId!)!, memo.said) : null,
          gate: gateOf(run, steps.find((s) => s.name === name) ?? bare(name), current.reason),
          accepted: acceptedOf(run, name),
          said: taskId ? [...(views.get(taskId)?.state.said ?? [])] : [],
          asked: askedOf(judged.asked.get(name)),
          ...current,
          used: taskId ? usedOf(used[name], judgedContext) : null,
          ...costOf(run, name, steps, views, judged.spendOf),
          tries: triesOf(run, name, steps, views, current, judged.answers, stderr),
          timeline: (clock.steps[name] ?? []).map((t) => ({ ...t, used: t.session ? usedOf(t.used, judgedContext) : null })),
        };
      }),
    ),
    timeline: runTimeline(clock, steps, judged),
  };
}

/** The run's timeline: each round with what it cost, by the steps the run is judged by, and the run's own span with what it cost. */
const runTimeline = (
  clock: Timeline,
  steps: readonly Workflow[],
  judged: { spendOf: Parameters<typeof roundSpend>[3]; cost: RunDetail['timeline']['run']['cost'] },
): RunDetail['timeline'] => ({
  rounds: clock.rounds.map((r) => ({ ...r, cost: spentOf(roundSpend(clock, steps, r, judged.spendOf)) })),
  run: { ...clock.run, cost: judged.cost },
});

/** What the sessions of every try of every step read, by price (`RunRead`), off the run's timeline; null where none of it was measured. */
const runRead = (clock: Timeline, steps: readonly Workflow[], names: readonly string[]): RunRead | null =>
  readOf(
    totalOf(
      steps,
      names.flatMap((name) => (clock.steps[name] ?? []).flatMap((t) => (t.session ? [[name, t.used] as const] : []))),
    ),
  );

/**
 * What the engine filed a step's current try with (`StepFiled`), off its record; null for no task, or one the engine has no record of. The
 * harness's arguments are the adapter's, under `config` (agent-runtime's `HarnessArgs`), which the engine carries unread.
 */
function filedOf(record: StepRecord | undefined, views: Views): StepFiled | null {
  const view = record?.taskId ? views.get(record.taskId) : undefined;
  if (!view || phaseOfView(view) === 'unknown') return null;
  const { deadlineSeconds } = view.state;
  const { model, effort, contextTokens, permissionMode, tools } = view.state.config ?? {};
  return {
    model: model ?? null,
    askedModel: askedModelOf(record),
    effort: effort ?? null,
    contextTokens: contextTokens ?? null,
    permissionMode: permissionMode ?? null,
    runsIn: runsInOf(view.state),
    remote: remoteOf(view.state.harness),
    bridge: bridgeOf(views)(view.id),
    tools: tools ?? null,
    deadlineSeconds: deadlineSeconds ?? null,
  };
}

/**
 * The model a person's `nemia retry --model` asked a step's current try for: on the try its task replaced, where `nextTry` keeps the
 * model with the mode — found past any recheck, which replaced only a check, and kept the task.
 */
function askedModelOf(record: StepRecord | undefined): string | null {
  const tries = record?.tries ?? [];
  return [...tries].reverse().find((t) => t.then !== 'recheck')?.model ?? null;
}

/**
 * The remote A2A agent a task was filed on (`StepFiled.remote`), or null for a local harness. Its address is read from the store's
 * `a2a-agents.json` on each request (`remoteAgents`), as the base URL given or, for an agent given by its card, the card's first interface:
 * origin and path alone, so a query string that carries a key is never shown. A file that does not declare the name, whose entry for it is
 * refused, or that is refused as it stands, gives no address — the run's page is still drawn, and `nemia up` says what is wrong with the
 * file.
 */
function remoteOf(harness: string | undefined): StepFiled['remote'] {
  const name = remoteNameOf(harness);
  if (name === undefined) return null;
  let agent: Record<string, unknown> | undefined;
  try {
    agent = remoteAgents().get(name);
  } catch {
    return { name, address: null };
  }
  const interfaces = (agent?.card as { supportedInterfaces?: Array<{ url?: unknown }> } | undefined)?.supportedInterfaces;
  const given = agent?.url ?? interfaces?.[0]?.url;
  if (typeof given !== 'string' || !URL.canParse(given)) return { name, address: null };
  const url = new URL(given);
  return { name, address: `${url.origin}${url.pathname === '/' ? '' : url.pathname}` };
}

/** The flags a harness's command gives its session's permission mode by: Claude Code's mode, and Codex's sandbox. */
const MODE_FLAGS: readonly string[] = ['--permission-mode', '-s', '--sandbox'];

/**
 * The permission mode a task's session runs in (`StepFiled.runsIn`), as its harness decides it from what the engine was filed with.
 *
 * A harness the run brings as a spec — `codex`, `claude-detached` — is asked with its own `command`, a pure function of the request:
 * the mode it would spawn the session with, and again without `tools`, which tells a sandbox the tools narrowed from one the task
 * named. So a rule the engine changes is the rule read here. `claude` is the engine's own harness, a job (`claude -p`) or, filed with
 * `config.background`, a background session (`claude --bg`), whose spawn is no function it exports: either takes the mode filed, or
 * `auto` (`claudePrintFlags` and `claudeOps` in agent-runtime), which the api test holds to the command each spawns. A task filed with
 * no harness ran on the engine's first (`fallback` in its facade). Null for a harness the api cannot ask, or one whose command names no
 * mode.
 */
function runsInOf(state: TaskView['state']): StepFiled['runsIn'] {
  const name = state.harness ?? Object.keys(HARNESSES)[0];
  if (!Object.hasOwn(HARNESSES, name)) return null;
  const harness = HARNESSES[name as keyof typeof HARNESSES];
  const { permissionMode, tools: filedTools } = state.config ?? {};
  const by = permissionMode === undefined ? 'default' : 'filed';
  if (harness === 'claude') return { mode: permissionMode ?? 'auto', by };
  if (typeof harness !== 'object' || !('command' in harness)) return null;
  const modeOf = (tools: string[] | undefined): string | undefined => {
    try {
      const { args } = harness.command({
        name: `${state.taskId}/mode`,
        brief: '',
        cwd: state.cwd || '/',
        config: { permissionMode, tools },
      });
      const at = args.findIndex((arg) => MODE_FLAGS.includes(arg));
      return at < 0 ? undefined : args[at + 1];
    } catch {
      return undefined;
    }
  };
  const mode = modeOf(filedTools);
  if (mode === undefined) return null;
  return { mode, by: filedTools && modeOf(undefined) !== mode ? 'tools' : by };
}

/** What of a run `nemia prune` would find on disk (`RunDetail.onDisk`): two stats, and no git. */
function onDiskOf(run: Run, home: string): RunDetail['onDisk'] {
  const files = path.dirname(artifactsDir(run, '_'));
  return { worktrees: isRepositoryRun(run) && fs.existsSync(path.join(home, 'worktrees', run.id)), files: fs.existsSync(files) };
}
