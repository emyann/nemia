/**
 * Each run's summary, as the board's list gives it (`RunSummary`): its record, its steps judged in `nemia ls`'s words (`judge`), its graph,
 * what it cost and how long it has been at work; a run whose task's journal does not read answered off its record alone (`unjudged`). A
 * run at rest is answered from the list's memo (`restingRead`) while nothing it was judged on has moved, so a poll reads the journals of
 * the runs still moving and of none other. A controller: it reads the store, the engine's journals and feed through the client, and where
 * branches stand off `standing.json` (`standingSnapshot`).
 */
import { Effect } from 'effect';
import type { Workflow } from '../step/step.ts';
import type { Engine } from '../runtime-client.ts';
import { type AtWork, atWork, runStartedAt, type RunTokens, runTokens } from '../timeline/index.ts';
import { UNREADABLE, unjudgedWord, type UnjudgedWord } from '../views/views.verb.ts';
import { isRepositoryRun, type PlaceKind, placeOf, prunedWords, type Run } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';
import { prunedKept } from '../prune/prune.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { type RestingMemo, restingRead } from '../rest/resting.verb.ts';
import { type RunGraph, runGraph } from './graph.ts';
import {
  codedStep,
  ENGINE_REASON,
  type AnswerVia,
  type RunPhase,
  type RunReason,
  type StepPhase,
  type StepReason,
  type WaitOn,
} from '../feed/index.ts';
import type { CheckVerdict } from '../check/check.ts';
import {
  filedTimes,
  type Filings,
  judgedSteps,
  judgedUnlessUnreadable,
  stepNames,
  tryOf,
  type Unreadable,
  type Views,
  viewsFor,
  viewsOf,
  workflowsOf,
} from './reads.verb.ts';
import {
  type GitAsked,
  judge,
  needsOf,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunWaiting,
  type Spent,
  standingsOf,
  runSaid,
  stepSaid,
  type StepNeeds,
} from './judged.verb.ts';

