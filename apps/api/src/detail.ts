/** One run in full, for a person reading it (`GET /api/runs/:id`): the spec, and per step what it was told and how it went. */
import { budgetWord, closeoutAsked, closeoutReader, consumption, dollars, exitVerdicts, fromNote, HARNESSES, phaseOfView, type Retry, type RetryMode, runStartedAt, type Said, type Spend, type SpendOf, stepSpend, type Timeline, timeline, type TimelineTotal, type TimelineTry } from 'agent-orchestrator';
import { acceptanceOf, addSpend, approvalOf, budgetOf, composeBrief, gatesOf, hasGate, isGitRun, loopOver, overBudget, ownStatus, type PlaceKind, placeOf, retryable, type Run, type StepRecord, type StepStatus } from 'agent-orchestrator/run';
import { loopSpan, type Workflow } from 'agent-orchestrator/workflow';
import { folderFiles, type StepArtifact } from './artifacts.ts';
import { type RunGraph, runGraph } from './graph.ts';
import { holdsIn, judge, needsOf, type RunHolding, type RunStatus, type RunToDecide, type RunWaiting, type Spent, spentOf, standingsOf, type StepNeeds, waitsIn } from './judged.ts';
import { checksOf, type StepCheck } from './logs.ts';
import { bare, e, everyView, filedTimes, judgedSteps, seenBy, stepNames, type TaskView, type Views, workflowsOf, workFolderOf } from './store.ts';
import { attemptsIn, closeoutIn, type StepAttempts, type StepCloseout, type StepTry, triesOf, unreadableIn } from './tries.ts';
import { readOf, type RunRead, type StepUsed, totalOf, usedOf } from './usage.ts';

/**
 * A step's cap, and what its tries have cost of it. `usd` is the cap in force (`budgetOf`): the `budget:` the run froze, until a person raises
 * it (`wf retry --budget`, `wf round --budget`). `said` is the cap as its author writes one (`budgetWord`: `$3`), and `of` what the step's
 * tries have cost of it, as `wf ls` puts it in `over budget $4.25 of $3` — null until a cost was measured. `over` is whether they have cost
 * the cap or more (`overBudget`). Past the cap alone holds nothing: the step is held only where its `status` word says `over budget` or
 * `budget exhausted` — where another session of it is the way on. A job (`claude -p`) is ended at its cap; a background session
 * (`background: true`, `claude --bg`) keeps none and is not stopped (agent-runtime's issue 17), so such a step — the package refuses a
 * budget beside it, but a run frozen before may have both — can finish past it with nothing waiting on a raise.
 */
export type StepBudget = { usd: number; said: string; of: string | null; over: boolean };

/**
 * A raise of a step's cap the package takes, and how it is asked for: `retry` — `wf retry --budget`, the board's `POST …/retry` — for a step
 * over its budget or ended at it that a try takes on (`retryable`'s `raise`); `round` — `wf round --budget`, `POST …/round` — for a looping
 * step whose round waits on a step of its loop over its budget (`loopOver`). `above` is what the budget has to be more than, as the package
 * refuses one that is not — what the tries have cost, or the cap a session was ended at — and `said` that, in dollars (`dollars`).
 *
 * For a try, `modes` are the ways the package takes it (`retryable`) — `recheck` among them where a check did not pass, which costs nothing
 * and needs no raise — and `own` how the step ended on its own work, its budget aside (`ownStatus`): `blocked` for a step that signed off
 * blocked, whose try is answered with its raise (`wf retry --budget <amount> --message "<answer>"`, as `wf decide` offers it), `unsigned`,
 * `failed (check)`, `failed`, `stopped`, `denied` or `budget exhausted`. Over its budget, a step's word is `over budget`, so the word alone no longer
 * says which. For a round, no modes, and `own` null: a round is asked for as it is, with a budget.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: StepStatus | null };

/**
 * A person's approval of the try a gated step is on (`approvalOf`), off their file (`wf approve`): the try, when, and the words given with it
 * — handed to every step after the gate under `## Approved` — null where none were.
 */
