import fs from 'node:fs';
import { Hono } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { approve, type BranchStanding, branchStandings, branchWord, branchesToRead, budgetRefusal, budgetWord, CHECK_AFFECTING, checkStderr, closeoutAsked, closeoutOf, closeoutReader, consumption, dollars, diffStat, engine, exitVerdicts, fromNote, harnessBlocked, HARNESSES, isShipped, lastCeilings, lessonLine, listRuns, merges, messageRefusal, parentOf, type ParentRun, phaseOfView, readAnswers, readAsks, readFilings, type Retry, retry, type RetryAsk, type RetryHow, type RetryMode, resultSteps, round, runCostLines, runSpend, type Said, saidCount, say, sensitiveDiff, slotWord, type Spend, type SpendOf, spendReader, spentWord, stepsOf, stepSpend, type Timeline, timeline, type TimelineTotal, type TimelineTry, toDecideWords, touchedBy, usedLines, verdictWord, type Wait, waitAdvice, waitWord } from 'agent-workflows';
import { addSpend, admissionOrder, answerOf, approvalOf, approvalWordsRefusal, assess, type Assessment, budgetOf, composeBrief, type Decision, decision, declaredOutput, type EarlierTry, gated, gateLines, gatesOf, hasGate, heldRuns, inFlight, listing, loopOver, onYouWords, overBudget, overBudgetLine, ownStatus, parseCloseout, retryable, retryLines, roundIn, roundLines, type Run, runCapOf, slotNeed, type StepRecord, type StepStatus, type ToDecide, tryNote, waitsOf } from 'agent-workflows/run';
import { LOOP_REPLIES, loadWorkflows, loopSpan, outputFields, type Workflow } from 'agent-workflows/workflow';
import { artifactOf, readArtifactFile, refusedName, type StepArtifact } from './artifacts.ts';
import { repoOf } from './capabilities.ts';
import { graphOf, type RunGraph } from './graph.ts';
import { capabilitiesWithSteps } from './reach.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { inbox } from './inbox.ts';
import { builder } from './builder.ts';
import { workflows } from './workflows.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  /** The workflow folder the run was started from, as `wf start` resolved it: its last segment names the workflow. */
  workflowDir: string;
  createdAt: string;
  cancelledAt: string | null;
  /** The runs this one waits on (`wf start --after`), as the record froze them at start: none for a run started without. */
  after: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   *
   * A run waiting on runs moves: the tick files its roots once they ship. Not one waiting on a run that never ships without a
   * person — no such run, a cancelled one, a result branch gone (`RunWaiting.onYou`): nothing the tick reads will change on its own.
   */
  moving: boolean;
  /** What the run has cost so far, every step's tries together, as `wf ls` adds it up on the run's line (`runSpend`); null until a cost was measured. */
  cost: Spent | null;
  /**
   * `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. `note` is what `wf ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (wf round) — …` — and null where it prints nothing.
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null } & StepNeeds>;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget — on a run nobody has called off.
   */
  waitingOnYou: string[];
  /**
   * `waitingOnYou` as `wf ls` names it after `→ waiting on you:` (`onYouWords`), one entry a step, in its order: the step's name — and for a
   * step at its gate, what is asked of you, `approve plan`.
   */
  onYou: string[];
  /** What a person has to decide about the run's result, when the run is at it and nobody has (`RunToDecide`); null while there is nothing. */
  toDecide: RunToDecide | null;
};

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or at
 * a gate — as the package decides it (`toDecide`) and words it (`toDecideWords`):
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval. `step` is that step, and `says` what it would do,
 *            the first line of the folder's own prose — null for a gated step that has signed off, whose closeout is what to read
 *   git      nothing waits at such a gate, every step finished, no step of the workflow merges, and `branches` are ahead of the base branch:
 *            merging or dropping them is a person's, by hand
 *
 * `said` is the whole of what `wf ls` prints after `→ to decide:`, and `command` the command at the end of it — `wf approve <run> <step>`,
 * or `wf decide <run>` for the branches, which the board runs no more than `wf ls` does.
 */
export type RunToDecide = ToDecide & { said: string; command: string };

/**
 * What a person has to decide, as the board is given it: the package's own reading, with its words and the command that ends them. Null
 * where the package leaves it — a run still going, one called off, one whose ending has run, and a branch already on the base.
 */
const toDecideOf = (run: Run, t: ToDecide | undefined): RunToDecide | null =>
  t ? { ...t, said: toDecideWords(run, t), command: t.kind === 'approve' ? `wf approve ${run.id} ${t.step}` : `wf decide ${run.id}` } : null;

/**
 * What sessions cost, as the package adds it up off the engine's `usage.costUsd` (`Spend`: `stepSpend`, `runSpend`): the dollars of the
 * attempts that ended with a cost on them, how many did (`measured`), and how many ended with none (`unmeasured`) — a `claude --bg` session's
 * cost is known only once its attempt ends (agent-engine's open issue 17), and one killed first, or on a model its harness could not price,
 * has none. An attempt still running is in neither. `said` is the package's word for it (`spentWord`): `$4.20`, and `≥$4.20` where an ended
 * attempt has no cost on it, so a part never reads as the whole. Null wherever no attempt was measured: a cost nobody measured is not $0.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; said: string };

/** A spend as the board is given it (`Spent`), or null when nothing of it was measured. */
const spentOf = (spend: Spend): Spent | null =>
  spend.measured ? { usd: spend.usd, measured: spend.measured, unmeasured: spend.unmeasured, said: spentWord(spend) } : null;

/**
 * A step's cap, and what its tries have cost of it. `usd` is the cap in force (`budgetOf`): the `budget:` the run froze, until a person raises
 * it (`wf retry --budget`, `wf round --budget`). `said` is the cap as its author writes one (`budgetWord`: `$3`), and `of` what the step's
 * tries have cost of it, as `wf ls` puts it in `over budget $4.25 of $3` — null until a cost was measured. `over` is whether they have cost
 * the cap or more (`overBudget`). Past the cap alone holds nothing: the step is held only where its `status` word says `over budget` or
 * `budget exhausted` — where another session of it is the way on. A `claude --bg` session is not stopped at its cap (agent-engine's issue
 * 17), so a step can finish past it with nothing waiting on a raise.
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
 * `failed (check)`, `failed`, `stopped` or `budget exhausted`. Over its budget, a step's word is `over budget`, so the word alone no longer
 * says which. For a round, no modes, and `own` null: a round is asked for as it is, with a budget.
 */
export type StepRaise = { by: 'retry' | 'round'; above: number; said: string; modes: RetryMode[]; own: StepStatus | null };

/**
 * What a run started `--after` still waits on, as `wf ls` and `wf decide` say it — never worded here.
 *
 * `runs` are the package's `waitsOf`: each run in `after` that has not shipped, as its own `wf decide` says it, and, for one that never
 * will without a person, why — the store has no such run (`missing`), it was cancelled, or a result branch it recorded is gone. `word` is
 * what `wf ls` prints on each root (`waitWord`), and `advice` the line `wf decide` prints under it (`waitAdvice`). `onYou` is whether a
 * person has to act — some run of `runs` never ships on its own — which is when `wf ls` prints `→ waiting on you:` before the advice.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/**
 * What a person has to know to act on a step, in the package's words and the engine's, never worked out here.
 *
 * `needs` is the closeout's, for a step whose current try signed off blocked: its question. Null for any other step.
 *
 * `blockedByHarness` is whether the harness marked the step's session blocked while it gave no closeout — the engine's
 * `needs-human` — which is no question of the step's: measured on "Could not refresh your login because another Claude Code
 * process is refreshing it". What the session said last is on the run's detail alone (`lastLine`): reading it observes the
 * harness again, and the list is read on every poll of the Factory for one observation.
 *
 * `approve` is what `wf ls` asks of you for a step waiting at its gate, on a run nobody called off and with no send-back asked for: `approve
 * plan` (`onYouWords`). Null for any other step — one not gated, not signed off yet, approved, or sent back.
 */
export type StepNeeds = { needs: string | null; blockedByHarness: boolean; approve: string | null };

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
  after: string[];
  resume: string | null;
  permissionMode: string | null;
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

/** A loop's target's answer to one finding it was handed, as its closeout gave it. */
export type StepReply = { finding: string; answer: string; why: string };

/**
 * How a step signed off, when it did.
 *
 * `output` is what it gave of the fields its `output:` declares, and `missing` those it did not (`declaredOutput`). `replies`
 * is a loop's target's answer to each finding it was handed, when its closeout gave them. `artifacts` are the files it named,
 * each as `artifactOf` reads it: a file the api serves from the step's files directory, or the path alone.
 */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: StepArtifact[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
};

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `wf start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `wf ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `wf decide` shows them.
 */
export type StepCheck = {
  command: string;
  /** The check's task, once the run has filed it. */
  taskId: string | null;
  /**
   * What the check said of the work: `passed`, `exit 1`, `unfinished` for one that did not finish, `checking` while it runs,
   * and `unknown` for a task the engine has no record of. Null until the run files it.
   */
  verdict: string | null;
  refused: {
    exit: string;
    /**
     * Null on an earlier try's check: a session's output is read with a `logs` call, which observes every harness again, so
     * the page reads it for the current try's check alone. Its stderr is a file, and is read for every try.
     */
    stdout: StepLog | null;
    stderr: StepLog;
    /** Why its output could not be read, when it could not. */
    unreadable: string | null;
  } | null;
};

/**
 * One try of a step, as the run's record keeps it: the tries behind the current one (`StepRecord.tries`), then the current.
 *
 * `try` counts from 1, and `round` is the round of its loop the try was filed in (`roundIn`). `then` is what replaced it —
 * `round`, `retries`, or the mode a person asked for — and null on the current try, which `current` marks. `note` is how the
 * try was reached, in `wf ls`'s words (`tryNote`), and null on the first. `status` on the current try is the step's word, as on
 * the step; on an earlier one, the engine's own word for its task — `succeeded`, `failed` — since `wf ls` words only the try
 * that decides the step. `attempts`, `check` and `closeout` are the try's own, in the step's shapes.
 */
export type StepTry = {
  try: number;
  round: number;
  then: EarlierTry['then'] | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
  status: string;
  attempts: StepAttempts;
  check: StepCheck | null;
  closeout: StepCloseout | null;
  /**
   * What a person said to this try when they asked for it (`answerOf`, off their ask file): the answer `wf decide` prints under the
   * `needs` of the try before as `your answer`. Null for a try nobody answered — and for every first try, which nobody asked for.
   */
  answer: string | null;
};