export type RunSummary = {
  id: string;
  /** The repository a repository run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  /** The factory the run was started in, as its record names it; null for a run in the default factory, whose record names none. */
  factory: string | null;
  /** The kind of workspace its steps work in: `git`, or `folder` for a team whose every step says `place: folder`. */
  place: PlaceKind;
  /** Where a folder run's work is (`workRoot`), which its card names in place of a repository; null on a repository run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from, as `nemia start` resolved it: its last segment names the workflow. */
  workflowDir: string;
  /** The agent it tried, for a try started from an agent's page (`tryOf`); null for every other run. */
  try: { agent: string } | null;
  createdAt: string;
  /**
   * When the run started (`runStartedAt`): its first task's filing, off the engine's feed — for a run started `--after` runs, or held for a
   * run slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is
   * filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That `nemia prune` removed the run's worktrees, and its files too once `--artifacts` did, in `nemia prune`'s words — what it removed
   * and what it kept — for the mark beside its status; null on a run never pruned.
   */
  pruned: { said: string } | null;
  /** The runs this one waits on (`nemia start --after`), as the record froze them at start: none for a run started without. */
  after: string[];
  /**
   * The runs this one is handed as context (`nemia start --from`, a card's `from:`), as the record froze them at start: never waited on,
   * so no line of the floor waits on one. None for a run started without.
   */
  context: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  /**
   * The runs a person holds this one until (`nemia hold <run> --until <run>`), as its hold file names them: none for a run nobody holds, or
   * one called off.
   */
  heldUntil: string[];
  /**
   * The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. While it stands nothing of the run is
   * filed and nothing is asked of anyone: no step waits on you, and no verb is offered, as `nemia ls` says it.
   */
  holding: RunHolding | null;
  /**
   * The run in one word, as the feed and `nemia tick` say it: `running`, `succeeded`, `cancelled`; `failed` for a run in which a step
   * broke; `awaiting approval` for one stopped at its gates alone; `blocked` for one a person's word stops otherwise.
   */
  status: RunStatus;
  /** Where the run is in its life (`RunPhase`), from its reason (`runCodes`): the code a screen groups it by, never parsed from `status`.
   */
  phase: RunPhase;
  /**
   * Why it is in that phase: the feed's code for its status, `Waiting` on `run` for a running run a person holds, and the reason of its
   * first step that waits on a person for a run a person's word stops (`runCodes`).
   */
  reason: RunReason;
  /** What a `Waiting` run waits on (`run`, a person's hold until other runs land); null for any other reason. */
  on: WaitOn | null;
  /** Where an `AwaitingAnswer` run's answer is asked, the step's it stopped on; null for any other reason, or where none is known. */
  via: AnswerVia | null;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   *
   * A run waiting on runs moves: the tick files its roots once they ship. Not one waiting on a run that never ships without a
   * person — no such run, a cancelled one, a result branch gone (`RunWaiting.onYou`): nothing the tick reads will change on its own.
   * A held run the same: it moves as it would unheld while the hold may lift on its own (`RunHolding.onYou`), and files nothing until then.
   */
  moving: boolean;
  /**
   * What the run has cost so far, every step's tries together, as `nemia ls` adds it up on the run's line (`runSpend`); null until a cost
   * was measured.
   */
  cost: Spent | null;
  /**
   * How long the run has been at work (`atWork`): the time any session or check of it ran, two at once counted once, and a wait at a gate,
   * a hold, a slot or another run counted for nothing — `since` while a task runs, from which the board counts on, and `endedAt` once none
   * does. Null for a run not judged (`unreadable`).
   */
  atWork: AtWork | null;
  /**
   * The tokens its sessions used, every try's, and their split by the cache, in the package's words (`runTokens`); null until a session
   * measured any, and for a run not judged.
   */
  tokens: RunTokens | null;
  /**
   * `phase` and `reason` are where the step stands, as codes (`StepPhase`, the feed's `StepReason`), computed where the listing judges
   * it (`lineOf`) and never parsed from a sentence; a screen groups and colours by them. `message` is what `nemia ls` prints for the step,
   * shown to a person and never compared. `verdict` is its check's, as codes (`CheckVerdict`), for a step judged by its check — passed,
   * failed with its exit, unfinished, running — and null for any other. `status` is `message` under its old name, kept for one card so a
   * reader of it keeps working, and compared by nothing: read `message`.
   *
   * `status` is what `nemia ls` prints for the step — see `judge` for the one word it corrects. `note` is what `nemia ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (nemia round) — …` — and null where it prints nothing. `roundDue`: whether a looping step's next
   * round is due, which its note words. `agent`: the agent the step is given, a hire's included, as the workflow it is judged by
   * resolves it (`judgedSteps`); null for a step given none. `since`: when the step's task still at work started (`atWork` of the step
   * alone), null while none of its tasks runs.
   */
  steps: Array<
    {
      name: string;
      taskId: string | null;
      branch: string | null;
      phase: StepPhase;
      reason: StepReason;
      /** What a `Waiting` step waits on (`WaitOn`); null for any other reason. */
      on: WaitOn | null;
      /** Where an `AwaitingAnswer` step's answer is asked (`AnswerVia`); null for any other reason. */
      via: AnswerVia | null;
      message: string;
      verdict: CheckVerdict | null;
      /** @deprecated `message` under its old name, kept for one card: read `message`. */
      status: string;
      note: string | null;
      roundDue: boolean;
      agent: string | null;
      since: string | null;
    } & StepNeeds
  >;
  /** The steps as a graph, as the run's page has it (`runGraph`): the Factory's card draws its flow off it, with no read of the run. */
  graph: RunGraph;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget — on a run nobody has called off.
   */
  waitingOnYou: string[];
  /**
   * `waitingOnYou` as `nemia ls` names it after `→ waiting on you:` (`onYouWords`), one entry a step, in its order: the step's name — and
   * for a step at its gate, what is asked of you, `approve plan`.
   */
  onYou: string[];
  /**
   * What a person has to decide about the run's result, when the run is at it and nobody has (`RunToDecide`); null while there is nothing.
   */
  toDecide: RunToDecide | null;
  /**
   * Why the run is not judged, when a task it reads — its own, or one of a run it waits on — has a journal that does not read, in the
   * runtime's words; null for every run whose tasks read. Such a run is answered off its record alone (`unjudged`), as the tick leaves it
   * where it is and counts it in flight: `running`, moving, its steps as the engine last read them and the unreadable one `unreadable`,
   * nothing waiting on you and nothing to decide.
   */
  unreadable: string | null;
};

/** The agent each step of a run is given, by its name, off the workflow it is judged by (`judgedSteps`); null for a step given none. */
function agentsOf(run: Run, folder: readonly Workflow[] | null): (name: string) => string | null {
  const steps = judgedSteps(run, folder);
  return (name) => steps.find((step) => step.name === name)?.agent?.name ?? null;
}

