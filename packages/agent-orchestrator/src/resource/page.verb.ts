/**
 * One run in full, for a person reading it (`GET /api/runs/:id?view=page` serves it): the spec, and per step what it was told and how it
 * went — projected from the run's object and its sub-resources (`runParts`), which carry all of it; the api's route only serving it.
 */
import { Effect } from 'effect';
import type { AtWork, RunTokens, TimelineTotal, TimelineTry } from '../timeline/index.ts';
import type { RetryMode, StepRaise } from '../retry/index.ts';
import type { RunHolding, RunStatus, RunToDecide, RunWaiting, Spent, StepNeeds } from '../summary/judged.verb.ts';
import type { Drift } from '../revisions/revisions.ts';
import type { GraphEdge, RunGraph } from '../summary/graph.ts';
import type { AnswerVia, RunPhase, RunReason, StepPhase, StepReason, WaitOn } from '../feed/index.ts';
import type { CheckVerdict } from '../check/check.ts';
import { fromNote, type PlaceKind, type Run, type Said, type ToldLayers } from '../run.ts';
import type { StepArtifact } from './files.store.ts';
import type { StepCheck } from './checks.verb.ts';
import type { StepAcceptance, StepAttempts, StepCloseout, StepGate, StepTry, StepUnreadable } from './tries.verb.ts';
import type { StepFiled, TaskPart } from './told.verb.ts';
import type { RunRead, StepUsed } from './usage.ts';
import { type RunParts, runParts, type RunReads } from '../object/run.verb.ts';
import { commandLine } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import type { Command } from '../command/entry.verb.ts';
import type { RunSpecStep, RunStepStatus, StepTold } from '../object/run.model.ts';

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
 * What `runPage` is handed beside its services, as the api's handler holds it (`RunReads`): what the app's reads keep between requests,
 * and `inRequest`, which runs the drift's program over the request's own services, so it reads the doors the app was given.
 */
export type RunPageReads = RunReads & { readonly inRequest: NonNullable<RunReads['inRequest']> };

/** The run in full, or why it is not judged, in the words the list says it with (`RunSummary.unreadable`). */
export type RunPageAnswer = RunDetail | { unjudged: string };

/** A run not judged, as its page answers it: why, and nothing else. */
const unjudgedPage = (why: string): RunPageAnswer => ({ unjudged: why });

/**
 * The run's page projected from its object and every step's tries and told layers (`runParts`), with the lines a person types built off
 * the command table: so each other field the page shows is a field of the object or of a sub-resource, and a field the object drops fails
 * every test of the page.
 */
export const pageOf = ({ object, tries, told }: RunParts): RunDetail => {
  const { metadata, spec, status } = object;
  return {
    id: metadata.name,
    brief: spec.brief,
    decide: decideLine(metadata.name),
    repo: spec.repo,
    place: spec.place,
    work: spec.work,
    workflowDir: spec.workflowDir,
    try: spec.try,
    baseRef: spec.baseRef,
    branch: spec.branch,
    isolate: spec.isolate,
    createdAt: metadata.creationTimestamp,
    startedAt: status.startedAt,
    cancelledAt: status.cancelledAt,
    pruned: status.pruned,
    onDisk: status.onDisk,
    after: spec.after,
    context: spec.context,
    ...(spec.from ? { from: spec.from, fromNote: fromNote({ from: spec.from }) } : {}),
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
    read: status.read,
    waitingOnYou: status.waitingOnYou,
    waitingOnYouWords: status.waitingOnYouWords,
    toDecide: status.toDecide,
    gates: status.gates,
    warning: status.warning,
    kinds: status.kinds,
    refresh: refreshLine(metadata.name),
    graph: { roots: status.graph.roots, edges: status.graph.edges.filter((e): e is GraphEdge => e.kind !== 'input') },
    steps: status.steps.map((step) => stepPageOf(metadata.name, step, spec.steps, tries[step.name] ?? [], told[step.name])),
    timeline: { rounds: status.timeline.rounds, run: status.timeline.run },
  };
};

/** The page's spec of a step (`StepSpec`), from the object's frozen step; null for a step the run froze none of. */
const stepSpecOf = (s: RunSpecStep | undefined): StepSpec | null =>
  s
    ? {
        harness: s.harness,
        model: s.model,
        effort: s.effort,
        context: s.context,
        after: s.after,
        workspace: s.workspace,
        place: s.place,
        resume: s.resume,
        permissionMode: s.fence,
        sandbox: s.sandbox,
        tools: s.tools,
        deadlineSeconds: s.deadlineSeconds,
        loop: s.loop,
        rounds: s.rounds,
      }
    : null;

/** One step of the page, from its status in the object, the frozen steps, its tries whole and what it was told. */
const stepPageOf = (
  runId: string,
  step: RunStepStatus,
  frozen: readonly RunSpecStep[],
  tries: StepTry[],
  told: StepTold | undefined,
): RunDetail['steps'][number] => {
  const { status: _word, current: _short, filed, ...rest } = step;
  const latest = tries.find((t) => t.current);
  return {
    ...rest,
    spec: stepSpecOf(frozen.find((s) => s.name === step.name)),
    commands: stepCommands(runId, step.name),
    filed: filed && (({ fence, ...given }) => ({ ...given, permissionMode: fence }))(filed),
    body: told?.body ?? null,
    told: told?.told ?? null,
    layers: told?.layers ?? null,
    taskParts: told?.taskParts ?? null,
    closeout: latest?.closeout ?? null,
    unreadable: latest?.unreadable ?? null,
    tries,
  };
};

/**
 * A run in full, judged off the views of its tasks; or, when its unfrozen folder does not load or a task it reads does not
 * (`judgedUnlessUnreadable`), why it is not judged, in the words the list says it with (`RunSummary.unreadable`), and nothing else: the
 * page shows no step as the engine's missing record, or a folder the tick does not read, would.
 *
 * The object of the run and every step's tries and told layers, off one read (`runParts`), projected to the page (`pageOf`), so the page
 * shows nothing the object and its sub-resources do not carry. A program over the engine, the place and the store's root
 * (`EngineService`, `PlaceService`, `StoreRoot`), what it read before kept in `memo`, the app's; the kinds it is behind the files on
 * (`driftNow`) through the doors, over the request's services (`inRequest`).
 */
export const runPage = Effect.fn('runPage')(function* (run: Run, reads: RunPageReads) {
  const parts = yield* runParts(run, reads);
  return 'unjudged' in parts ? unjudgedPage(parts.unjudged) : pageOf(parts);
});

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