export type StepApproval = { try: number; at: string; message: string | null };

/**
 * A gated step's gate: its own `gate: true`, or one the run was started with (`hasGate`). `awaiting` while it waits at it — signed off,
 * verified first where it has a check, and the try it is on not approved: `wf ls`'s `awaiting approval`, whatever else is asked of it. And
 * `approval`, once a person approved that try. Neither, for a gated step not signed off yet.
 */
export type StepGate = { awaiting: boolean; approval: StepApproval | null };

/**
 * A person's acceptance of a loop out of rounds, on the try its looping step is on (`acceptanceOf`), off their file (`wf accept`): the
 * try, when, and the words given. The step's closeout still says `again: true` — the acceptance does not rewrite what the reviewer said —
 * so whoever reads the step's last word needs this beside it, or a gate after the loop reads as if another round were still asked for.
 */
export type StepAcceptance = { try: number; at: string; message: string };

/**
 * A try a person asked for — with `wf retry`, or the board's answer box or Continue — that the next tick files: `assess`'s, off their
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
   * worktree. What tells such a gate from §6's on the board, where the two read the same off the record: unfiled and awaiting approval.
   */
  workspace: string | null;
  resume: string | null;
  /** Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`. */
  permissionMode: string | null;
  /** Codex's sandbox (`sandbox:`; on a run frozen before 2026-09-23, its `permissionMode`, read so): null on Claude Code. */
  sandbox: string | null;
  /** The only tools the session may have: null for the harness's own set, empty for none. */
  tools: string[] | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  /** The step a round runs again, on a looping step. */
  loop: string | null;
  /** How many rounds its loop may run, the first included: set on every looping step, as the parser sets it. */
  rounds: number | null;
};

/**
 * What the engine filed a step's current try with, off its record of the task: what the step runs with where its workflow
 * leaves a field to the engine. `maxAttempts` is always on the record, the engine's default being 1. Each other field is null
 * where the task was filed without it — a deadline, which is then no limit; a model, effort or tools, which are then the
 * harness's own; a permission mode, which its harness chooses, and `runsIn` says.
 */
export type StepFiled = {
  model: string | null;
  /**
   * The model a person's `wf retry --model` asked this try for, off the run's record (`EarlierTry.model`): what tells a model the
   * try was filed on from a default. Null when nobody asked.
   */
  askedModel: string | null;
  effort: string | null;
  /** The context window the try was filed with, in tokens (`contextTokens`): null for the model's whole window. */
  contextTokens: number | null;
  /** The fence the try was filed with, as the engine's task names it: Claude Code's permission mode, or Codex's sandbox (a step's `sandbox:`). */
  permissionMode: string | null;
  /**
   * The permission mode the session runs in, which the engine files as given and its harness decides (`runsInOf`): the mode filed
   * (`filed`); the harness's choice when none was — `auto` for Claude Code, `workspace-write` for Codex (`default`); or, for Codex,
   * `read-only` because `tools` has none that writes, whatever was named (`tools`). Null for a harness the api cannot ask.
   */
  runsIn: { mode: string; by: 'filed' | 'default' | 'tools' } | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
  maxAttempts: number;
};