/** When the task of a run's step still at work started (`atWork` of that step alone); null while none of its tasks runs. */
function stepSince(run: Run, name: string, views: Views): string | null {
  const step = run.steps[name];
  return step ? atWork({ steps: { [name]: step } }, views).since : null;
}

/** A run's summary but when it started, which is read off the feed on each request, and what git was asked for it. */
type Judged = { summary: Omit<RunSummary, 'startedAt'>; asked: GitAsked };

const summarize = Effect.fnUntraced(function* (run: Run, views: Views, reader: Engine, git: BranchReader, home: string) {
  const folder = workflowsOf(run, home).steps;
  const names = stepNames(run, folder);
  const asked: GitAsked = { branches: [], failed: false };
  const agentOf = agentsOf(run, folder);
  const judged = yield* judge(run, names, folder, views, {
    reader,
    git,
    standings: (status, steps) => standingsOf(run, steps, status, git, asked),
  });
  const summary = {
    id: run.id,
    repo: run.repo ?? null,
    factory: run.factory ?? null,
    place: placeOf(run),
    work: isRepositoryRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: run.after ?? [],
    context: run.context ?? [],
    waiting: judged.waiting,
    heldUntil: judged.holding ? run.hold!.until : [],
    holding: judged.holding,
    ...runSaid(judged),
    moving: judged.moving,
    cost: judged.cost,
    atWork: atWork(run, views),
    tokens: runTokens(run, views),
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      ...stepSaid(judged, name),
      note: judged.notes.get(name) ?? null,
      roundDue: judged.roundDue.has(name),
      agent: agentOf(name),
      since: stepSince(run, name, views),
      ...needsOf(run, name, views, judged),
    })),
    graph: runGraph(judgedSteps(run, folder), names),
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
    unreadable: null,
  };
  return { summary, asked } satisfies Judged;
});

/**
 * A step's codes on a run left unjudged, off its word (`unjudgedWord`): `failed` with `Unknown` for the step a task of which does not read
 * (`unreadable`), which nothing judges; any other the engine's word for its task (`ENGINE_REASON`), `pending` for none filed.
 */
function unjudgedCodes(word: UnjudgedWord): {
  phase: StepPhase;
  reason: StepReason;
  on: WaitOn | null;
  via: AnswerVia | null;
} {
  if (word === UNREADABLE) return { phase: 'failed', reason: 'Unknown', on: null, via: null };
  const { phase, reason, on, via } = codedStep(ENGINE_REASON[word]);
  return { phase, reason, on: on ?? null, via: via ?? null };
}

/**
 * A run a task of which does not read, or whose unfrozen folder does not load, answered off its record: what it asked, where, its steps
 * and their graph, and each step's word off the views that did read — `unreadable` for a step any task of which does not, its check's or
 * an earlier try's among them (`unjudgedWord`) — with `said` as `unreadable`. Nothing judged: the tick does not advance it either, and
 * counts it in flight, so it is `running` and moving until the journal reads, or the folder loads, again.
 */
function unjudged(run: Run, views: Views, unreadable: Unreadable, said: string, home: string): Omit<RunSummary, 'startedAt'> {
  const folder = workflowsOf(run, home).steps;
  const names = stepNames(run, folder);
  const wordOf = unjudgedWord(views, unreadable);
  const agentOf = agentsOf(run, folder);
  return {
    id: run.id,
    repo: run.repo ?? null,
    factory: run.factory ?? null,
    place: placeOf(run),
    work: isRepositoryRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: run.after ?? [],
    context: run.context ?? [],
    waiting: null,
    heldUntil: run.hold && !run.cancelledAt ? run.hold.until : [],
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
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      ...unjudgedCodes(wordOf(run.steps[name])),
      message: wordOf(run.steps[name]),
      verdict: null,
      status: wordOf(run.steps[name]),
      note: null,
      roundDue: false,
      agent: agentOf(name),
      since: null,
      needs: null,
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
      sessionUnread: null,
    })),
    graph: runGraph(judgedSteps(run, folder), names),
    waitingOnYou: [],
    onYou: [],
    toDecide: null,
    unreadable: said,
  };
}

/**
 * A run judged, or answered off its record (`unjudged`) when its unfrozen folder does not load or a task it reads does not
 * (`judgedUnlessUnreadable`).
 */
