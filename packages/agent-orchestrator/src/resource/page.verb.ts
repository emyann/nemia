/**
 * One run in full, for a person reading it (`GET /api/runs/:id` serves it): the spec, and per step what it was told and how it went. The
 * page's judgement, the api's route only serving it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { type AtWork, atWork, runStartedAt, type RunTokens, runTokens, type Timeline, timeline } from '../timeline/index.ts';
import type { TimelineTotal, TimelineTry } from '../timeline/index.ts';
import { artifactsDir } from '../record/record.store.ts';
import { budgetWord } from '../status/status.ts';
import { closeoutAsked, closeoutReader, consumption, exitVerdicts } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { type Engine, EngineService } from '../runtime-client.ts';
import { type Retry, type RetryMode, stepRaise, type RaiseReads, type StepRaise } from '../retry/index.ts';
import {
  bare,
  filedTimes,
  type Filings,
  judgedSteps,
  judgedUnlessUnreadable,
  stepNames,
  tryOf,
  type Views,
  viewsFor,
  workflowsOf,
} from '../summary/reads.verb.ts';
import {
  atHarness,
  judge,
  needsOf,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunWaiting,
  runSaid,
  type Spent,
  spentOf,
  standingsOf,
  stepSaid,
  type StepNeeds,
} from '../summary/judged.verb.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { PlaceService } from '../place/place.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Drift } from '../revisions/revisions.ts';
import { driftNow } from '../revisions/pin.verb.ts';
import { type RunGraph, runGraph } from '../summary/graph.ts';
import type { AnswerVia, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from '../feed/index.ts';
import type { CheckVerdict } from '../check/check.ts';
import {
  addSpend,
  budgetOf,
  fromNote,
  gatesOf,
  isRepositoryRun,
  overBudget,
  type PlaceKind,
  placeOf,
  type Run,
  type Said,
  type Spend,
  type SpendOf,
  stepSpend,
  type ToldLayers,
} from '../run.ts';
import { loopSpan, type Workflow } from '../workflow.ts';
import { folderFiles, type StepArtifact, workFolderOf } from './files.store.ts';
import { type CheckStderr, checksOf, type LastSaid, lastLineOf, refusedStderr, type StepCheck } from './checks.verb.ts';
import {
  acceptedOf,
  attemptsIn,
  closeoutIn,
  driftOf,
  type StepAcceptance,
  type StepAttempts,
  type StepCloseout,
  type StepGate,
  type StepTry,
  type StepUnreadable,
  gateOf,
  triesOf,
  unreadableIn,
} from './tries.verb.ts';
import { filedOf, type StepFiled, type TaskPart, toldOf } from './told.verb.ts';
import { readOf, type RunRead, type StepUsed, totalOf, usedOf } from './usage.ts';
import { commandLine } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import type { Command } from '../command/entry.verb.ts';

/**
 * A step's cap, and what its tries have cost of it. `usd` is the cap in force (`budgetOf`): the `budget:` the run froze, until a person
 * raises it (`nemia retry --budget`, `nemia retry --round --budget`). `said` is the cap as its author writes one (`budgetWord`: `$3`), and
 * `of` what the step's tries have cost of it, as `nemia ls` puts it in `over budget $4.25 of $3` — null until a cost was measured. `over`
 * is whether they have cost the cap or more (`overBudget`). Past the cap alone holds nothing: the step is held only where its `status` word
 * says `over budget` or `budget exhausted` — where another session of it is the way on. A Claude Code job, on the Agent SDK, is ended at
 * its cap; a session an older runtime ran in the background kept none and was not stopped, so a step of a record from then can have
 * finished past it with nothing waiting on a raise.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/** A raise of a step's cap the package takes, and how it is asked for: the one `nemia decide` offers (`stepRaise`, retry.ts). */