/** One run in full, for a person reading it: the spec, and per step what it was told and how it went. */
export type RunDetail = {
  id: string;
  brief: string;
  /** A git run's repository, base commit, base branch and whether it cut worktrees; each null on a folder run, which has none of them. */
  repo: string | null;
  place: PlaceKind;
  /**
   * Where a folder run's work is: the directory its steps' folders are made under (`workRoot`), which is what a person is given in
   * place of a repository and a branch — there is nothing to check out, and nothing to merge. Null on a git run, whose work is on
   * its branch.
   */
  work: string | null;
  workflowDir: string;
  baseRef: string | null;
  branch: string | null;
  isolate: boolean | null;
  createdAt: string;
  /** As on `RunSummary`. */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That `wf prune` removed the run's worktrees (`Run.pruned`): when, and each it removed with what it held on disk. Its branches, record and
   * files are kept, so the rest of the page reads as before; what it no longer offers is anything that would work in a worktree. Null for a
   * run never pruned.
   */
  pruned: { at: string; worktrees: Array<{ path: string; bytes: number }> } | null;
  /** As on `RunSummary`. */
  after: string[];
  /** The inbox card the run was started from, as its record carries it (`Run.from`); absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, as `wf decide` says it under the run's line (`fromNote`): absent with `from`. */
  fromNote?: string;
  waiting: RunWaiting | null;
  /** As on `RunSummary`. */
  heldUntil: string[];
  /** As on `RunSummary` (`RunHolding`). */
  holding: RunHolding | null;
  status: RunStatus;
  /** As on `RunSummary`. */
  moving: boolean;
  /** As on `RunSummary`. */
  cost: Spent | null;
  /**
   * What the sessions of every try of every step read, by price, beside `cost`, which is theirs too (`RunRead`): each class only where every
   * session measured it, and the largest peak against the cap of the step that reached it. Null where none of it was measured.
   */
  read: RunRead | null;
  waitingOnYou: string[];
  /** As on `RunSummary`. */
  onYou: string[];
  /** As on `RunSummary` (`RunToDecide`). */
  toDecide: RunToDecide | null;
  /** The steps the run is gated at, in the order they run (`gatesOf`): those its workflow gates, and those it was started with. */
  gates: string[];
  /** Set when the workflow folder cannot be read, or no longer has the steps the run started with. */
  warning: string | null;
  /**
   * The steps as a graph, from the workflow the run is judged by (`judgedSteps`), for every client to draw the same:
   * `runGraph`. A step the page shows and that workflow does not have waits on nothing, so it is a root.
   */
  graph: RunGraph;
  /** The recorded steps in the order the run started with them, then — on a record from before runs froze their workflow — any the folder has gained. */
  steps: Array<{
    name: string;
    /** From the workflow the run froze at `wf start`; for a record from before runs froze one, the folder. */
    spec: StepSpec | null;
    /** What the engine filed its current try with; null for a step not filed, or a task the engine has no record of. */
    filed: StepFiled | null;
    body: string | null;
    /** For a filed step, the brief the engine was filed with; for one not yet filed, what it would be given now. */
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    /**
     * For a step of a folder run, every file its folder holds now, each as `folderFiles` reads it: the whole of what it made, not
     * only what its closeout named. Empty for a step of a git run, whose work is a branch to read, and for one not filed yet.
     */
    files: StepArtifact[];
    /** Why that list is empty when the folder is there and could not be read (`folderFiles`); null where the list is what the folder holds. */
    filesError: string | null;
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    /** As on `RunSummary` (`StepNeeds`): read off that type, field by field, so a field it gains is declared here too and not only sent. */
    needs: StepNeeds['needs'];
    blockedByHarness: StepNeeds['blockedByHarness'];
    waitingFor: StepNeeds['waitingFor'];
    approve: StepNeeds['approve'];
    denied: StepNeeds['denied'];
    /** Its gate, awaiting approval or approved (`StepGate`); null for a step with none. */
    gate: StepGate | null;
    /** For a looping step a person ended out of rounds (`wf accept`), their acceptance of the try it is on; null for any other step. */
    accepted: StepAcceptance | null;
    /**
     * For a step the harness blocked, what its session said last, as the engine's `transcript` reads it: its last `text` or `system`
     * event, trimmed. Null for any other step, and for one whose session said none or whose conversation cannot be read.
     */
    lastLine: string | null;
    /**
     * What a person said to the session of the step's current try while it ran — with `wf say`, or the session page's prompt box — in the order
     * said: the engine's `said` entries on its task, off the views the request already read. Empty for a step not filed, and one nobody told.
     */
    said: Said[];
    /** The try a person asked for, which the next tick files (`StepAsked`); null when none is asked. */
    asked: StepAsked | null;
    closeout: StepCloseout | null;
    /** Null for a step with no `check:` in the workflow the run froze. */
    check: StepCheck | null;
    attempts: StepAttempts;
    /** What its current try consumed, in `wf decide`'s words; null for a step not filed, which consumed nothing. */
    used: StepUsed | null;
    /** What every try of it has cost together, each session once, as `wf ls` puts it beside the step's word (`stepSpend`); null until a cost was measured. */
    spent: Spent | null;
    /** Its cap in force, and what its tries have cost of it (`StepBudget`); null for a step with no `budget:`. */
    budget: StepBudget | null;
    /** The raise of its cap the package takes, and how (`StepRaise`); null for a step no raise takes on, and on a run called off, pruned or held. */
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
  /** The run's time together, in the package's words (`timeline`): each round of its loop, and the whole run — with what the sessions in each cost. */
  timeline: { rounds: StepTimelineTotal[]; run: StepTimelineTotal };
};

/**
 * A total of the run's time, as the package's `timeline` has it (`TimelineTotal`), and what the sessions it counts cost (`Spent`): the run's,
 * every step's tries (`runSpend`), or a round's — each session of a try its loop filed again in that round (`roundSpend`).
 */
export type StepTimelineTotal = TimelineTotal & { cost: Spent | null };

/**
 * One try of a step on the clock, as the package's `timeline` has it (`TimelineTry`): its session's task and its check's, each filed, spawned
 * and ended, with how long it queued for a slot and ran (the package's `TaskSpan`) — and what its session used, in `wf decide`'s words, where it ran one.
 */
export type StepTimelineTry = Omit<TimelineTry, 'used'> & { used: StepUsed | null };

/** How the folder has moved away from the steps the run started with, or null if it has not. */
function driftOf(run: Run, workflows: readonly Workflow[]): string | null {
  const inFolder = new Set(workflows.map((s) => s.name));
  const removed = Object.keys(run.steps).filter((name) => !inFolder.has(name));
  const added = workflows.map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  const shown = run.workflow ? 'shown as the run froze it' : 'shown from the run record without spec or prose';
  const said = [
    ...(removed.length ? [`it no longer has ${removed.join(', ')}, ${shown}`] : []),
    ...(added.length ? [`it has ${added.join(', ')}, which the run did not start with${run.workflow ? ' and will never file, so it is not shown' : ''}`] : []),
  ];
  return said.length ? `The workflow folder ${run.workflowDir} has changed since this run started: ${said.join('; ')}.` : null;
}

/**
 * What a step's tries have cost, against its cap, and the raise of that cap the package takes (`Spent`, `StepBudget`, `StepRaise`) — off the
 * views the request already read, with no observation of its own. `steps` are the workflow the run is judged by: a step it does not have has
 * no `budget:`.
 */
function costOf(run: Run, name: string, steps: readonly Workflow[], views: Views, spendOf: SpendOf): { spent: Spent | null; budget: StepBudget | null; raise: StepRaise | null } {
  const step = steps.find((s) => s.name === name);
  const spent = spentOf(stepSpend(run, name, spendOf));
  const cap = step ? budgetOf(step, run.steps[name]) : undefined;
  const budget = step && cap !== undefined
    ? { usd: cap, said: budgetWord(cap), of: spent && `${spent.said} of ${budgetWord(cap)}`, over: Boolean(overBudget(step, run, spendOf)) }
    : null;
  // None on a held run, as on one pruned: the raise is asked with a try or a round, which the verb refuses while the hold stands (`heldRefusal`).
  return { spent, budget, raise: step && !run.cancelledAt && !run.pruned && !run.hold ? raiseOf(run, step, steps, views, spendOf) : null };
}

/**
 * The raise of a step's cap the package takes (`StepRaise`), or null. A try's, where `retryable` carries one — a settled step over its budget
 * or ended at it, that a try takes on — and it may be tried; else a round's, for a looping step over its budget or out of rounds whose loop has
 * a step over its budget (`loopOver`): `wf round --budget` has to pass the most any of them has cost, as `roundAsk` refuses less.
 */
function raiseOf(run: Run, step: Workflow, steps: readonly Workflow[], views: Views, spendOf: SpendOf): StepRaise | null {
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const { status, modes, raise } = retryable(step, run, phase, reader, asked, steps, () => false, spendOf, exitVerdicts(views, run));
  if (raise && modes.length) {
    return { by: 'retry', above: raise.above, said: dollars(raise.above), modes, own: ownStatus(step, run, phase, reader, asked, steps, spendOf) };
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
  return addSpend(names.flatMap((name) => (clock.steps[name] ?? []).flatMap((t) => (t.round === total.round && t.session ? [spendOf(t.session.taskId)] : []))));
}

/**
 * What a step was told.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what `composeBrief` would give it now, from `workflows` — the
 * workflow the run froze, as the tick composes it. For a filed task the engine has no record of, nobody can say.
 */
function toldOf(run: Run, name: string, workflows: readonly Workflow[] | null, views: Views): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? composeBrief(step, run, workflows) : null;
}

/**
 * A step's gate (`StepGate`), or null for a step with none: whether it waits at it, in `wf ls`'s word, and the approval of the try it is on.
 * Off the record as `listRuns` composes it, with each approval its file holds (`approvalOf`): no read of its own.
 */
function gateOf(run: Run, step: Workflow, status: string): StepGate | null {
  if (!hasGate(step, run)) return null;
  const given = approvalOf(run, step.name);
  return {
    awaiting: status === 'awaiting approval',
    approval: given ? { try: given.try, at: given.at, message: given.message ?? null } : null,
  };
}

/** A looping step's acceptance (`StepAcceptance`), off the record as `listRuns` composes it, as `gateOf` reads an approval: no read of its own. */
function acceptedOf(run: Run, step: string): StepAcceptance | null {
  const given = acceptanceOf(run, step);
  return given ? { try: given.try, at: given.at, message: given.message } : null;
}

/** Where the last read of a blocked session's conversation stopped, and what it had said last by then: by task and attempt. */
const lastSaid = new Map<string, { cursor: string; line: string | null }>();

/**
 * What a session said last — its last `text` or `system` event, trimmed — through the engine's `transcript`, or null when it has said
 * none or its conversation cannot be read.
 *
 * Each read costs an observation of the task's harness: the attempt of a session the harness blocked has not ended, so its session's id
 * is on no record, and the engine asks the registry for it (one `claude agents` call). Read on a run's detail, as a refused check's output
 * is, and never on the list.
 *
 * Read from where the last read of the same attempt stopped, so a page polled every five seconds reads what the session wrote since,
 * not its whole conversation again; a cursor the engine refuses, of a transcript replaced since, is read again from the start. A read's
 * cache, and nothing is decided by it: a fresh process reads from the start.
 */
async function lastLineOf(view: TaskView): Promise<string | null> {
  const key = `${view.id}#${view.state.attempts.length}`;
  const read = (after?: string) => e.transcript(view.id, after).catch(() => undefined);
  let from = lastSaid.get(key);
  let got = from ? await read(from.cursor) : undefined;
  if (!got) {
    from = undefined;
    got = await read();
  }
  if (!got) return null;
  // What the session said, not what it was told: a brief, a `wf say` and every tool result come back as `user` events
  // (`TranscriptEvent`), and reading a person's own words back to them says nothing about why the harness stopped.
  const last = got.events.filter((event) => event.role !== 'user' && (event.kind === 'text' || event.kind === 'system') && event.text?.trim()).at(-1);
  const line = last?.text?.trim() ?? from?.line ?? null;
  lastSaid.set(key, { cursor: got.cursor, line });
  return line;
}

/**
 * Every file that folder holds (`folderFiles`), for a person who never opens a terminal; empty where there is no folder. A folder the
 * api cannot read answers with why instead of a list, since the board words an empty list as the step having made nothing.
 */
function filesOf(run: Run, step: string): { files: StepArtifact[]; filesError: string | null } {
  const dir = workFolderOf(run, step);
  if (!dir) return { files: [], filesError: null };
  const { files, error } = folderFiles(run, step, dir);
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
  resume: step.resume ?? null,
  permissionMode: step.permissionMode ?? null,
  sandbox: step.sandbox ?? null,
  tools: step.tools ?? null,
  deadlineSeconds: step.deadlineSeconds ?? null,
  maxAttempts: step.maxAttempts ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
});

