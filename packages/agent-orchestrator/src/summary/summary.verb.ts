/**
 * Each run's summary, as the board's list gives it (`RunSummary`): its record, its steps judged in `nemia ls`'s words (`judge`), its graph,
 * what it cost and how long it has been at work; a run whose task's journal does not read answered off its record alone (`unjudged`). A
 * run is judged once (`Judgement`) and read through the informer (`informerRead`), which the daemon's pass fills: a run at rest is answered
 * from it while nothing it was judged on has moved, a moving one within the pass that judged it, so a poll reads the journals of the runs
 * still moving and of none other. A controller: it reads the store, the engine's journals and feed through the client, and where
 * branches stand off `standing.json` (`standingSnapshot`).
 */
import { Effect } from 'effect';
import type { StepSpec } from '../step/step.ts';
import type { Engine } from '../runtime-client.ts';
import { type AtWork, atWork, runStartedAt, type RunTokens, runTokens } from '../timeline/index.ts';
import { UNREADABLE, unjudgedWord, type UnjudgedWord } from '../views/views.verb.ts';
import { isRepositoryRun, type PlaceKind, placeOf, prunedWords, type Run } from '../record/record.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import type { Labels } from '../labels/labels.ts';
import type { Selectors } from '../watch/selector.ts';
import { runLabelMap, selectedRuns } from '../labels/labels.ts';
import { prunedKept } from '../forget/prune/prune.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';
import { informedJudgements, type InformerMemo, informerRead } from '../rest/informer.verb.ts';
import { type Judgement, type Judgements, judgementsOf, sameJudgement } from './judgement.verb.ts';
import { type RunGraph, runGraph } from './graph.ts';
import type { CardRun } from '../inbox/index.ts';
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
import { judgedSteps, stepNames, tryOf, type Unreadable, type Views, workflowsOf } from './reads.verb.ts';
import {
  needsOf,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunWaiting,
  type Spent,
  runSaid,
  stepSaid,
  type StepNeeds,
} from './judged.verb.ts';
import { StoreRoot } from '../config/root.store.ts';

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
  /**
   * The run's whole map (`runLabelMap`): the labels a person put on it (`nemia label run`), its `workflow`, and its `factory`, `default`
   * for the default factory — what a selector reads of the run, and `{ workflow, factory }` alone for a run nobody labelled.
   */
  labels: Labels;
  /** The agent it tried, for a try started from an agent's page (`tryOf`); null for every other run. */
  try: { agent: string } | null;
  createdAt: string;
  /**
   * When the run started (`runStartedAt`): its first task's filing, as the views of its judgement say it (`State.filedAt`) — for a run
   * started `--after` runs, or held for a run slot, well after `createdAt`. `createdAt` for a run started that is not judged, or none of
   * whose views says a filing; null while nothing of it is filed.
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
  holdUntil: string[];
  /**
   * The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. While it stands nothing of the run is
   * filed and nothing is asked of anyone: no step waits on you, and no verb is offered, as `nemia ls` says it.
   */
  holding: RunHolding | null;
  /**
   * The run in one word, as the feed and `nemia tick` say it: `running`, `succeeded`, `cancelled`; `failed` for a run in which a step
   * broke; `awaiting approval` for one stopped at its gates alone; `waiting` for one a person's word stops otherwise.
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
   * A run waiting on runs moves: the tick files its roots once they land. Not one waiting on a run that never lands without a
   * person — no such run, a cancelled one, a result branch gone (`RunWaiting.waitingOnYou`): nothing the tick reads will change on its own.
   * A held run the same: it moves as it would unheld while the hold may lift on its own (`RunHolding.waitingOnYou`), and files nothing
   * until then.
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
   * failed with its exit, unfinished, running — and null for any other.
   *
   * See `judge` for the one word of `message` it corrects. `note` is what `nemia ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (nemia retry --round) — …` — and null where it prints nothing. `roundDue`: whether a looping step's next
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
  waitingOnYouWords: string[];
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

/**
 * The fields of a run's row that are its judgement and not its record: where it stands (`status`, `phase`, `reason`, `on`, `via`), whether
 * it still moves, what it cost, how long it has been at work and the tokens it used, what it waits on and is held until, and what a person
 * has to decide. The list's row (`RunSummary`) and the run's object carry them from here alone (`judgedFields`).
 */
export type JudgedFields = Pick<
  RunSummary,
  'status' | 'phase' | 'reason' | 'on' | 'via' | 'moving' | 'cost' | 'atWork' | 'tokens' | 'waiting' | 'holding' | 'toDecide'
>;

/** What `judgedFields` reads of a run's judgement (`judge`). */
export type JudgedRun = Omit<JudgedFields, 'atWork' | 'tokens'>;

/**
 * A run's judged fields (`JudgedFields`): `judge`'s reading of the run as a door carries it (`runSaid`), and its time at work and tokens
 * off the views the judgement read (`atWork`, `runTokens`). The one assembly of them: the list's row and the run's object each call it.
 */