export type { StepRaise };

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
   * `base` for a step that runs in the repository's own checkout rather than a worktree of the run's (`workspace: base`): the step that
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
  holdUntil: string[];
  /** As on `RunSummary` (`RunHolding`). */
  holding: RunHolding | null;
  /** As on `RunSummary`: the list's word, `awaiting approval` or `waiting` for a run a person alone stops, never `failed`. */
  status: RunStatus;
  /** As on `RunSummary`. */
  phase: RunPhase;
  /** As on `RunSummary`. */
  reason: RunReason;
  /** As on `RunSummary`: what a `Waiting` run waits on, else null. */
  on: WaitOn | null;
  /** As on `RunSummary`: where an `AwaitingAnswer` run's answer is asked, else null. */
  via: AnswerVia | null;
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
  waitingOnYouWords: string[];
  /** As on `RunSummary` (`RunToDecide`). */
  toDecide: RunToDecide | null;
  /** The steps the run is gated at, in the order they run (`gatesOf`): those its workflow gates, and those it was started with. */
  gates: string[];
  /** Set when the workflow folder cannot be read, or lacks steps the run started with. */
  warning: string | null;
  /**
   * The kinds this run is behind the files on, in `Drift`'s words (`driftNow`): what the files hold now, resolved on this read without a
   * write to the ledger and compared by digest — one entry per kind and name whose bytes differ from what the run resolved, `now` being
   * the number those bytes have, or would be given, which may be lower than `pinned`. Without `step`, what a filing after this would take
   * (`nemia refresh`); with `step`, what a step that has already been filed ran on, where the run's own pin has moved past it. `[]` for a
   * run whose next filing would take its pins, for one that has filed nothing, and for a record written before revisions.
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
    /** As on `RunSummary`: what a `Waiting` step waits on, else null. */
    on: WaitOn | null;
    /** As on `RunSummary`: where an `AwaitingAnswer` step's answer is asked, else null. */
    via: AnswerVia | null;
    message: string;
    /** As on `RunSummary`: its check's verdict as codes, null for a step not judged by its check. */
    verdict: CheckVerdict | null;
    /** As on `RunSummary`. */
    note: string | null;
    /** As on `RunSummary`. */
    roundDue: boolean;
    /** The lines a person types for what the step's controls do, built off the table (`stepCommands`). */
    commands: StepCommands;
    /** As on `RunSummary` (`StepNeeds`): read off that type, field by field, so a field it gains is declared here too and not only sent. */
    needs: StepNeeds['needs'];
    waitingFor: StepNeeds['waitingFor'];
    approve: StepNeeds['approve'];
    denied: StepNeeds['denied'];
    sessionUnread: StepNeeds['sessionUnread'];
    /**
     * Its gate, awaiting approval or approved (`StepGate`); null for a step with none. Judged by the workflow the run is: a step it does
     * not have is gated only where the run was started with its gate.
     */
    gate: StepGate | null;
    /** For a looping step a person ended out of rounds (`nemia approve`), their acceptance of the try it is on; null for any other step. */
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
  return { spent, budget, raise: step ? stepRaise(step, run, steps, raiseReads(run, views), spendOf) : null };
}

/** What a step's raise is read from, off the views the request already read (`RaiseReads`), as `nemia decide` reads them. */
const raiseReads = (run: Run, views: Views): RaiseReads => ({
  phaseOf: (taskId) => phaseOfView(views.get(taskId)),
  closeoutOf: closeoutReader(views, run),
  askedCloseout: closeoutAsked(views),
  verdictOf: exitVerdicts(views, run),
});

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

/**
 * What `runPage` is handed beside its services, as the api's handler holds it: what the app's reads keep between requests (`filings`, the
 * feed's filing times; `said`, where each blocked session's conversation was last read), and `inRequest`, which runs the drift's program
 * over the request's own services, so it reads the doors the app was given.
 */
export type RunPageReads = {
  readonly memo: { readonly filings: Filings; readonly said: LastSaid };
  readonly inRequest: (program: ReturnType<typeof driftNow>) => Promise<readonly Drift[]>;
};

/**
 * The views of `run`'s tasks over `e`, and what the run is judged as off them, its steps `names` of `workflows`, where its branches stand
 * read off `standing.json` (`standingSnapshot`): or, when its unfrozen folder does not load or a task it reads does not, why it is not
 * judged (`judgedUnlessUnreadable`).
 */
const judgedOn = Effect.fnUntraced(function* (e: Engine, run: Run, names: readonly string[], workflows: readonly Workflow[] | null) {
  const { views, reader, unreadable } = yield* viewsFor(e, [run]);
  const git = standingReader(yield* standingSnapshot());
  const standings = (status: Parameters<typeof standingsOf>[2], steps: Parameters<typeof standingsOf>[1]) =>
    standingsOf(run, steps, status, git);
  const read = yield* judgedUnlessUnreadable(run, unreadable, () => judge(run, names, workflows, views, { reader, git, standings }));
  return { views, read };
});

/** The run in full, or why it is not judged, in the words the list says it with (`RunSummary.unreadable`). */
export type RunPageAnswer = RunDetail | { unjudged: string };

/** A run not judged, as its page answers it: why, and nothing else. */
const unjudgedPage = (why: string): RunPageAnswer => ({ unjudged: why });

/** What `runPage` read once for the run, handed to each step's part of it (`stepPage`). */
type StepAt = {
  readonly e: Engine;
  readonly placeService: PlaceService['Service'];
  readonly run: Run;
  readonly source: readonly Workflow[] | null;
  readonly steps: readonly Workflow[];
  readonly views: Views;
  readonly judged: Extract<Effect.Success<ReturnType<typeof judge>>, object>;
  readonly checks: ReadonlyMap<string, StepCheck>;
  readonly used: ReturnType<typeof consumption>;
  readonly clock: Timeline;
  readonly stderr: CheckStderr;
  readonly said: LastSaid;
};