/** One run in full, for a person reading it: the spec, and per step what it was told and how it went. */
export type RunDetail = {
  id: string;
  brief: string;
  repo: string;
  workflowDir: string;
  baseRef: string;
  branch: string;
  isolate: boolean;
  createdAt: string;
  cancelledAt: string | null;
  /** As on `RunSummary`. */
  after: string[];
  /** The inbox card the run was started from, as its record carries it (`Run.from`); absent for a run started without one. */
  from?: { inbox: string };
  /** Where it came from, as `wf decide` says it under the run's line (`fromNote`): absent with `from`. */
  fromNote?: string;
  waiting: RunWaiting | null;
  status: RunStatus;
  /** As on `RunSummary`. */
  moving: boolean;
  /** As on `RunSummary`. */
  cost: Spent | null;
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
   * `graphOf`. A step the page shows and that workflow does not have waits on nothing, so it is a root.
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
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    /** As on `RunSummary` (`StepNeeds`). */
    needs: string | null;
    blockedByHarness: boolean;
    approve: string | null;
    /** Its gate, awaiting approval or approved (`StepGate`); null for a step with none. */
    gate: StepGate | null;
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
    /** The raise of its cap the package takes, and how (`StepRaise`); null for a step no raise takes on, and on a run called off. */
    raise: StepRaise | null;
    /**
     * Every try, earliest first, the current one last and marked: `attempts` counts the current try's task alone, and each
     * round of a loop, and each try within one, is a task of its own.
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

/** What a session consumed as the engine's `Usage` carries it: a count nobody measured is absent, never 0. */
export type Usage = NonNullable<ReturnType<typeof consumption>[string]>;

/**
 * What a step consumed, summed over the attempts of its current try (`consumption`), and in the words `wf decide`
 * prints beside its check (`usedLines`) — `used` and `cost`, each `not measured` where nobody counted, never `0`.
 * `costUsd`, `apiMs` and `toolMs` are the engine's, off the same usage — what the harness priced the session at, and the
 * time it counted waiting on the model and running tools — each null where nobody measured it.
 */
export type StepUsed = { usage: Usage | null; used: string; cost: string; costUsd: number | null; apiMs: number | null; toolMs: number | null };

/** What a branch touched, as `wf decide` reads it (`touchedBy`): its radius, or why git could not say. */
export type Touched = { branch: string; radius: ReturnType<typeof touchedBy> };

/**
 * Where one result branch stands against the base branch, as git says it now (`BranchStanding`) — on it, ahead of it by N commits, or gone
 * — with the fact in the package's words (`branchWord`) and how much it changed, as `wf decide` prints beside the branch (`diffStat`, git's
 * `--shortstat`): `3 files changed, 12 insertions(+), 1 deletion(-)`, trimmed. `stat` is null where git said nothing of it: a branch it no
 * longer has, or one with nothing on it past the run's base.
 */
export type Standing = BranchStanding & { said: string; stat: string | null };

/** One file of a branch's check-affecting diff: its unified diff, at most `DIFF_LINES` lines, and how many more it had. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** The check-affecting files' diff on one branch, a file each; none when no changed file is on the list; `error` when git could not say. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/**
 * The lesson line as `wf decide` words it (`lessonLine`), without its label, and which of its three it is: a file where
 * the next agent reads was changed, nothing was, or a branch could not be read, so nobody knows.
 */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/**
 * A command `wf decide` prints, and runs none of: ship it, drop it, read it for a run worked on its base branch, each
 * once-more (`wf retry`, `wf round`) with the line it prints it in, and for a step waiting at its gate on you, the two its gate line
 * prints under the step — approve (`wf approve`) and send back (`wf retry --message`). `said` is null where the label is all it says.
 */
export type DecideCommand = { label: 'ship it' | 'drop it' | 'read it' | 'once more' | 'approve' | 'send back'; command: string; said: string | null };

/**
 * What `wf decide` shows a person about a run: what each branch it reads touched, the lesson line, the check-affecting
 * diffs in full, what each step consumed and the run's total, and the commands.
 */
export type Decidable = {
  /**
   * Where each result branch stands against the base branch, and how much it changed (`Standing`): the facts under the run's result, as
   * `wf decide` prints them before anything to do about it. Empty for a run that worked on its base branch itself, which has no result
   * branch of its own, and for one whose steps recorded none.
   */
  standings: Standing[];
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  /** Every filed step's `used` summed: a count only where every one of them measured it. */
  total: StepUsed;
  /**
   * What the run has cost, as `wf decide` prints it after its steps (`runCostLines`), without its label: `run $12.40`, with how many ended
   * attempts had no cost on them — or `run not measured`. Null before any attempt has ended.
   */
  cost: string | null;
  /** `wf decide`'s OVER BUDGET line, saying why each step held on its budget is held (`overBudgetLine`); null when none is. */
  overBudget: string | null;
  commands: DecideCommand[];
};

/**
 * A run's decision. `waiting` for a run whose roots wait on runs that have not shipped: `wf decide` says that, and offers
 * nothing else. `running` while it runs and nobody is waited on — `wf decide`'s "nothing to decide yet", with no
 * git asked. `nothing`, in `wf decide`'s words, for a run called off or whose branches are already on its base. Else
 * what there is to decide.
 */
export type RunDecision = { waiting: RunWaiting } | { running: true } | { nothing: string } | Decidable;

/** A step's attempts as the engine's view has them: how many, and when and how the latest went. */
export type StepAttempts = {
  count: number;
  latest: {
    startedAt: string;
    /** The harness's last word on the attempt — `done`, `failed`, `stopped`; null while it runs. */
    ended: string | null;
    /** When it ended: the `at` of the engine's `ended` event, kept as `Attempt.endedAt`; null while it runs. */
    endedAt: string | null;
    /** `harness` when the harness said it ended, `lost` when the engine stopped seeing it; null while it runs. */
    reason: string | null;
  } | null;
};

/** The tail of a step's session output, oldest line first. */
export type StepLog = {
  lines: string[];
  /**
   * Whether the api cut lines off the top. A harness can hand over less than all of its output
   * already — the detached runner keeps only its last few thousand characters — and that cut is
   * not visible here, so its first line may start mid-line.
   */
  truncated: boolean;
};

/**
 * One engine for the process, and the api only reads through it — `list`, `view` and `logs`, never
 * `tick` or `file`.
 * Filing and advancing work is `wf`'s job, so a board left open in a tab cannot start anything.
 */
const e = engine();

type TaskView = Awaited<ReturnType<typeof e.view>>;
type Views = ReadonlyMap<string, TaskView>;

/**
 * The engine's view of every task a run's current tries have filed — each step's, and each check's — and each earlier try's session, for its
 * decision: what a step's tries have cost together is every try's session (`stepSpend`), as the tick reads them (`taskPhases` in runner.ts).
 * Each `view` observes every harness — a `claude agents` call, a scan of detached runs — so this is an
 * observation per filed task, read once for each state of a run. A run's page, which is polled, and the list of every
 * run read theirs with `everyView`.
 */
async function viewsOf(run: Run): Promise<Views> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
    for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, await e.view(t.taskId));
  }
  return views;
}

/**
 * The engine's view of every task in its store, over one observation, by task id.
 *
 * `list` observes the harnesses once and folds every task's journal against that; `view` observes
 * afresh on each call. A task the engine has no record of is simply absent, which reads exactly as
 * `view`'s empty state does: no brief, so `unknown`.
 */
async function everyView(): Promise<Views> {
  return new Map((await e.list()).map((view) => [view.id, view]));
}

/**
 * The engine as a request that has read `views` sees it: `view` answers from them, and everything else is the engine's own. What the
 * package's `parentOf` is handed on the list and on a run's detail, so reading the runs a run waits on observes no harness again — the
 * list is what the Factory polls. A task the read did not see, filed since, is viewed.
 */
const seenBy = (views: Views): typeof e => ({ ...e, view: async (taskId) => views.get(taskId) ?? e.view(taskId) });

/**
 * The cap on runs in flight, as the board says it over the Factory: `2 of 4 run slots taken`, or `no cap`.
 *
 * `last` is what the daemon's last pass ran with (`lastCeilings`, `$WF_ROOT/tick.json`): sessions at work per pool (`WF_MAX_CONCURRENT`) and
 * runs in flight (`WF_MAX_RUNS`, 0 for no cap) — null before any pass has written them. `cap` is the cap a run is judged by, as `wf ls` and
 * `wf decide` judge it (`runSlots`): the last pass's, and before any, the api's own `WF_MAX_RUNS`; 0 for none.
 *
 * `inFlight` names the runs that count against it, oldest first, as a pass counts them (`slotNeed`): a task of the run filed and not settled,
 * or a started run nobody called off with something due. Not the Factory's own count of runs in flight, which also has a run waiting on runs,
 * or held for a slot, whose roots the tick will file. Null with no cap, when nothing is read, as `runSlots` reads nothing. `held` are the runs
 * the cap holds, in the order a pass admits them, each with the count it is held at and `wf ls`'s words on its roots (`heldRuns`, `slotWord`).
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
};

/**
 * The cap on runs in flight, and the runs it counts and holds (`Ceilings`), judged as `runSlots` judges them — every run read as a pass reads it,
 * a record whose workflow no longer reads left out — off one observation of the harnesses (`everyView`), which the package's `runSlots` would
 * make once per task. `runSlots` answers the held runs alone, and the count in flight is what the board says; so its judgement is made here
 * with the package's own pure parts (`slotNeed`, `heldRuns`), and the api's test holds `held` to what `runSlots` answers on the same store.
 */
async function ceilingsOf(): Promise<Ceilings> {
  const last = lastCeilings() ?? null;
  const cap = last?.runs ?? runCapOf(process.env.WF_MAX_RUNS);
  if (cap <= 0) return { last, cap: 0, inFlight: null, held: [] };
  const runs = listRuns();
  const views = await everyView();
  const reader = seenBy(views);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    const { asks, rounds } = readAsks(run.id);
    const a = assess(steps, run, phase, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, rounds, harnessBlocked(views), spendReader(views));
    const parents = new Map<string, ParentRun>();
    if (gated(run)) for (const id of new Set(run.after)) parents.set(id, await parentOf(reader, id));
    needs.push({ id: run.id, createdAt: run.createdAt, ...slotNeed(run, phase, a, (id) => parents.get(id)?.shipped ?? false) });
  }
  return {
    last,
    cap,
    inFlight: admissionOrder(needs.filter((n) => n.inFlight)).map((n) => n.id),
    held: [...heldRuns(needs, cap)].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) })),
  };
}