/**
 * Where what a page shows of a step's workflow is read from: the workflow the run froze at `wf start`, which the tick
 * files from and `judgedSteps` judges by; the folder only for a record from before runs froze one. Null when neither reads.
 */
const shownWorkflow = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] | null => run.workflow ?? folder;

export async function detail(run: Run): Promise<RunDetail> {
  const folder = workflowsOf(run);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  // Every task in the store over one observation, as the list reads them, rather than a `view` — an observation, ~0.3 s here — for
  // each task of each try, one after another, on a page polled every five seconds: a loop's later rounds made that seconds a poll.
  // Folding every journal cost about what one observation does (163 journals, 2026-09-13). The record is read first, as the list reads it.
  // One more observation for each refused check's output (`checksOf`) and each blocked session's last line (`lastLineOf`), which only a
  // run's own detail reads.
  const views = await everyView();
  const seen = seenBy(views);
  const judged = judge(run, names, workflows, views, await waitsIn(run, seen), await holdsIn(run, seen), (status, steps) => standingsOf(run, steps, status));
  const steps = judgedSteps(run, workflows);
  const checks = await checksOf(run, steps, views);
  const source = shownWorkflow(run, workflows);
  // Off the views already read: no observation of its own.
  const used = consumption(views, run);
  // Off the same views — every task in the store, so every try's — and the feed's filing times: no observation either.
  // And the steps the run is judged by, whose loops its rounds are of.
  const filed = await filedTimes();
  const clock = timeline(run, views, filed, steps);
  return {
    id: run.id,
    brief: run.brief,
    repo: run.repo ?? null,
    place: placeOf(run),
    work: isGitRun(run) ? null : run.workspace,
    workflowDir: run.workflowDir,
    baseRef: run.baseRef ?? null,
    branch: run.branch ?? null,
    isolate: run.isolate ?? null,
    createdAt: run.createdAt,
    startedAt: runStartedAt(run, filed),
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { at: run.pruned.at, worktrees: run.pruned.worktrees.map(({ path, bytes }) => ({ path, bytes })) } : null,
    after: run.after ?? [],
    ...(run.from ? { from: run.from, fromNote: fromNote(run)! } : {}),
    waiting: judged.waiting,
    heldUntil: judged.holding ? run.hold!.until : [],
    holding: judged.holding,
    status: judged.status,
    moving: judged.moving,
    cost: judged.cost,
    read: readOf(totalOf(steps, names.flatMap((name) => (clock.steps[name] ?? []).flatMap((t) => (t.session ? [[name, t.used] as const] : []))))),
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
    gates: gatesOf(steps, run),
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    // The steps `judge` words: the judged workflow, then a root for each one the page shows beside it.
    graph: runGraph(steps, names),
    steps: await Promise.all(names.map(async (name) => {
      const step = source?.find((s) => s.name === name);
      const taskId = run.steps[name]?.taskId ?? null;
      // The `context:` its sessions ran under, as the run judges the step: where its peak reached it.
      const cap = steps.find((s) => s.name === name)?.context;
      const needs = needsOf(run, name, views, judged);
      const current = {
        status: judged.words.get(name)!,
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
        told: toldOf(run, name, source, views),
        taskId,
        workspace: run.steps[name]?.workspace ?? null,
        ...filesOf(run, name),
        branch: run.steps[name]?.branch ?? null,
        note: judged.notes.get(name) ?? null,
        ...needs,
        lastLine: needs.blockedByHarness ? await lastLineOf(views.get(taskId!)!) : null,
        // Judged by the workflow the run is: a step it does not have is gated only where the run was started with its gate.
        gate: gateOf(run, steps.find((s) => s.name === name) ?? bare(name), current.status),
        accepted: acceptedOf(run, name),
        said: taskId ? [...(views.get(taskId)?.state.said ?? [])] : [],
        asked: askedOf(judged.asked.get(name)),
        ...current,
        used: taskId ? usedOf(used[name], cap) : null,
        // Off the same views, which hold every try's task: no observation.
        ...costOf(run, name, steps, views, judged.spendOf),
        tries: triesOf(run, name, steps, views, current, judged.answers),
        timeline: (clock.steps[name] ?? []).map((t) => ({ ...t, used: t.session ? usedOf(t.used, cap) : null })),
      };
    })),
    timeline: {
      rounds: clock.rounds.map((r) => ({ ...r, cost: spentOf(roundSpend(clock, steps, r, judged.spendOf)) })),
      run: { ...clock.run, cost: judged.cost },
    },
  };
}