const judgedOrNot = Effect.fnUntraced(function* (
  run: Run,
  views: Views,
  unreadable: Unreadable,
  reader: Engine,
  git: BranchReader,
  home: string,
) {
  const one = yield* judgedUnlessUnreadable(run, unreadable, () => summarize(run, views, reader, git, home));
  return 'judged' in one ? one.judged : { unjudged: unjudged(run, views, unreadable, one.unreadable, home) };
});

/**
 * Runs judged now, as the list judges them and never from its memo: for a write that must know whether one still moves (a try started
 * from an agent's page).
 */
export const judgedNow = Effect.fn('judgedNow')(function* (e: Engine, home: string, some: readonly Run[]) {
  const { views, reader, unreadable } = yield* viewsFor(e, some);
  const git = standingReader(yield* standingSnapshot());
  const out: Array<Omit<RunSummary, 'startedAt'>> = [];
  for (const run of some) {
    const one = yield* judgedOrNot(run, views, unreadable, reader, git, home);
    out.push('unjudged' in one ? one.unjudged : one.summary);
  }
  return out;
});

/**
 * Whether a run's summary may be kept (`restingRead`): a run at rest, which nothing but a person, git or the engine's journals can move.
 * Its status not `running` or the run pruned, nothing of it moving, waited on or held, every task it has filed settled, the workflow it is
 * judged by frozen on its record — a folder on disk is watched by nothing — and git's every answer given. The tick's own test (`atRest`
 * in the package's rest.ts) reads what a pass would file; this reads what the list says, which is what it keeps.
 */
const atRest = Effect.fnUntraced(function* (run: Run, judged: Judged, reader: Engine) {
  const { summary, asked } = judged;
  if (!run.workflow || run.hold || asked.failed || summary.moving || summary.waiting || summary.holding) return false;
  if (!run.pruned && summary.status === 'running') return false;
  return [...(yield* viewsOf(run, reader)).values()].every((view) => view.state.settled);
});

/**
 * How the list reads: `home`, the store a person's files are read from; `memo`, the memo of runs at rest it answers from and keeps in;
 * `filings`, the feed's filing times it reads on from; and `verify`, whether each answer from memory is judged afresh too
 * (`WF_VERIFY_REST`).
 */
export type SummaryHow = {
  home: string;
  memo: RestingMemo<Omit<RunSummary, 'startedAt'>>;
  filings: Filings;
  verify: boolean;
};

/**
 * Every run's summary, in the store's order, as the board's list answers it: through `e`, off `how.memo` (`restingRead`), verified as
 * `how.verify` says. Dies where a verified answer differs from the memo's (`answered`).
 *
 * The store is listed through the memo (`given`): a run whose files stamp as they did is listed as the run the memo kept, its record not
 * read, so a warm read costs the stamp walk and the records of the runs still moving alone. A verified read is given nothing and reads
 * every record afresh.
 */
export const runsSummarized = Effect.fn('runsSummarized')(function* (e: Engine, { home, memo, filings, verify }: SummaryHow) {
  const git = standingReader(yield* standingSnapshot());
  const read = yield* restingRead(e, memo, verify, git);
  const runs = runStore.runs.list(undefined, read.given);
  read.only(runs.map((run) => run.id));
  const filed = yield* filedTimes(e, filings);
  const kept = new Map<string, Omit<RunSummary, 'startedAt'>>();
  const toJudge: Run[] = [];
  for (const run of runs) {
    const answer = read.kept(run);
    if (answer) kept.set(run.id, answer);
    if (!answer || read.verify) toJudge.push(run);
  }
  const { views, reader, unreadable } = yield* viewsFor(e, toJudge, () => runs);
  const judged = new Map<string, Judged>();
  const notJudged = new Map<string, Omit<RunSummary, 'startedAt'>>();
  for (const run of toJudge) {
    const one = yield* judgedOrNot(run, views, unreadable, reader, git, home);
    if ('unjudged' in one) {
      notJudged.set(run.id, one.unjudged);
      kept.delete(run.id);
      read.drop(run);
      continue;
    }
    judged.set(run.id, one);
    read.answered(run, one.summary);
    if (kept.has(run.id)) continue;
    if (yield* atRest(run, one, reader)) read.keep(run, one.summary, one.asked.branches, git.heads);
    else read.drop(run);
  }
  const summaries: RunSummary[] = runs.map((run) => {
    const summary = judged.get(run.id)?.summary ?? notJudged.get(run.id) ?? kept.get(run.id)!;
    if (kept.has(run.id)) read.hit();
    return { ...summary, startedAt: runStartedAt(run, filed) };
  });
  return summaries;
});