/**
 * The runs a run's roots wait on (`waitsOf`), each read once with the package's `parentOf` — as `wf ls` and `wf decide` read them — and
 * none, without a look, for a run the gate no longer applies to (`gated`): one started without `--after`, called off, or already started.
 */
async function waitsIn(run: Run, reader: typeof e): Promise<Wait[]> {
  if (!gated(run)) return [];
  const read = new Map<string, ParentRun>();
  for (const id of new Set(run.after)) read.set(id, await parentOf(reader, id));
  return waitsOf(run, (id) => read.get(id) ?? { shipped: false });
}

/**
 * A run waited on that never ships without a person: what `wf ls` prints `→ waiting on you:` for, and `waitAdvice` says is yours to resolve.
 *
 * The package decides it (`neverShips` in run.ts) and does not export it. Read here off `Wait`'s own contract — its id and, when it may
 * never ship without a person, why — so any reason it carries counts, one the package adds after `missing`, `cancelledAt` and `gone`
 * included, rather than a copy of the three it has today. Exporting `neverShips` would make this an import.
 */
const neverShips = (w: Wait): boolean => Object.entries(w).some(([key, why]) => key !== 'run' && why !== undefined);

/** What a run still waits on (`RunWaiting`), in the package's words; null when it waits on no run. */
function waitingOf(run: Run, waits: readonly Wait[]): RunWaiting | null {
  if (!waits.length) return null;
  return {
    runs: waits.map((w) => ({ run: w.run, missing: Boolean(w.missing), cancelledAt: w.cancelledAt ?? null, gone: w.gone ?? [] })),
    word: waitWord(waits),
    advice: waitAdvice(run, waits),
    onYou: waits.some(neverShips),
  };
}

/**
 * The run's workflow folder, read now.
 *
 * The run record is the truth about what ran; the folder is only where the prose came from, and it
 * can be edited or deleted after `wf start`. So a folder that no longer reads is a warning on the
 * run, not a failure of the request — and on a run that froze its workflow, nothing the page draws
 * comes from it. The case that made this so: an api older than the package's parser refused the
 * folder's newer keys, and every step of a run whose record had the whole graph read as a root.
 */