export function judgedFields(run: Pick<Run, 'steps'>, judged: JudgedRun, views: Views): JudgedFields {
  return {
    waiting: judged.waiting,
    holding: judged.holding,
    ...runSaid(judged),
    moving: judged.moving,
    cost: judged.cost,
    atWork: atWork(run, views),
    tokens: runTokens(run, views),
    toDecide: judged.toDecide,
  };
}

/**
 * A run's judged fields when nothing judges it (`unjudged`): `running` and moving, as the tick counts it in flight, with nothing measured,
 * waited on, held or to decide.
 */
export function unjudgedFields(): JudgedFields {
  return {
    waiting: null,
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
    toDecide: null,
  };
}

/** The agent each step of a run is given, by its name, off the workflow it is judged by (`judgedSteps`); null for a step given none. */
function agentsOf(run: Run, folder: readonly StepSpec[] | null): (name: string) => string | null {
  const steps = judgedSteps(run, folder);
  return (name) => steps.find((step) => step.name === name)?.agent?.name ?? null;
}

/** When the task of a run's step still at work started (`atWork` of that step alone); null while none of its tasks runs. */
function stepSince(run: Run, name: string, views: Views): string | null {
  const step = run.steps[name];
  return step ? atWork({ steps: { [name]: step } }, views).since : null;
}

/**
 * A run's summary but when it started, which is read off the feed on each request: off its judgement (`Judgement`), the one the run's
 * object reads too, so the list's row and the object say the run alike (Q18). Pure but for `home`, where a try's agent is read from.
 */
export function summaryOf({ run, names, steps, views, judged }: Judgement, home: string): Omit<RunSummary, 'startedAt'> {
  const agentOf = (name: string) => steps.find((step) => step.name === name)?.agent?.name ?? null;
  return {
    id: run.id,
    repo: run.repo ?? null,
    factory: run.factory ?? null,
    place: placeOf(run),
    work: isRepositoryRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    labels: runLabelMap(run),
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: [...(run.after ?? [])],
    context: [...(run.context ?? [])],
    ...judgedFields(run, judged, views),
    holdUntil: judged.holding && run.hold ? [...run.hold.until] : [],
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
    graph: runGraph(steps, names),
    waitingOnYou: judged.waitingOnYou,
    waitingOnYouWords: judged.waitingOnYouWords,
    unreadable: null,
  };
}

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
    labels: runLabelMap(run),
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: [...(run.after ?? [])],
    context: [...(run.context ?? [])],
    ...unjudgedFields(),
    holdUntil: run.hold && !run.cancelledAt ? [...run.hold.until] : [],
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      ...unjudgedCodes(wordOf(run.steps[name])),
      message: wordOf(run.steps[name]),
      verdict: null,
      note: null,
      roundDue: false,
      agent: agentOf(name),
      since: null,
      needs: null,
      waitingFor: null,
      approve: null,
      denied: null,
      sessionUnread: null,
    })),
    graph: runGraph(judgedSteps(run, folder), names),
    waitingOnYou: [],
    waitingOnYouWords: [],
    unreadable: said,
  };
}

/** Each of `runs` summarized off what was judged of it, or off its record where it was not judged (`unjudged`). */
const summariesOf = (runs: readonly Run[], judged: Judgements, home: string): Map<string, Omit<RunSummary, 'startedAt'>> =>
  new Map(
    runs.flatMap((run) => {
      const one = judged.runs.get(run.id);
      if (one === undefined) return [];
      return [
        [
          run.id,
          'judgement' in one ? summaryOf(one.judgement, home) : unjudged(run, judged.views, judged.unreadable, one.unjudged, home),
        ] as const,
      ];
    }),
  );

/**
 * Runs judged now, as the list judges them and never from the informer: for a write that must know whether one still moves (a try
 * started from an agent's page).
 */
export const judgedNow = Effect.fn('judgedNow')(function* (e: Engine, home: string, some: readonly Run[]) {
  const git = standingReader(yield* standingSnapshot());
  const summaries = summariesOf(some, yield* judgementsOf(e, home, some, git), home);
  return some.flatMap((run) => {
    const summary = summaries.get(run.id);
    return summary ? [summary] : [];
  });
});

/**
 * How the list reads: `home`, the store a person's files are read from; `memo`, the informer it answers from and keeps in (a fresh one
 * for a caller that keeps none, which judges every run); `verify`, whether each answer from memory is judged afresh too
 * (`WF_VERIFY_REST`); and `selectors`, the runs it lists, those whose whole map one of them takes (`selectedRuns`), every run where none
 * is given.
 */
export type SummaryHow = {
  home: string;
  memo: InformerMemo;
  verify: boolean;
  selectors?: Selectors;
};