/** What the engine filed a step's current try with (`StepFiled`), off its record; null for no task, or one the engine has no record of. */
function filedOf(record: StepRecord | undefined, views: Views): StepFiled | null {
  const view = record?.taskId ? views.get(record.taskId) : undefined;
  if (!view || phaseOfView(view) === 'unknown') return null;
  const { deadlineSeconds, maxAttempts } = view.state;
  // The harness's arguments are the adapter's, under `config` (agent-runtime's `HarnessArgs`); the engine carries them unread.
  const { model, effort, contextTokens, permissionMode, tools } = view.state.config ?? {};
  return {
    model: model ?? null,
    askedModel: askedModelOf(record),
    effort: effort ?? null,
    contextTokens: contextTokens ?? null,
    permissionMode: permissionMode ?? null,
    runsIn: runsInOf(view.state),
    tools: tools ?? null,
    deadlineSeconds: deadlineSeconds ?? null,
    maxAttempts,
  };
}

/**
 * The model a person's `wf retry --model` asked a step's current try for: on the try its task replaced, where `nextTry` keeps the
 * model with the mode — found past any recheck, which replaced only a check, and kept the task.
 */
function askedModelOf(record: StepRecord | undefined): string | null {
  const tries = record?.tries ?? [];
  let i = tries.length - 1;
  while (i >= 0 && tries[i]!.then === 'recheck') i--;
  return tries[i]?.model ?? null;
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
  const name = state.harness ?? Object.keys(HARNESSES)[0]!;
  if (!Object.hasOwn(HARNESSES, name)) return null;
  const harness = HARNESSES[name as keyof typeof HARNESSES];
  const { permissionMode, tools: filedTools } = state.config ?? {};
  const by = permissionMode === undefined ? 'default' : 'filed';
  if (harness === 'claude') return { mode: permissionMode ?? 'auto', by };
  if (typeof harness !== 'object' || !('command' in harness)) return null;
  const modeOf = (tools: string[] | undefined): string | undefined => {
    try {
      const { args } = harness.command({ name: `${state.taskId}/mode`, brief: '', cwd: state.cwd || '/', config: { permissionMode, tools } });
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