function workflowsOf(run: Run): { steps: Workflow[]; warning: null } | { steps: null; warning: string } {
  try {
    return { steps: loadWorkflows(run.workflowDir), warning: null };
  } catch (err) {
    const why = fs.existsSync(run.workflowDir)
      ? `The workflow folder ${run.workflowDir} no longer reads as a workflow: ${(err as Error).message}.`
      : `The workflow folder ${run.workflowDir} is gone.`;
    return {
      steps: null,
      warning: run.workflow
        ? `${why} Nothing here is read from it: the steps, their spec, prose and graph are the workflow the run froze at \`wf start\`, which is what it is judged by.`
        : `${why} The steps are listed from the run record, without their spec or prose.`,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `wf decide` reads
 * the record too. Then any step the workflow the tick reads (`stepsOf` in runner.ts) has and the record
 * does not. On a run that froze its workflow that is the frozen one, so a step the folder gained since is
 * not shown: the tick never files it, and drawn, it would wait for ever and make a root of the graph the
 * run froze — `driftOf` names it instead. On a record from before runs froze one, the folder, whose added
 * steps the tick does file.
 */
function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (run.workflow ?? workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

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
 * The steps a run is judged by: the workflow it froze at `wf start`, which the tick reads (`stepsOf` in
 * runner.ts), and for a record from before runs froze one, the folder. A record whose folder no longer
 * reads is judged from the record alone, a `bare` step each.
 */
const judgedSteps = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] =>
  run.workflow ?? folder ?? Object.keys(run.steps).map(bare);

/** A step nothing defines any more. All the record says of it is its name: no `after`, `check:` or `output:`. */
const bare = (name: string): Workflow => ({ name, after: [], body: '' });

/**
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it: `list`'s,
 * which the package does not export. `unknown` where `phaseOfView` says so, for a task the engine has no record of: the
 * engine folds it to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
 */
const wordOf = (views: Views) => (taskId: string): string => {
  const view = views.get(taskId);
  return view && phaseOfView(view) !== 'unknown' ? view.phase : 'unknown';
};

/** What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it still moves. */
type Judged = {
  words: ReadonlyMap<string, string>;
  notes: ReadonlyMap<string, string | null>;
  waitingOnYou: string[];
  /** `waitingOnYou` in `wf ls`'s words (`onYouWords`): `approve plan` for a step at its gate. */
  onYou: string[];
  /** What a person has to decide about the result (`toDecide`), as `listing` reads it off the branch standings it was given; null while there is nothing. */
  toDecide: RunToDecide | null;
  status: RunStatus;
  moving: boolean;
  /** The runs its roots wait on (`waitingOf`). */
  waiting: RunWaiting | null;
  /** The tries people asked for that the next tick files, by step: `assess`'s, off their ask files. */
  asked: ReadonlyMap<string, Retry>;
  /** Every ask that carried a message, waiting or consumed (`readAnswers`): what says a try was answered (`answerOf`). */
  answers: readonly RetryAsk[];
  /** What each task's sessions cost, off the views read (`spendReader`): what holds a step to its `budget:`. */
  spendOf: SpendOf;
  /** What the run has cost, every step's tries (`runSpend`); null until a cost was measured. */
  cost: Spent | null;
};

/**
 * The result branches whose standing against the base branch decides anything, for this run: none unless it finished with every step
 * satisfied, it was not called off, it cut worktrees of its own, and no step of its workflow merges (`merges`) — a folder whose ending
 * merges answers for its own branch. Pure, and off the record alone: what `standingsOf` asks git about, and nothing more.
 */
const toDecideBranches = (run: Run, steps: readonly Workflow[], status: RunStatus): string[] =>
  (run.cancelledAt || status !== 'succeeded' || !run.isolate || merges(steps)
    ? []
    : [...new Set(resultSteps(steps).map((s) => run.steps[s.name]?.branch).filter((b): b is string => Boolean(b)))]);

/**
 * Where each of a run's result branches stands against the base branch, as git says it now (`branchStandings`): what says a finished run
 * whose folder has no ending step is one nobody has decided (`toDecide`'s git kind).
 *
 * Asked of the runs where the answer can decide anything and of no other (`toDecideBranches`), because it is a few `git` calls a branch and
 * the list is polled every five seconds: a gate says a run is one to decide without git being asked at all. Level-triggered, as the package
 * is: read on the request that asks, stored nowhere, so a branch a person merged by hand stops being one to decide with nobody telling the
 * run. A record whose branches cannot be read is no branch: git said nothing, and only a gate says there is something to decide.
 */
function standingsOf(run: Run, steps: readonly Workflow[], status: RunStatus): BranchStanding[] {
  const branches = toDecideBranches(run, steps, status);
  if (!branches.length) return [];
  try {
    return branchStandings(run, branches);
  } catch {
    return [];
  }
}

/**
 * What `wf ls` says about each step, what `assess` says about the run, and whether the run still moves.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`,
 * `unsigned`, `succeeded · BLOCKED`, `rounds exhausted`, the engine's own word while a step runs, and `unknown` for a task it
 * has no record of — and so are the notes beside them. A step and a check are read as the tick reads them, off the package's
 * own `phaseOfView`, `closeoutAsked` and `exitVerdicts`.
 *
 * Given what people asked for with `wf retry` and `wf round`, read once, as the tick reads them (`readAsks`): without them a
 * step a person asked to try again, or a loop out of rounds a person sent round once more, reads as waiting on them, and the
 * run as not moving, for as long as the tick takes to file what they asked for. A step the page shows and the tick does not judge — one a pre-freeze record has and its folder
 * lost — is worded as a `bare` step, and has no say in the run's status. Everything is read off the views the request already has: calling `list` would
 * read every task again, and word only the steps the tick judges. The api test holds these words to `list`'s.
 *
 * Given the runs its roots wait on, read once (`waitsIn`): a root of a run waiting on runs says `waiting on <run>`, as `list` words it, and
 * the run moves while each may still ship — the tick files the roots when they do — and not once one never will without a person.
 *
 * And given where the run's result branches stand, asked of git for the runs where the answer can decide anything (`standingsOf`), which is
 * why the status is read first: without them only a gate says a run is one nobody has decided, and a finished run whose branch nobody merged
 * would say there is nothing to decide.
 */
function judge(
  run: Run,
  names: readonly string[],
  folder: readonly Workflow[] | null,
  views: Views,
  waits: readonly Wait[],
  /** Where each result branch stands, asked once the run's status is known; left out, no branch is read, and a to-decide branch says nothing. */
  standingsOf: (status: RunStatus, steps: readonly Workflow[]) => readonly BranchStanding[] = () => [],
): Judged {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const asked = closeoutAsked(views);
  // Off the engine's record of each check, not the log `wf ls` reads (`readVerdict`): the check prints the code it exits with,
  // so the two agree, and a `logs` call per refused check would observe every harness again, on every poll of the list.
  const verdicts = exitVerdicts(views, run);
  // Unreadable ask files are `notes` the tick prints and does not honour; neither does the board.
  const { asks, rounds } = readAsks(run.id);
  // And what people said with them, as `list` reads it: without it a try a person answered reads as one they did not.
  const answers = readAnswers(run.id);
  // And how many times a person said something to each step's current try (`wf say`), as `list` counts it: the note says so.
  // And what each task's sessions cost, as `list` reads it (`spendReader`), off views that hold every try's task: a step whose tries have
  // cost its cap says `over budget $4.25 of $3`, waits on you, and is filed nothing more — without it, it read as one with no cap.
  const spendOf = spendReader(views);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  // Given the verdict, as the tick is: without it `assess` cannot tell a check that refused, which `retries:` tries
  // again, from one that did not finish, which waits on a person — and the status and `listing`'s words would disagree.
  // And the harness's word, as the tick has it (`harnessBlocked`): a person's try of a step whose session the harness blocked is due, the
  // session stopped first. Without it that try is in `listing`'s note, which reads the engine's word, and neither `asked` nor `moving`.
  // And the cost, as the tick has it: a step over its budget is not tried, nor its loop sent round, on the run's word, so it does not move.
  const { status, ready, check, retry, round } = assess(steps, run, phase, closeoutReader(views, run), asked, verdicts, asks, rounds, harnessBlocked(views), spendOf);
  // The one thing read off git here, and only where it can decide anything: `listing` reads what is left to decide off it, on the same
  // inputs as `assess`, so the words and the judgement are the package's single reading.
  const standings = standingsOf(status, steps);
  const said = listing(shown, run, wordOf(views), (name) => closeoutOf(views, run, name), asked, verdicts, asks, rounds, answers, waits, saidCount(views, run), spendOf, undefined, standings);
  const waiting = waitingOf(run, said.waiting);
  // A record the tick cannot read — from before runs froze their workflow, its folder gone — has nothing filed
  // for it, whatever its bare steps would make ready: the tick fails on it.
  const tickReads = Boolean(run.workflow ?? folder);
  const waitingOnYou = names.filter((name) => said.waitingOnYou.includes(name));
  return {
    words: new Map(said.steps.map((s) => [s.name, s.status])),
    notes: new Map(said.steps.map((s) => [s.name, s.note ?? null])),
    waitingOnYou,
    // In the page's order, as `waitingOnYou` is: the words `wf ls` prints after `→ waiting on you:`.
    onYou: onYouWords({ steps: said.steps, waitingOnYou }),
    toDecide: toDecideOf(run, said.toDecide),
    status,
    // The line `cancelPlan` draws for a finished run, which `status` does not: nothing in flight, and nothing a
    // tick would still file. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands.
    // A round due is filed as a try is: a loop's looping step settled, and nothing of it in flight until the tick files the round.
    // Roots `assess` makes ready on a run waiting on runs are filed once those ship (`runReady`), which never happens on its own for a
    // run that never ships: the gate is the tick's, and `assess` does not know it.
    moving: inFlight(run, phase).length > 0 || (tickReads && ((ready.length > 0 && !waiting?.onYou) || check.length > 0 || retry.length > 0 || round.length > 0)),
    waiting,
    asked: new Map(retry.filter((r) => r.by === 'ask').map((r) => [r.step, r])),
    answers,
    spendOf,
    cost: spentOf(runSpend(run, spendOf)),
  };
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
  return { spent, budget, raise: step && !run.cancelledAt ? raiseOf(run, step, steps, views, spendOf) : null };
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

async function summarize(run: Run, views: Views): Promise<RunSummary> {
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const judged = judge(run, names, folder, views, await waitsIn(run, seenBy(views)), (status, steps) => standingsOf(run, steps, status));
  return {
    id: run.id,
    repo: run.repo,
    brief: run.brief,
    workflowDir: run.workflowDir,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    after: run.after ?? [],
    waiting: judged.waiting,
    status: judged.status,
    moving: judged.moving,
    cost: judged.cost,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: judged.words.get(name)!,
      note: judged.notes.get(name) ?? null,
      ...needsOf(run, name, views, judged),
    })),
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
  };
}

/**
 * What a person has to know to act on a step (`StepNeeds`), off the views the request already read, with no observation of its own: its
 * current try's closeout, the engine's word for its task, and what the run established of it (`judge`) — for a step at its gate that waits
 * on you, what `wf ls` asks of you, in its words (`onYouWords`).
 */
function needsOf(run: Run, name: string, views: Views, judged: Pick<Judged, 'words' | 'waitingOnYou'>): StepNeeds {
  const view = run.steps[name]?.taskId ? views.get(run.steps[name]!.taskId!) : undefined;
  const said = view ? closeoutOf(views, run, name) : undefined;
  const status = judged.words.get(name)!;
  const atGate = status === 'awaiting approval' && judged.waitingOnYou.includes(name);
  return {
    needs: said && !('error' in said) && said.outcome === 'blocked' ? said.needs || null : null,
    blockedByHarness: view?.phase === 'needs-human' && said === undefined,
    approve: atGate ? onYouWords({ steps: [{ name, status, branch: null }], waitingOnYou: [name] })[0]! : null,
  };
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

/**
 * When each task was filed, off the engine's feed (`readFilings`), and where the last read of it stopped: a task's view carries no filing
 * time, and the wait for a slot is filing → first attempt. Read on from the cursor on each detail — a filing is written once and never
 * changes — so a page polled every five seconds reads what was appended since. A read's cache: a fresh process reads the feed from the start.
 */
const filings = { filed: new Map<string, string>(), cursor: 0 };

/** Every task's filing time the feed has, read on from where the last read stopped. A feed that cannot be read this time leaves what was read before. */
async function filedTimes(): Promise<ReadonlyMap<string, string>> {
  try {
    filings.cursor = (await readFilings(e, filings.cursor, filings.filed)).cursor;
  } catch {
    // The queue times of tasks filed since say `not known` until a read works.
  }
  return filings.filed;
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
  const last = got.events.filter((event) => (event.kind === 'text' || event.kind === 'system') && event.text?.trim()).at(-1);
  const line = last?.text?.trim() ?? from?.line ?? null;
  lastSaid.set(key, { cursor: got.cursor, line });
  return line;
}

/** A try asked for, as the page says it (`StepAsked`). */
const askedOf = (r: Retry | undefined): StepAsked | null =>
  r ? { try: r.try, mode: r.mode, model: r.model ?? null, message: r.message ?? null, stopFirst: r.stopFirst === true } : null;

const specOf = (step: Workflow): StepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  effort: step.effort ?? null,
  after: step.after,
  resume: step.resume ?? null,
  permissionMode: step.permissionMode ?? null,
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

async function detail(run: Run): Promise<RunDetail> {
  const folder = workflowsOf(run);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  // Every task in the store over one observation, as the list reads them, rather than a `view` — an observation, ~0.3 s here — for
  // each task of each try, one after another, on a page polled every five seconds: a loop's later rounds made that seconds a poll.
  // Folding every journal cost about what one observation does (163 journals, 2026-09-13). The record is read first, as the list reads it.
  // One more observation for each refused check's output (`checksOf`) and each blocked session's last line (`lastLineOf`), which only a
  // run's own detail reads.
  const views = await everyView();
  const judged = judge(run, names, workflows, views, await waitsIn(run, seenBy(views)), (status, steps) => standingsOf(run, steps, status));
  const steps = judgedSteps(run, workflows);
  const checks = await checksOf(run, steps, views);
  const source = shownWorkflow(run, workflows);
  // Off the views already read: no observation of its own.
  const used = consumption(views, run);
  // Off the same views — every task in the store, so every try's — and the feed's filing times: no observation either.
  // And the steps the run is judged by, whose loops its rounds are of.
  const clock = timeline(run, views, await filedTimes(), steps);
  return {
    id: run.id,
    brief: run.brief,
    repo: run.repo,
    workflowDir: run.workflowDir,
    baseRef: run.baseRef,
    branch: run.branch,
    isolate: run.isolate,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    after: run.after ?? [],
    ...(run.from ? { from: run.from, fromNote: fromNote(run)! } : {}),
    waiting: judged.waiting,
    status: judged.status,
    moving: judged.moving,
    cost: judged.cost,
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
    gates: gatesOf(steps, run),
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    // The steps `judge` words: the judged workflow, then a `bare` step for each one the page shows beside it.
    graph: graphOf([...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)]),
    steps: await Promise.all(names.map(async (name) => {
      const step = source?.find((s) => s.name === name);
      const taskId = run.steps[name]?.taskId ?? null;
      const needs = needsOf(run, name, views, judged);
      const current = {
        status: judged.words.get(name)!,
        check: checks.get(name) ?? null,
        // An unreadable closeout is already in `status`; there is nothing here to show of it.
        closeout: closeoutIn(run, name, step ?? bare(name), taskId, views),
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
        branch: run.steps[name]?.branch ?? null,
        note: judged.notes.get(name) ?? null,
        ...needs,
        lastLine: needs.blockedByHarness ? await lastLineOf(views.get(taskId!)!) : null,
        // Judged by the workflow the run is: a step it does not have is gated only where the run was started with its gate.
        gate: gateOf(run, steps.find((s) => s.name === name) ?? bare(name), current.status),
        said: taskId ? [...(views.get(taskId)?.state.said ?? [])] : [],
        asked: askedOf(judged.asked.get(name)),
        ...current,
        used: taskId ? usedOf(used[name]) : null,
        // Off the same views, which hold every try's task: no observation.
        ...costOf(run, name, steps, views, judged.spendOf),
        tries: triesOf(run, name, steps, views, current, judged.answers),
        timeline: (clock.steps[name] ?? []).map((t) => ({ ...t, used: t.session ? usedOf(t.used) : null })),
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
  const { model, effort, permissionMode, tools, deadlineSeconds, maxAttempts } = view.state;
  return {
    model: model ?? null,
    askedModel: askedModelOf(record),
    effort: effort ?? null,
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
 * named. So a rule the engine changes is the rule read here. `claude` is the engine's own `claude --bg` runner, whose spawn is no
 * function it exports: the mode filed, or `auto` (`claudeOps` in agent-engine's runner.ts), which the api test holds to the command
 * that runner spawns. A task filed with no harness ran on the engine's first (`fallback` in its facade). Null for a harness the api
 * cannot ask, or one whose command names no mode.
 */
function runsInOf(state: TaskView['state']): StepFiled['runsIn'] {
  const name = state.harness ?? Object.keys(HARNESSES)[0]!;
  if (!Object.hasOwn(HARNESSES, name)) return null;
  const harness = HARNESSES[name as keyof typeof HARNESSES];
  const by = state.permissionMode === undefined ? 'default' : 'filed';
  if (harness === 'claude-bg') return { mode: state.permissionMode ?? 'auto', by };
  if (typeof harness !== 'object' || !('command' in harness)) return null;
  const modeOf = (tools: string[] | undefined): string | undefined => {
    try {
      const { args } = harness.command({ name: `${state.taskId}/mode`, brief: '', cwd: state.cwd || '/', permissionMode: state.permissionMode, tools });
      const at = args.findIndex((arg) => MODE_FLAGS.includes(arg));
      return at < 0 ? undefined : args[at + 1];
    } catch {
      return undefined;
    }
  };
  const mode = modeOf(state.tools);
  if (mode === undefined) return null;
  return { mode, by: state.tools && modeOf(undefined) !== mode ? 'tools' : by };
}

/**
 * How one try of a step signed off, off the engine's record of its task's last attempt — as `closeoutOf` reads the current try's —
 * with what it gave of the fields its step declares, its `replies`, and each file it named as `artifactOf` reads it. Null for a
 * try that gave none, and for one whose closeout could not be read, which the step's `status` says of its current try.
 */
function closeoutIn(run: Run, name: string, step: Workflow, taskId: string | null, views: Views): StepCloseout | null {
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
  const c = said === undefined ? undefined : parseCloseout(said);
  if (!c || 'error' in c) return null;
  // `replies` apart: a loop's target owes them beside what its step declares, and they are shown as answers, not as a field.
  const { given, missing } = declaredOutput(step, c, outputFields(step).filter((field) => field !== LOOP_REPLIES));
  const replies = c.output?.[LOOP_REPLIES];
  return {
    outcome: c.outcome,
    summary: c.summary,
    needs: c.needs ?? null,
    artifacts: c.artifacts.map((file) => artifactOf(run, name, file)),
    output: given,
    missing,
    replies: Array.isArray(replies) ? replies.map(replyOf) : null,
  };
}

/** One of a closeout's `replies`, forgivingly: the harness held it to its schema, and an agent filled it in. */
function replyOf(item: unknown): StepReply {
  const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value));
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { finding: text(item), answer: '', why: '' };
  const { finding, answer, why } = item as Record<string, unknown>;
  return { finding: text(finding), answer: text(answer), why: text(why) };
}

/**
 * A step's tries, earliest first: each one its record keeps behind the current (`StepRecord.tries`), then the current, whose
 * word, check, closeout and attempts the step already has. Off the views already read (`viewsOf`), with no observation of its
 * own: an earlier refused check's stderr is a file, and its output is not read. What a person said to each try is off the
 * answers the request read (`readAnswers`).
 */
function triesOf(
  run: Run,
  name: string,
  steps: readonly Workflow[],
  views: Views,
  current: Pick<StepTry, 'status' | 'check' | 'closeout' | 'attempts'>,
  answers: readonly RetryAsk[],
): StepTry[] {
  const step = steps.find((s) => s.name === name) ?? bare(name);
  const record = run.steps[name];
  const earlier = record?.tries ?? [];
  // The step's record as it stood on its n-th try: the tries behind that one.
  const recordAt = (n: number): StepRecord => ({ taskId: null, tries: earlier.slice(0, n - 1) });
  // What a person said to the n-th try, asked of the record as it stood then: `answerOf` reads a step's current try.
  const answerAt = (n: number): string | null => answerOf({ ...run, steps: { ...run.steps, [name]: recordAt(n) } }, name, answers)?.message ?? null;
  // How the n-th try was reached, as `wf ls` words it for a record on that try — `answered`, when a person answered it.
  const noteOf = (n: number) => tryNote(step, recordAt(n), steps, answerAt(n) !== null) || null;
  return [
    ...earlier.map((t, i): StepTry => ({
      try: i + 1,
      round: roundIn({ taskId: null, tries: earlier.slice(0, i) }),
      then: t.then,
      current: false,
      taskId: t.taskId,
      note: noteOf(i + 1),
      status: wordOf(views)(t.taskId),
      attempts: attemptsIn(t.taskId, views),
      check: step.check ? checkIn(step.check, t.check?.taskId, views) : null,
      closeout: closeoutIn(run, name, step, t.taskId, views),
      answer: answerAt(i + 1),
    })),
    {
      try: earlier.length + 1,
      round: roundIn(record),
      then: null,
      current: true,
      taskId: record?.taskId ?? null,
      note: noteOf(earlier.length + 1),
      ...current,
      answer: answerAt(earlier.length + 1),
    },
  ];
}

/** A usage in `wf decide`'s words: `usedLines`, each line without the label it starts with. */
function usedOf(usage: Usage | undefined): StepUsed {
  const [used = '', cost = ''] = usedLines(usage);
  return {
    usage: usage ?? null, used: used.replace(/^used\s+/, ''), cost: cost.replace(/^cost\s+/, ''),
    costUsd: usage?.costUsd ?? null, apiMs: usage?.apiMs ?? null, toolMs: usage?.toolMs ?? null,
  };
}

/** The counts `sumUsage` adds up, as agent-workflows' radius.ts names them (`FIELDS`): the time the harness counted among them. */
const USAGE_FIELDS = ['turns', 'toolCalls', 'inputTokens', 'outputTokens', 'costUsd', 'apiMs', 'toolMs'] as const;

/**
 * Several usages as one, by `sumUsage`'s rule in agent-workflows' radius.ts, which the package does not export: a count is
 * the sum only when every usage measured it, since a sum over the ones that happened to be counted reads as the whole.
 */
function sumUsages(usages: ReadonlyArray<Usage | undefined>): Usage | undefined {
  if (!usages.length) return undefined;
  const sum: Usage = {};
  for (const field of USAGE_FIELDS) {
    if (usages.every((u) => u?.[field] !== undefined)) sum[field] = usages.reduce((n, u) => n + u![field]!, 0);
  }
  return Object.keys(sum).length ? sum : undefined;
}

/** How many lines of one file's check-affecting diff the board is given. `wf decide` prints them all. */
export const DIFF_LINES = 400;

/**
 * A diff `git diff` gave for several files, one entry per file, each cut to `DIFF_LINES`. Named for a person — `from → to`
 * for a rename — off the file's own header lines, before its first hunk.
 */
export function diffFiles(diff: string): DiffFile[] {
  const files: string[][] = [];
  for (const line of diff.replace(/\n$/, '').split('\n')) {
    if (line.startsWith('diff --git ') || !files.length) files.push([]);
    files.at(-1)!.push(line);
  }
  return files.map((lines) => ({ path: diffPath(lines), lines: lines.slice(0, DIFF_LINES), cut: Math.max(0, lines.length - DIFF_LINES) }));
}

function diffPath(lines: readonly string[]): string {
  const hunk = lines.findIndex((line) => line.startsWith('@@'));
  const head = hunk < 0 ? lines : lines.slice(0, hunk);
  const after = (prefix: string) => head.find((line) => line.startsWith(prefix))?.slice(prefix.length).replace(/\t$/, '');
  const [from, to] = [after('rename from '), after('rename to ')];
  if (from && to) return `${from} → ${to}`;
  for (const [prefix, side] of [['+++ ', 'b/'], ['--- ', 'a/']] as const) {
    const named = after(prefix);
    if (named && named !== '/dev/null') return named.startsWith(side) ? named.slice(side.length) : named;
  }
  // No `---`/`+++` for a binary file or a mode change: `diff --git a/<path> b/<path>`, whose two halves are the same path.
  const both = (head[0] ?? '').slice('diff --git '.length);
  const half = (both.length - 1) / 2;
  return Number.isInteger(half) && both.slice(2, half) === both.slice(half + 3) ? both.slice(2, half) : both;
}

/** A branch's check-affecting diff, as `inFullLines` reads what `sensitiveDiff` gave: an error, none, or the files. */
function sensitiveOf(run: Run, t: Touched): SensitiveDiff {
  if ('error' in t.radius) return { branch: t.branch, files: [], error: t.radius.error };
  const diff = sensitiveDiff(run, t, CHECK_AFFECTING);
  if (diff === undefined) return { branch: t.branch, files: [], error: `git could not diff ${t.branch}` };
  return { branch: t.branch, files: diff.trim() ? diffFiles(diff) : [], error: null };
}

/** The line `lessonLine` prints, and which of its three it is. */
function lessonOf(touched: readonly Touched[]): Lesson {
  const said = lessonLine(touched).replace(/^lesson\s+/, '');
  if (touched.some((t) => 'error' in t.radius)) return { said, state: 'unknown' };
  return { said, state: touched.some((t) => !('error' in t.radius) && t.radius.lessons.length) ? 'written' : 'nothing' };
}

/**
 * A once-more line's command: `wf retry <run> <step>`, `--recheck` when it says so, or `wf round <run> <step>` — with `--budget <amount>`
 * past a cap — after the colon and two spaces.
 */
const ONCE_MORE = /:\s{2}(wf (?:retry|round) \S+ \S+(?: --recheck| --budget <amount>)?)/;

/** A gate line's two commands, as `gateLines` prints them for a step awaiting approval: the approval, without its words, and the send-back. */
const AT_GATE = /^awaiting approval:\s{2}(wf approve \S+ \S+)(?: \[--message "<words>"\])?\s{2}— or send it back:\s{2}(wf retry \S+ \S+ --message "<objection>")$/;

/**
 * The commands `wf decide` prints on a run awaiting a person: once more for each step it offers, the approval and the send-back for
 * each step waiting at its gate on you (`gates`, `gateLines`' lines), then ship it and drop it for the branches, or read it for a run
 * worked on its base branch — which has nothing to merge, nor a branch to delete.
 *
 * `merges` is whether a step of the workflow acts on the base branch itself (`workspace: main`): ship it and drop it are for the folder
 * that says nothing about what happens when the work is done, and a folder that says it in prose does not also tell a person to type
 * `git merge` — its ending step is what merges, and a run parked at that step's gate is one approval away from doing it. As `wf decide`
 * decides it (cli.ts, `!merges(steps)`).
 */
function commandsOf(run: Run, d: Decision, offers: readonly string[], gates: Readonly<Record<string, string>> = {}, merges = false): DecideCommand[] {
  if (d.kind !== 'awaiting') return [];
  const once = [
    ...offers.map((said): DecideCommand => ({ label: 'once more', command: ONCE_MORE.exec(said)?.[1] ?? said, said })),
    ...Object.entries(gates).flatMap(([name, line]): DecideCommand[] => {
      const [, approve, sendBack] = AT_GATE.exec(line) ?? [];
      return approve && sendBack
        ? [{ label: 'approve', command: approve, said: `${name} waits at its gate — with words: ${approve} --message "<words>"` }, { label: 'send back', command: sendBack, said: null }]
        : [];
    }),
  ];
  if (d.direct) {
    const said = `worked directly on ${run.branch}; nothing to merge; the base was ${run.baseRef}`;
    return [...once, { label: 'read it', command: `git -C ${run.repo} diff ${run.baseRef}...${run.branch}`, said }];
  }
  const first = merges ? undefined : d.branches[0];
  return [
    ...once,
    ...(first
      ? [
          { label: 'ship it', command: `git -C ${run.repo} merge --no-ff ${first}`, said: null },
          { label: 'drop it', command: `git -C ${run.repo} branch -D ${d.branches.join(' ')}`, said: null },
        ] satisfies DecideCommand[]
      : []),
  ];
}

/**
 * What `wf decide` shows a person about a run, read off one read of its tasks.
 *
 * A run still running with nobody waited on is `running`, and git is not asked a thing: the page asks while a run is
 * decidable, and the Factory's card only for a run waiting on you, but a request is a request. Otherwise judged as the
 * CLI judges it (`decision`): called off, or already shipped, is `nothing`. Then the branches the CLI reads
 * (`branchesToRead`) — the result branches, or every branch a step worked on when no terminal step has one — each
 * read with `touchedBy`, and with `sensitiveDiff` over the default check-affecting list. A branch git cannot read is
 * an `error` on its entry, never a failed request. A few `git` calls a branch, so read once, never on a poll.
 *
 * First, as `wf decide` asks it first: a run whose roots wait on runs that have not shipped is `waiting`, and nothing else is read.
 */
async function decisionOf(run: Run): Promise<RunDecision> {
  const waits = await waitsIn(run, e);
  const waiting = waitingOf(run, waits);
  if (waiting) return { waiting };
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const views = await viewsOf(run);
  // Judged without the branch standings, which this answer does not carry: a run still running is answered `running` below without one
  // `git` being run for it, and what there is to decide is on the run's own detail, off its own read.
  const judged = judge(run, names, folder, views, waits);
  if (judged.status === 'cancelled') return { nothing: `cancelled at ${run.cancelledAt} — nothing to decide` };
  if (judged.status === 'running' && !judged.waitingOnYou.length) return { running: true };

  const steps = judgedSteps(run, folder);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdicts = exitVerdicts(views, run);
  const { asks, rounds } = readAsks(run.id);
  // With the harness's word, as `wf decide` reads it: a person's try of a session the harness blocked is waited on too. And what each
  // task's sessions cost (`spendReader`): a step over its budget, or ended at it, is waited on, and offered its try or round with `--budget`.
  const { spendOf } = judged;
  const d = decision(steps, run, phase, (branch) => isShipped(run, branch), reader, asked, verdicts, asks, rounds, harnessBlocked(views), spendOf);
  if (d.kind === 'cancelled') return { nothing: `cancelled at ${d.at} — nothing to decide` };
  if (d.kind === 'shipped') return { nothing: `shipped — ${d.branches.join(', ')} is already on ${run.branch}` };

  // Still running with a step waiting on you: the result steps' branches, as `decision` reads them once it is not (`resultSteps`) —
  // the terminal steps, and for a terminal step that works in the repository's own checkout, the steps it waits on, whose work it acts on.
  const results = [...new Set(resultSteps(steps).map((s) => run.steps[s.name]?.branch).filter((b): b is string => Boolean(b)))];
  const result = d.kind === 'awaiting' ? d.branches : results;
  const touched: Touched[] = branchesToRead(result, Object.values(run.steps).map((s) => s.branch))
    .map((branch) => ({ branch, radius: touchedBy(run, branch) }));
  // Where the result stands against the base branch, and how much it changed, as `wf decide` prints them under the run — none for a run
  // that worked on its base branch itself, whose standing would read `main is on main` and whose own line says so instead.
  const standings: Standing[] = run.isolate
    ? branchStandings(run, results).map((s) => ({ ...s, said: branchWord(run, s), stat: diffStat(run, s.branch).trim() || null }))
    : [];
  const consumed = consumption(views, run);
  const filed = Object.keys(run.steps).filter((name) => run.steps[name]?.taskId);
  const offers = [...roundLines(steps, run, d, spendOf), ...retryLines(steps, run, d, phase, reader, asked, spendOf, verdicts)];
  // Each step waiting at its gate on you — not one a person has sent back already, which waits on nobody — as `wf decide` prints its gate.
  const gates = Object.fromEntries(Object.entries(gateLines(steps, run, phase, reader, asked, verdicts, spendOf)).filter(([name]) => judged.waitingOnYou.includes(name)));
  return {
    standings,
    touched,
    lesson: lessonOf(touched),
    sensitive: touched.map((t) => sensitiveOf(run, t)),
    used: Object.fromEntries(filed.map((name) => [name, usedOf(consumed[name])])),
    total: usedOf(sumUsages(filed.map((name) => consumed[name]))),
    cost: runCostLines(run, spendOf)[0]?.replace(/^cost\s+/, '') ?? null,
    overBudget: overBudgetLine(steps, run, d, spendOf) ?? null,
    commands: commandsOf(run, d, offers, gates, merges(steps)),
  };
}

/** Off the engine's view of a try's task. A try with no task, or one the engine has lost, has had none. */
function attemptsIn(taskId: string | null, views: Views): StepAttempts {
  const attempts = (taskId && views.get(taskId)?.state.attempts) || [];
  const latest = attempts.at(-1);
  return {
    count: attempts.length,
    latest: latest ? { startedAt: latest.startedAt, ended: latest.ended, endedAt: latest.endedAt ?? null, reason: latest.reason } : null,
  };
}

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** The last `max` lines of a session's output, and whether there were more. */
function tailOf(output: string, max: number): StepLog {
  const lines = output.split(/\r?\n/);
  // Output that ends in a newline has not begun another line.
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false };
}

/** How many lines of each stream a refused check shows: as many as `wf decide` does (`CHECK_TAIL_LINES`). */
const CHECK_LINES = 20;

/**
 * A check of one try, off the engine's view of its task: the command, its verdict, and once it refused, what it exited with and
 * the end of its stderr — its output left unread (`StepCheck`). A check is filed for the step, so a settled one's record has a
 * verdict: an exit code, or `unfinished` — `exitVerdicts`' reading, for a try that need not be the current one.
 */
function checkIn(command: string, taskId: string | undefined, views: Views): StepCheck {
  if (!taskId) return { command, taskId: null, verdict: null, refused: null };
  const view = views.get(taskId);
  const phase = phaseOfView(view);
  const exitCode = view?.state.attempts.at(-1)?.exitCode;
  const exit = verdictWord(typeof exitCode === 'number' ? exitCode : 'unfinished');
  const refused = phase === 'failed' || phase === 'stopped';
  return {
    command,
    taskId,
    verdict: phase === 'unknown' ? 'unknown' : phase === 'succeeded' ? 'passed' : refused ? exit : 'checking',
    refused: refused ? { exit, stdout: null, stderr: tailOf(endOf(checkStderr(taskId)), CHECK_LINES), unreadable: null } : null,
  };
}

/**
 * Each judged step's check: its command, and for a check that refused, what it said — what `checkReports`
 * in runner.ts reads for `wf ls` and `wf decide`, which the package does not export. A `logs` call per
 * refused check, which observes every harness again: on one run's page, and never on the list.
 */
async function checksOf(run: Run, steps: readonly Workflow[], views: Views): Promise<Map<string, StepCheck>> {
  const checks = new Map<string, StepCheck>();
  for (const step of steps) {
    if (!step.check) continue;
    const check = checkIn(step.check, run.steps[step.name]?.check?.taskId, views);
    checks.set(step.name, check);
    if (!check.refused) continue;
    try {
      check.refused.stdout = tailOf(await e.logs(check.taskId!), CHECK_LINES);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      check.refused.stdout = { lines: [], truncated: false };
      check.refused.unreadable = `Could not read the output of its check (task ${check.taskId}): ${why}. \`wf decide ${run.id}\` reads it the same way from the command line.`;
    }
  }
  return checks;
}

/** The end of a file that may be large, or absent: a check stopped before it started wrote no stderr. */
function endOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** Found among the runs the store has, not read by path, so no id can name a file outside it. */
const findRun = (id: string): Run | undefined => listRuns().find((r) => r.id === id);

const noSuchRun = (id: string) =>
  `No run '${id}' in this store. GET /api/runs (or \`wf ls\`) lists the runs it has; check WF_ROOT if you expected it here.`;

/**
 * The run and the task a step's routes read — null for a step not filed yet — or why there is no such step to read: no run by
 * that id, or no step by that name on the run's page.
 */
function taskOfStep(id: string, step: string): { run: Run; taskId: string | null } | { error: string } {
  const run = findRun(id);
  if (!run) return { error: noSuchRun(id) };
  // The steps the run's page shows: those on the record, and any the folder has gained since.
  if (!stepNames(run, workflowsOf(run).steps).includes(step)) {
    return { error: `Run '${id}' has no step '${step}'. GET /api/runs/${id} lists the steps it has.` };
  }
  return { run, taskId: run.steps[step]?.taskId ?? null };
}

/** One of the engine's events in a session's conversation, as `transcript` gives it (`TranscriptEvent` in agent-engine). */
export type TranscriptEvent = Awaited<ReturnType<typeof e.transcript>>['events'][number];

/** A read of a step's conversation: the engine's events from the cursor asked with, where to ask again, and whether more may come. */
export type StepTranscript = {
  events: TranscriptEvent[];
  /** The engine's cursor, to pass as `after` on the next read. Null for a step with no task to read. */
  cursor: string | null;
  /** Whether the step's task is not settled yet. */
  live: boolean;
};

type Read = StepTranscript & { cursor: string };

/** Why a step's conversation was not read, with the status that says whose it is to fix. */
class Unread extends Error {
  readonly status: 400 | 404 | 502;
  constructor(status: 400 | 404 | 502, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One read of a step's conversation from `after`: the events and cursor as the engine's `transcript` gives them, and whether
 * the task is live.
 *
 * Live is read first. A task that settles between the two reads reads as live once more, and its last lines are read on the
 * next pass; read the other way round, it could read as settled before them. A read costs an observation of every harness
 * (`view`, a `claude agents` call among them, ~0.2 s here) and, while the attempt runs, one of the task's own harness
 * (`transcript` finds the session through it); once the attempt has ended, `transcript` reads by the session's id on the record.
 */
async function readTranscript(id: string, step: string, taskId: string, after: string | undefined): Promise<Read> {
  let view: TaskView;
  try {
    view = await e.view(taskId);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Unread(502, `Could not read task ${taskId} of step '${step}': ${why}. \`wf ls\` reads the same record from the command line.`);
  }
  if (phaseOfView(view) === 'unknown') {
    throw new Unread(404, `Step '${step}' of run '${id}' was filed as task ${taskId}, and the engine has no record of it: there is no conversation to read. \`wf ls\` shows the step unknown.`);
  }
  try {
    const { events, cursor } = await e.transcript(taskId, after);
    return { events, cursor, live: view.state.settled === null };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if ((err as { exitCode?: unknown }).exitCode !== 2) {
      throw new Unread(502, `Could not read the conversation of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads its output from the command line.`);
    }
    // Refused. The engine refuses a cursor none of its reads gave, and a harness that keeps no conversation it can read — and
    // asked again from the start, only the second. The words of the refusal are the engine's to change; this is not.
    if (after !== undefined && (await e.transcript(taskId).then(() => true, () => false))) {
      throw new Unread(400, `\`${after}\` is not a cursor a read of this conversation gave. Pass the \`cursor\` the last read returned as \`after\` — on the stream, the id of the last event, which an EventSource sends back as Last-Event-ID — or none to read from the start.`);
    }
    throw new Unread(404, `Step '${step}' of run '${id}' has no conversation to read: ${why} GET /api/runs/${id}/steps/${step}/log gives what its session printed.`);
  }
}

/** How often the stream reads a live step's conversation again: once a second, as the plan asks (§4 S). */
const STREAM_EVERY_MS = 1_000;

/**
 * A read's events on the stream, an SSE `transcript` event each, with the read's cursor as the id of the last.
 *
 * Of the last only: a reader cut off partway through a read keeps the previous read's cursor as its Last-Event-ID, so it
 * reconnects from before the events it did not get and is sent the read again, rather than past them. Sent twice, an event
 * is still one event to a reader: it is unique by its `id` and `kind`.
 */
async function send(stream: SSEStreamingApi, read: Read): Promise<void> {
  for (const [i, event] of read.events.entries()) {
    if (stream.aborted) return;
    const last = i === read.events.length - 1;
    await stream.writeSSE({ event: 'transcript', data: JSON.stringify(event), ...(last ? { id: read.cursor } : {}) });
  }
}

/** The body `POST …/retry` takes: `wf retry`'s flags, as JSON. */
const RETRY_SHAPE = '`{ "mode": "nudge" | "fresh" | "recheck", "model"?: "<m>", "message"?: "<answer>", "budget"?: <amount> }`';

/** The body `POST …/round` takes: `wf round`'s arguments, as JSON. */
const ROUND_SHAPE = '`{ "step"?: "<looping step>", "budget"?: <amount> }`';

/** An ask for another round of a run's loop, as the guard's refusals word it (guard.ts). */
const roundGuard = (id: string): Guarded => ({
  route: `POST /api/runs/${id}/round`,
  does: "asks for another round of a run's loop",
  forAnother: 'ask for one',
  why: "the next tick files the round a person asks for, which runs the loop's steps again in this repository, past the cap a budget carried where it raises one",
  reach: "raise it from the run's page on the board",
  instead: `Raise it from the run's page on the board, or with \`wf round ${id} [<step>] --budget <amount>\``,
  shape: ROUND_SHAPE,
});

/** An ask for another try of a step, as the guard's refusals word it (guard.ts). */
const retryGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/retry`,
  does: 'asks for another try of a step',
  forAnother: 'ask for one',
  why: "the next tick files the try a person asks for, and the answer it carries goes into the brief an agent acts on in this repository",
  reach: "answer the step from the run's page on the board",
  instead: `Answer it from the run's page on the board, or with \`wf retry ${id} ${step}\``,
  shape: RETRY_SHAPE,
});

/** The body `POST …/approve` takes: `wf approve`'s `--message`, as JSON. */
const APPROVE_SHAPE = '`{ "message"?: "<words>" }`';

/** An approval of a step waiting at its gate, as the guard's refusals word it (guard.ts). */
const approveGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/approve`,
  does: 'approves a step waiting at its gate',
  forAnother: 'approve one',
  why: "the next tick files what waits on a step a person approves, and the words given with it go into the brief of every step after the gate, which an agent acts on in this repository",
  reach: "approve it from the run's page on the board",
  instead: `Approve it from the run's page on the board, or with \`wf approve ${id} ${step}\``,
  shape: APPROVE_SHAPE,
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The body `POST …/say` takes: the words, as `wf say` takes them. */
const SAY_SHAPE = '`{ "text": "<words>" }`';

/** Words for a step's running session, as the guard's refusals word them (guard.ts). */
const sayGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/say`,
  does: "hands a person's words to a step's running session",
  forAnother: 'hand it any',
  why: "the words go into the session of a step at work in this repository, as a person's, and its agent acts on them",
  reach: "say it from the step's session page on the board",
  instead: `Say it from the step's session page on the board, or with \`wf say ${id} ${step} "<words>"\``,
  shape: SAY_SHAPE,
});

/**
 * Why a `budget` in a body is not a number (400), in the api's words, or null: the package's `--budget` is typed as digits, and has no words
 * for JSON. A number not above zero is the package's to refuse.
 */
function budgetTypeRefusal(budget: unknown, as: string, shape: string): Refusal | null {
  if (budget === undefined || typeof budget === 'number') return null;
  return { status: 400, error: `\`budget\` is the cap to raise to, as \`${as} --budget <amount>\` takes it: dollars, as a JSON number above zero, like 5 or 2.50. This request's was ${JSON.stringify(budget)}: ${shape}.` };
}

/**
 * How a try is asked for, off `POST …/retry`'s body — or why the body is not an ask (400): `wf retry`'s one way, the model its
 * `--model` names, which is a new session's, `--message`, and `--budget`, the cap a step over its budget is raised to — a JSON number above
 * zero, one that is not refused in the package's words (`budgetRefusal`). Whether the message and the budget may ride on the ask is the
 * package's to say (`messageRefusal`, `budgetRefusal`), and whether the step may be tried again that way, with that cap (`retryRefusal`).
 */
function howOf(body: unknown, command: string): RetryHow | Refusal {
  if (!isObject(body)) return { status: 400, error: `POST …/retry takes a JSON object: ${RETRY_SHAPE}.` };
  const { mode, model, message, budget } = body;
  if (mode !== 'nudge' && mode !== 'fresh' && mode !== 'recheck') {
    return {
      status: 400,
      error: `\`mode\` is how to try the step again, as \`wf retry\` takes it: "nudge" continues its session, told what happened; "fresh" starts a new session on its branch; "recheck" runs its check again and files no session. This request's was ${JSON.stringify(mode) ?? 'left out'}: ${RETRY_SHAPE}.`,
    };
  }
  if (model !== undefined && (typeof model !== 'string' || !model.trim())) {
    return { status: 400, error: `\`model\` names the model a new session runs on, as \`wf retry --model <m>\` does: a name, or left out for the step's own. This request's was ${JSON.stringify(model)}.` };
  }
  if (model !== undefined && mode !== 'fresh') {
    return { status: 400, error: `\`model\` names the model a new session runs on, as \`wf retry --model <m>\` does, so it goes with "mode": "fresh" — a nudge continues a session on the model it has, and a recheck files no session. This request asked for "${mode}".` };
  }
  if (message !== undefined && typeof message !== 'string') {
    return { status: 400, error: `\`message\` is what to tell the step, as \`wf retry --message "<answer>"\` takes it: text, or left out. This request's was ${JSON.stringify(message)}.` };
  }
  const typed = budgetTypeRefusal(budget, 'wf retry', RETRY_SHAPE);
  if (typed) return typed;
  const how: RetryHow = { mode, ...(model !== undefined ? { model } : {}), ...(message !== undefined ? { message } : {}), ...(budget !== undefined ? { budget: budget as number } : {}) };
  // Not above zero: not an amount, as `wf retry --budget` refuses one, in the package's words.
  if (how.budget !== undefined && !(how.budget > 0)) return { status: 400, error: budgetRefusal(how, command)! };
  return how;
}

/**
 * What a round is asked for with, off `POST …/round`'s body — or why the body is not an ask (400): the looping step, which `wf round` takes
 * when the run has more than one loop, and `--budget`, the cap each step of the loop over its budget is raised to. Whether the loop may go
 * round, with that cap, is the package's to say (`roundAsk`, through `round()`).
 */
function roundHowOf(body: unknown, id: string): { step?: string; budget?: number } | Refusal {
  if (!isObject(body)) return { status: 400, error: `POST …/round takes a JSON object: ${ROUND_SHAPE}.` };
  const { step, budget } = body;
  if (step !== undefined && (typeof step !== 'string' || !step.trim())) {
    return { status: 400, error: `\`step\` names the looping step whose loop goes round again, as \`wf round ${id} <step>\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(step)}: ${ROUND_SHAPE}.` };
  }
  // A number not above zero is refused by `round()`, in the package's words, before anything of the run is decided (`roundAsk`).
  const typed = budgetTypeRefusal(budget, `wf round ${id}`, ROUND_SHAPE);
  if (typed) return typed;
  return { ...(step !== undefined ? { step } : {}), ...(budget !== undefined ? { budget: budget as number } : {}) };
}

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  // What the repository offers a step, read from the checkout on each request (capabilities.ts), and what each step of each workflow
  // gets of it (reach.ts). Each MCP server the settings enable is started and asked for its tools once while the api runs; one that
  // fails is an `error` on its entry, never a failed request.
  .get('/api/capabilities', async (c) => c.json(await capabilitiesWithSteps(repoOf())))
  // A repository's workflows, listed, and a run of one started — the board's first write — or of an inbox card (workflows.ts).
  .route('/', workflows)
  // A folder of yours built on the board: made with a first step, and put back from its steps with the schemas pasted for them — two writes,
  // guarded as a start is, each through the package's `writeWorkflow` (builder.ts).
  .route('/', builder)
  // The inbox: its cards listed, one filed, one dropped — two writes, guarded as a start is (inbox.ts).
  .route('/', inbox)
  .get('/api/runs', async (c) => {
    // What one request costs, however many runs there are: one harness observation (one
    // `claude agents --json`, one scan of the detached runs' files), a read of every task journal in
    // the engine's store, and each run's record and workflow folder. It was a `view` — so an
    // observation — per filed step of every run: dozens of `claude agents` calls a poll.
    //
    // The records before the engine: `wf` files a step's task before it writes the id on the run, so
    // every id read here is in the listing that follows. The other way round, a task filed between
    // the two reads would show as `unknown` until the next poll.
    //
    // A run that waits on runs reads each of them off the same views (`seenBy`): its record and git, and its tasks as they were listed.
    const runs = listRuns();
    const views = await everyView();
    const summaries: RunSummary[] = [];
    for (const run of runs) summaries.push(await summarize(run, views));
    return c.json(summaries);
  })
  // The cap on runs in flight the daemon's last pass ran with, and the runs it counts and holds: what the Factory says over its floor.
  .get('/api/ceilings', async (c) => {
    try {
      return c.json(await ceilingsOf());
    } catch (err) {
      // `WF_MAX_RUNS` in the api's environment that is not a count, before any pass wrote the daemon's (`runCapOf`), or a record that does not parse.
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  })
  .get('/api/runs/:id', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await detail(run));
  })
  // What `wf decide` shows a person (`decisionOf`): not on the page's poll, since it runs `git diff`.
  .get('/api/runs/:id/decision', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await decisionOf(run));
  })
  // The board's second write: a person's ask for another try of a step — the answer to a step that signed off blocked, a nudge, a
  // recheck — made by the package's `retry()`, `wf retry`'s own, which writes the ask file and nothing else; the next tick honours it
  // once. Guarded as a start is (guard.ts). Refused in the package's words, verbatim: a message that cannot ride on the ask
  // (`messageRefusal`, 422) before the run is read, and a step that may not be tried again that way (`retryRefusal`, 409) after.
  // A step whose session its harness blocked, with nothing signed, is taken as `wf retry` takes it (`stopBlocked`): the ask is written as
  // any other, and the tick stops the session before it files the try — which the answer's `stopFirst` says, for the board to word.
  .post('/api/runs/:id/steps/:step/retry', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(retryGuard(id, step), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST …/retry takes a JSON body: ${RETRY_SHAPE}.` }, 400);
    }
    const how = howOf(body, `wf retry ${id} ${step}`);
    if ('status' in how) return c.json({ error: how.error }, how.status);
    // A budget on a recheck, which files no session to spend it, is the package's to refuse before the run is read, as a message on one is.
    const wrong = messageRefusal(how, `wf retry ${id} ${step}`) ?? budgetRefusal(how, `wf retry ${id} ${step}`);
    if (wrong) return c.json({ error: wrong }, 422);
    try {
      const { ask, file, stopFirst } = await retry(e, id, step, how, { stopBlocked: true });
      // Accepted, and not yet done: the try is filed by the next tick, as one asked for at the command line is — or, where `stopFirst`, by
      // a tick after the one that stops the step's blocked session.
      return c.json({ try: ask.try, file, stopFirst }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, 409);
      return c.json({ error: `Could not ask for another try of step '${step}': ${said}. \`wf retry ${id} ${step}\` asks the same way from the command line.` }, 502);
    }
  })
  // A person's ask for another round of a run's loop — the loop out of rounds, or held on a step of it past its budget, with the cap raised —
  // made by the package's `round()`, `wf round`'s own, which writes the ask file and nothing else; the next tick honours it once. Guarded as a
  // try is (guard.ts). Refused in the package's words, verbatim: a budget not above zero (400), before anything is decided of the run; a round
  // the loop may not go, or a budget not above what its steps have cost (`roundAsk`, 409).
  .post('/api/runs/:id/round', async (c) => {
    const id = c.req.param('id');
    const refused = refusedBeforeReading(roundGuard(id), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST …/round takes a JSON body: ${ROUND_SHAPE}.` }, 400);
    }
    const how = roundHowOf(body, id);
    if ('status' in how) return c.json({ error: how.error }, how.status);
    if (how.step !== undefined) {
      const found = taskOfStep(id, how.step);
      if ('error' in found) return c.json({ error: found.error }, 404);
    }
    try {
      const { ask, file } = await round(e, id, how.step, how.budget);
      // Accepted, and not yet done: the round is filed by the next tick, as one asked for at the command line is.
      return c.json({ step: ask.step, round: ask.round, file }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      // `roundAsk` refuses a budget not above zero first, whatever the run: a body that is not an amount, in its words.
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, how.budget !== undefined && !(how.budget > 0) ? 400 : 409);
      return c.json({ error: `Could not ask for another round of ${id}'s loop: ${said}. \`wf round ${id}\` asks the same way from the command line.` }, 502);
    }
  })
  // The board's third write: a person's words to a step's running session, through the package's `say()` — `wf say`'s own — which hands them
  // to the session through the engine, and the engine journals them: the api writes nothing, and the step's detail reads them back (`said`).
  // Guarded as a start and an ask are (guard.ts). Refused in the package's words, and the engine's, verbatim (409): a step not filed, settled,
  // or of a cancelled run; empty words; a session its harness does not list running. Words the harness did not take are the engine's error,
  // verbatim (502): nothing was journalled, and asking again may work.
  .post('/api/runs/:id/steps/:step/say', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(sayGuard(id, step), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST …/say takes a JSON body: ${SAY_SHAPE}.` }, 400);
    }
    if (!isObject(body)) return c.json({ error: `POST …/say takes a JSON object: ${SAY_SHAPE}.` }, 400);
    if (typeof body.text !== 'string') {
      return c.json({
        error: `\`text\` is the words to hand the step's session, as \`wf say ${id} ${step} "<words>"\` takes them: text. This request's was ${JSON.stringify(body.text) ?? 'left out'}: ${SAY_SHAPE}.`,
      }, 400);
    }
    try {
      const { said } = await say(e, id, step, body.text);
      // Accepted: the session's harness took the words, and the engine journalled them. Whether the session reads them is the session's.
      return c.json({ at: said.at, attempt: said.attempt, text: said.text } satisfies Said, 202);
    } catch (err) {
      const words = err instanceof Error ? err.message : String(err);
      return c.json({ error: words }, (err as { exitCode?: unknown }).exitCode === 2 ? 409 : 502);
    }
  })
  // The board's fourth write: a person's approval of a step waiting at its gate, through the package's `approve()` — `wf approve`'s own — which
  // writes the approval file and nothing else; the next tick files what waits on the step. Guarded as a try is (guard.ts). Refused in the
  // package's words, verbatim: words that are empty (`approvalWordsRefusal`, 422) before the run is read, and a step that may not be approved
  // (`approvalRefusal`, 409) after — not gated, not signed off yet, already approved, sent back, or of a run called off. Sending it back is
  // `POST …/retry` with a message, as `wf retry --message` is.
  .post('/api/runs/:id/steps/:step/approve', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(approveGuard(id, step), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST …/approve takes a JSON body: ${APPROVE_SHAPE}.` }, 400);
    }
    if (!isObject(body)) return c.json({ error: `POST …/approve takes a JSON object: ${APPROVE_SHAPE}.` }, 400);
    const { message } = body;
    if (message !== undefined && typeof message !== 'string') {
      return c.json({
        error: `\`message\` is the words to approve with, which every step after the gate is handed, as \`wf approve ${id} ${step} --message "<words>"\` takes them: text, or left out. This request's was ${JSON.stringify(message)}: ${APPROVE_SHAPE}.`,
      }, 400);
    }
    const empty = approvalWordsRefusal(message, `wf approve ${id} ${step}`);
    if (empty) return c.json({ error: empty }, 422);
    try {
      const { approval, file } = await approve(e, id, step, message);
      // Accepted, and not yet done: what waits on the step is filed by the next tick, as it is for an approval given at the command line.
      return c.json({ try: approval.try, at: approval.at, message: approval.message ?? null, file }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, 409);
      return c.json({ error: `Could not approve step '${step}': ${said}. \`wf approve ${id} ${step}\` approves the same way from the command line.` }, 502);
    }
  })
  // A step's session output as text, for `wf logs` parity. The board reads the conversation from the transcript routes below.
  .get('/api/runs/:id/steps/:step/log', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) return c.json({ lines: [], truncated: false } satisfies StepLog);
    try {
      return c.json(tailOf(await e.logs(taskId), LOG_LINES));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return c.json({
        error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads it the same way from the command line, with the error in full.`,
      }, 502);
    }
  })
  // One file of a step's files directory, by name and never by path (artifacts.ts), as its closeout's `artifacts` link it. Read on
  // each request and never kept: a step that runs again writes its files again.
  .get('/api/runs/:id/steps/:step/artifacts/:name', (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const name = c.req.param('name');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const refused = refusedName(name);
    if (refused) return c.json({ error: refused }, 400);
    const file = readArtifactFile(found.run, step, name);
    if (!file) {
      return c.json({
        error: `Step '${step}' of run '${id}' has no file '${name}' in its files directory. GET /api/runs/${id} gives the \`url\` of each file a step's closeout named that the api serves.`,
      }, 404);
    }
    return c.body(new Uint8Array(file.body), 200, {
      'Content-Type': file.type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // A step's file is an agent's text, served on the board's origin: an SVG opened in a tab runs no script of its.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
  })
  // A step's conversation, read once from a cursor: the engine's events for the step's current task, and whether it is live.
  .get('/api/runs/:id/steps/:step/transcript', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    // Not filed yet: nothing to read, and nothing of it moves until a tick files it.
    if (!found.taskId) return c.json({ events: [], cursor: null, live: false } satisfies StepTranscript);
    try {
      // An empty `after` is none: a reader with no cursor yet, read from the start.
      return c.json((await readTranscript(id, step, found.taskId, c.req.query('after') || undefined)) satisfies StepTranscript);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
  })
  // The same conversation followed, as server-sent events: read again every second while the task is live, each new event sent
  // as `transcript`, then `settled` once the task is, and the stream closed. A reconnect resumes from its Last-Event-ID.
  .get('/api/runs/:id/steps/:step/transcript/stream', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) {
      return c.json({ error: `Step '${step}' of run '${id}' is not filed yet, so it has no session to follow. GET /api/runs/${id} gives its task once a tick files it.` }, 404);
    }
    // An EventSource that reconnects sends the id of the last event it was sent; a first connection can say where to start.
    const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
    let read: Read;
    try {
      // Read before the stream opens, so a refused cursor or a lost task is an answer with a status, not an event.
      read = await readTranscript(id, step, taskId, after);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
    return streamSSE(c, async (stream) => {
      await send(stream, read);
      // Whether the last read failed. A failure is said once, and cleared with `readable` by the first read that works.
      let failing = false;
      while (read.live) {
        await stream.sleep(STREAM_EVERY_MS);
        // Nobody is reading: stop asking the engine. Each read observes the harnesses.
        if (stream.aborted) return;
        try {
          read = await readTranscript(id, step, taskId, read.cursor);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          // An answer about the conversation — its task gone from the engine's record — ends the stream: no read will change it.
          if (err instanceof Unread && err.status !== 502) {
            await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: false }) });
            return;
          }
          // Anything else is this read, not the conversation: a journal or a transcript that could not be opened this second
          // most likely can be the next. Read again on the next beat, from the same cursor, as a tick would.
          if (!failing) await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: true }) });
          failing = true;
          continue;
        }
        if (failing) await stream.writeSSE({ event: 'readable', data: '{}' });
        failing = false;
        await send(stream, read);
      }
      if (!stream.aborted) await stream.writeSSE({ event: 'settled', data: JSON.stringify({ cursor: read.cursor }), id: read.cursor });
    });
  });