/** One step of the run's page (`RunDetail['steps']`), off what `runPage` read once for the run (`StepAt`). */
const stepPage = Effect.fnUntraced(function* (
  name: string,
  { e, placeService, run, source, steps, views, judged, checks, used, clock, stderr, said: memoSaid }: StepAt,
) {
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
  const lastLine = atHarness(current) ? yield* Effect.promise(() => lastLineOf(e, views, taskId, memoSaid)) : null;
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
    lastLine,
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
});

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
 * timeline's rounds are of the loops of the steps the run is judged by. A program over the engine, the place and the store's root
 * (`EngineService`, `PlaceService`, `StoreRoot`), what it read before kept in `memo`, the app's; the kinds it is behind the files on
 * (`driftNow`) through the doors, over the request's services (`inRequest`).
 */
export const runPage = Effect.fn('runPage')(function* (run: Run, { memo, inRequest }: RunPageReads) {
  const e = yield* EngineService;
  const placeService = yield* PlaceService;
  const home = yield* StoreRoot;
  const folder = workflowsOf(run, home);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  const { views, read } = yield* judgedOn(e, run, names, workflows);
  if ('unreadable' in read) return unjudgedPage(read.unreadable);
  const judged = read.judged;
  const steps = judgedSteps(run, workflows);
  const stderr = yield* Effect.promise(() => refusedStderr(e, run, views));
  const checks = yield* Effect.promise(() => checksOf(e, run, steps, views, stderr));
  const source = shownWorkflow(run, workflows);
  const used = consumption(views, run);
  const filed = yield* filedTimes(e, memo.filings);
  const clock = timeline(run, views, filed, steps);
  const kinds = yield* Effect.promise(() => inRequest(driftNow(run)));
  const at: StepAt = { e, placeService, run, source, steps, views, judged, checks, used, clock, stderr, said: memo.said };
  const shown = yield* Effect.forEach(names, (name) => stepPage(name, at), { concurrency: 'unbounded' });
  const page: RunDetail = {
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
    ...(run.from ? { from: run.from, fromNote: fromNote(run) } : {}),
    waiting: judged.waiting,
    holdUntil: judged.holding && run.hold ? run.hold.until : [],
    holding: judged.holding,
    ...runSaid(judged),
    moving: judged.moving,
    cost: judged.cost,
    atWork: atWork(run, views),
    tokens: runTokens(run, views),
    read: runRead(clock, steps, names),
    waitingOnYou: judged.waitingOnYou,
    waitingOnYouWords: judged.waitingOnYouWords,
    toDecide: judged.toDecide,
    gates: gatesOf(steps, run),
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    kinds,
    refresh: refreshLine(run.id),
    graph: runGraph(steps, names),
    steps: shown,
    timeline: runTimeline(clock, steps, judged),
  };
  return page;
});

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

/** What of a run `nemia prune` would find on disk (`RunDetail.onDisk`): two stats, and no git. */
function onDiskOf(run: Run, home: string): RunDetail['onDisk'] {
  const files = path.dirname(artifactsDir(run, '_'));
  return { worktrees: isRepositoryRun(run) && fs.existsSync(path.join(home, 'worktrees', run.id)), files: fs.existsSync(files) };
}

/**
 * The command of the table (`COMMANDS`) named `name`: thrown as this module loads when the table holds none by that name, so a name the
 * table renamed is a failed start, not a page that fails as it is read.
 */
function named(name: string): Command {
  const command = COMMANDS.find((c) => c.name === name);
  if (command === undefined) throw new Error(`No command '${name}' in the orchestrator's table (COMMANDS): name one it holds.`);
  return command;
}

const DECIDE = named('decide');
const APPROVE = named('approve');
const RETRY = named('retry');
const SAY = named('say');
const REFRESH = named('refresh');

/** The line that prints what there is to decide on a run: `nemia decide <run>`. */
export const decideLine = (runId: string): string => commandLine(DECIDE, { runId });

/**
 * The line that takes the new revisions of every kind a run resolved: `nemia refresh <run>`, the run alone — the step refresh takes is
 * `--base`'s (`nemia refresh <run> [<step>] --base`), which this line does not ask, so it is not said, not even as `[<step>]`.
 */
export const refreshLine = (runId: string): string =>
  commandLine(
    { name: REFRESH.name, spec: { ...REFRESH.spec, positionals: REFRESH.spec.positionals.filter((p) => p.key === 'runId') } },
    { runId },
  );

/** A step's lines beside its controls: its approval at its gate, a try in its session, and words said to it. */
export type StepCommands = { approve: string; retry: string; say: string };

/** A step's lines: `nemia approve <run> <step>`, `nemia retry <run> <step>` and `nemia say <run> <step>`. */
export const stepCommands = (runId: string, step: string): StepCommands => ({
  approve: commandLine(APPROVE, { runId, step }),
  retry: commandLine(RETRY, { runId, step }),
  say: commandLine(SAY, { runId, step }),
});