/**
 * The store listed through the informer `memo`, as the list and the inbox read it: where branches stand, the informer's read, and every
 * run, a run whose files stamp as they did given as the run the informer kept. Every listed run stays in the informer, and no other.
 */
const listedThrough = Effect.fnUntraced(function* (e: Engine, memo: InformerMemo, verify: boolean) {
  const home = yield* StoreRoot;
  const git = standingReader(yield* standingSnapshot());
  const read = yield* informerRead(e, memo, verify, git, sameJudgement);
  const all = runsAtOnce(home).runs.list(undefined, read.given);
  read.only(all.map((run) => run.id));
  return { git, read, all };
});

/**
 * Every run of the store, in its order, listed through the informer `how.memo` as the list reads it (`listedThrough`): a run whose files
 * stamp as they did is the run the informer kept, its record not read. What the RunList selects and pages before it judges any run,
 * with the informer's read and where branches stand, which it judges the page through.
 */
export const storeRunsListed = Effect.fn('storeRunsListed')(function* (e: Engine, { memo, verify }: SummaryHow) {
  return yield* listedThrough(e, memo, verify);
});

/**
 * Every run's summary, in the store's order, as the board's list answers it: through `e`, each run's judgement read through the informer
 * `how.memo` (`informedJudgements`) — the one the daemon's pass fills and the run's object reads — and summarized off it (`summaryOf`),
 * verified as `how.verify` says, each run's start off the views of its judgement (`runStartedAt`). Dies where a verified answer differs
 * from the informer's (`answered`).
 *
 * The store is listed through the informer (`given`): a run whose files stamp as they did is listed as the run it kept, its record not
 * read, so a warm read costs the stamp walk and the records of the runs still moving alone. A verified read is given nothing and reads
 * every record afresh.
 */
export const runsSummarized = Effect.fn('runsSummarized')(function* (e: Engine, { home, memo, verify, selectors }: SummaryHow) {
  const { git, read, all } = yield* listedThrough(e, memo, verify);
  const runs = selectedRuns(all, selectors);
  const judged = yield* informedJudgements(e, home, runs, read, git, () => all);
  const summaries = summariesOf(runs, judged, home);
  return runs.flatMap((run): RunSummary[] => {
    const summary = summaries.get(run.id);
    const one = judged.runs.get(run.id);
    const views = one !== undefined && 'judgement' in one ? one.judgement.views : NO_VIEWS;
    return summary ? [{ ...summary, startedAt: runStartedAt(run, views) }] : [];
  });
});

/** The views of a run left unjudged: none, so its start is its `createdAt` once it has started (`runStartedAt`). */
const NO_VIEWS: Views = new Map();

/**
 * Each run a card was started from (`from.inbox`), with its phase as the list judges it, read through the informer `how.memo` as
 * `runsSummarized` reads it: the card's state once it has started (`cardState`). One listing gives both which runs name a card and their
 * phases, so a card whose run is listed always has its phase. A run that could not be judged reads `running`, as the list counts it
 * (`unjudgedFields`). Every listed run is kept in the informer, so a read of the inbox leaves the list's runs where they were.
 */
export const cardRuns = Effect.fn('cardRuns')(function* (e: Engine, { home, memo, verify }: SummaryHow) {
  const { git, read, all } = yield* listedThrough(e, memo, verify);
  const fromCards = all.filter((run) => run.from?.inbox !== undefined);
  const judged = yield* informedJudgements(e, home, fromCards, read, git, () => all);
  return fromCards.flatMap((run): CardRun[] => {
    const one = judged.runs.get(run.id);
    if (one === undefined) return [];
    const phase = 'judgement' in one ? one.judgement.judged.phase : unjudgedFields().phase;
    return [{ id: run.id, ...(run.from === undefined ? {} : { from: run.from }), phase }];
  });
});

/** A run whose record mounts volumes, as a Volume's status reads it: its id, its factory, its phase and the folders it mounts. */
export type MountingRun = Pick<Run, 'id' | 'factory'> & { phase: RunPhase; volumes: readonly { path: string; readOnly: boolean }[] };

/**
 * Every run whose record mounts a volume, judged through the informer `how.memo` as the cards' runs are (`cardRuns`): its phase, and the
 * volumes its record holds.
 */
export const mountingRuns = Effect.fn('mountingRuns')(function* (e: Engine, { home, memo, verify }: SummaryHow) {
  const { git, read, all } = yield* listedThrough(e, memo, verify);
  const mounting = all.filter((run) => (run.volumes?.length ?? 0) > 0);
  const judged = yield* informedJudgements(e, home, mounting, read, git, () => all);
  return mounting.flatMap((run): MountingRun[] => {
    const one = judged.runs.get(run.id);
    if (one === undefined) return [];
    const phase = 'judgement' in one ? one.judgement.judged.phase : unjudgedFields().phase;
    return [{ id: run.id, ...(run.factory === undefined ? {} : { factory: run.factory }), phase, volumes: run.volumes ?? [] }];
  });
});
