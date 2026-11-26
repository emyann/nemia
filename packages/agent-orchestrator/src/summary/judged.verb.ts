/**
 * What a run established, over one read of its tasks (`judge`): each step's word and note in `nemia ls`'s words, who is waited on and why,
 * where the run stands, whether it still moves, what it has cost, and what a person has to decide about its result. The board's reading
 * of a run, as the list and a run's page give it. A controller: it reads the run through `listReading` and its branches through
 * `branchStandings`.
 */
import type { Settings } from '../config/config.store.ts';
import { Clock, Effect } from 'effect';
import type { Actor, QueuedFor, QueuedTask, RunAssignee } from 'objects';

export type { RunAssignee };
import { type Engine, nameFor } from '../runtime-client.ts';
import { answerIn, onYouWords, queuedForOf } from '../list/list.ts';
import { listReading } from '../list/list.verb.ts';
import { type BranchReader, branchStandings, landedOf } from '../branches/branches.store.ts';
import { askedOf, branchesAsked, resultSteps } from '../branches/index.ts';
import { type BranchStanding, sendBackTo, type Spend, type SpendOf, spendKnown, spentWord } from '../status/status.ts';
import { closeoutOf, deniedOf, unreadOf } from '../views/views.verb.ts';
import { wordOfView } from '../views/views-words.ts';
import { holdAdvice, holdNeedsYou, holdWord, type ParentRun, type Wait, waitAdvice, waitWord } from '../wait/wait.ts';
import { type ToDecide, toDecideWords } from '../ending/ending.ts';
import type { Retry, RetryAsk } from '../retry/index.ts';
import type { Assessment } from '../tick/assess.ts';
import type { RunRead } from '../tick/told.verb.ts';
import type { Decision, Landed } from '../decide/decide.ts';
import { inFlight, type CheckoutHold } from '../cap/cap.ts';
import { type Assignee, isRepositoryRun, type Run } from '../record/record.ts';
import { assigneeStanding, assigneeWord, type AssigneeStanding } from '../assignee/assignee.ts';
import { asksOfAPerson, RUN_PHASE_IN_PLAY } from '../phase/phase.ts';
import { waitingSinceOf } from '../timeline/index.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { StepSpec } from '../step/step.ts';
import type { ConditionWriter } from '../program/program.ts';
import type { CheckVerdict } from '../check/index.ts';
import {
  runCodes,
  type AnswerVia,
  type CodedRun,
  type CodedStep,
  type RunPhase,
  type RunReason,
  type StepPhase,
  type StepReason,
  type WaitOn,
} from '../phase/phase.ts';
import { bare, judgedSteps, type Views } from './reads.verb.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or
 * at a gate — as the package decides it (`toDecide`) and words it (`toDecideWords`):
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval. `step` is that step, `filed` whether it has run,
 *            and `says` what it would do, the first line of the step's own note (`ownNote`) — null where it has none, and for a gated step
 *            that has signed off, whose closeout is what to read
 *   git      nothing waits at such a gate, every step finished, no step of the workflow merges, and `branches` are ahead of the base
 *            branch: merging or dropping them is a person's, by hand
 *
 * `said` is the whole of what `nemia ls` prints after `→ to decide:`, and `command` the command at the end of it — `nemia approve <run>
 * <step>`, or `nemia decide <run>` for the branches, which the board runs no more than `nemia ls` does.
 *
 * An approval carries what the Factory's card answers it with, off the record alone: `back`, the steps a send-back goes to (`sendBackTo`) —
 * the step itself once it has a task, and at an ending's gate, held before it is filed, the work it waits on — and `onto`, the base branch
 * the run's result is on its way to. Neither asks git anything, so the list the Factory polls can carry them.
 */
export type RunToDecide = (
  | (Extract<ToDecide, { kind: 'approve' }> & { back: string[]; onto: string | null })
  | Extract<ToDecide, { kind: 'result' }>
) & { said: string; command: string };

/**
 * What a person has to decide, as the board is given it: the package's own reading, with its words and the command that ends them. Null
 * where the package leaves it — a run still going, one called off, one whose ending has run, and a branch already on the base.
 */
function toDecideOf(run: Run, t: ToDecide | undefined, steps: readonly StepSpec[]) {
  if (!t) return null;
  const said = toDecideWords(run, t);
  if (t.kind === 'result') return { ...t, said, command: `nemia decide ${run.id}` };
  const step = steps.find((s) => s.name === t.step);
  return {
    ...t,
    back: step ? sendBackTo(step, run) : [t.step],
    onto: run.branch ?? null,
    said,
    command: `nemia approve ${run.id} ${t.step}`,
  };
}

/**
 * What sessions cost, as the package adds it up off the engine's `usage.costUsd` (`Spend`: `stepSpend`, `runSpend`): the dollars of the
 * attempts that ended with a cost on them, how many did (`measured`), and how many ended with none (`unmeasured`) — a session's cost is
 * known only once it ends, a job's with its result, and one killed first, or on a
 * model its harness could not price, has none. An attempt still running is in neither: what it has spent so far, as its harness last
 * said it, is `live` (its dollars and when it said them), absent where none at work said one. `said` is the package's word for it
 * (`spentWord`): `$4.20`, `≥$4.20` where an ended attempt has no cost on it, so a part never reads as the whole, and `$32.32 so far` with
 * the live figure added in. Null wherever no attempt was measured and none at work said a figure: a cost nobody measured is not $0.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; live?: { usd: number; at: string }; said: string };

/**
 * A spend as the board is given it (`Spent`), or null when nothing of it was measured.
 * @param spend The spend as it was measured.
 */
export const spentOf = (spend: Spend) =>
  spendKnown(spend)
    ? {
        usd: spend.usd,
        measured: spend.measured,
        unmeasured: spend.unmeasured,
        ...(spend.live ? { live: spend.live } : {}),
        said: spentWord(spend),
      }
    : null;

/**
 * What a run started `--after` still waits on, as `nemia ls` and `nemia decide` say it — never worded here.
 *
 * `runs` are the package's `waitsOf`: each run in `after` that has not succeeded or been released, and, for one that never
 * will without a person, why — the store has no such run (`missing`), it was cancelled, or it failed (`failed`). `word` is
 * what `nemia ls` prints on each root (`waitWord`), and `advice` the line `nemia decide` prints under it (`waitAdvice`). `waitingOnYou` is
 * whether a person has to act — some run of `runs` never succeeds on its own — which is when `nemia ls` prints `→ waiting on you:`
 * before the
 * advice.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; failed: boolean }>;
  word: string;
  advice: string;
  waitingOnYou: boolean;
};

/**
 * What a person's hold on a run says (`nemia hold <run> --until <run>`, `Run.hold`), as `nemia ls` and `nemia decide` say it — never worded
 * here.
 *
 * `at` is when the hold was put, as its file says it. `runs` are the package's `holdsOf`: each run the hold names that has not released it,
 * and, for one that never will without a person, why — as `RunWaiting.runs` has them — or, in the moment every one has released it and the
 * next tick has not yet lifted the hold, each of them `released`. `word` is what `nemia ls` prints under the run (`holdWord`), with the
 * person's
 * why and name when the hold has them, and `advice` the line
 * `nemia decide` prints under it (`holdAdvice`). `waitingOnYou` is whether the hold waits on a person: exactly when a run it names never
 * succeeds on its own, and false for a hold that names no run, which is the person's word already given (`holdNeedsYou`, the rule `nemia
 * ls`
 * prints the advice by). `runs` is empty for such a hold. A hold asks nothing of anyone while it stands:
 * every verb a step's word would take is refused while it stands (`heldRefusal`), so no step of a held run waits on you (`waitingOnYou`)
 * and nothing is offered.
 */
export type RunHolding = {
  at: string;
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; failed: boolean; released: boolean }>;
  word: string;
  advice: string;
  waitingOnYou: boolean;
  /** What the person who put the hold said of why (`nemia hold --why`), where they said it. */
  why?: string;
  /** Who the person who put the hold said they are, where they said it. */
  by?: string;
  /** Who put the hold (objects' `Actor`), where its file says. */
  actor?: Actor;
};

/**
 * What a person has to know to act on a step, in the package's words and the engine's, never worked out here.
 *
 * `needs` is the closeout's, for a step whose current try signed off blocked: its question. Null for any other step.
 *
 * A step whose harness marked its session blocked is said by its own codes, `AwaitingAnswer` via `session` (the engine's
 * `needs-human`, `atHarness`), which is no question of the step's, as when a session stops on a login that another process of its
 * harness is refreshing. What the session said last is on the run's detail alone: reading it observes the harness again, and the list
 * is read on every poll of the Factory for one observation.
 *
 * `waitingFor` is what that harness says the session waits for, where it says anything (`TaskView.waitingFor`, off the same
 * views — no observation of its own, unlike `lastLine`). Both halves are the package's words, never worded here: `words` is
 * the wait a card or a node says (`waiting for a permission prompt`), `advice` what a person does about it, naming the
 * session its harness lists it under, or for a step on a remote A2A agent the `nemia say` that answers its Task (`answerIn`). Said under
 * the wait, never with it — one sentence between them, and a surface with room for both. Null where the harness said nothing, and for a
 * step nothing blocked — read afresh on every request, so a session that stops waiting stops carrying it.
 *
 * `approve` is what `nemia ls` asks of you for a step waiting at its gate, on a run nobody called off and with no send-back asked for:
 * `approve plan` (`onYouWords`). Null for any other step — one not gated, not signed off yet, approved, or sent back.
 *
 * `denied` is what the harness denied the step's current try, off the engine's record of each ended attempt (`deniedOf`, the same views):
 * `calls`, each as a permission rule names it (`Skill(look)`, `Bash(pytest)`), once each in the order first denied, and `words`, the line
 * `nemia ls` and `nemia decide` say (`deniedWords`: five named, the rest counted). Beside the status, never in it: the status is the
 * sentence a person reads, and its codes (`StepCodes`) what a screen compares. Null for a step denied nothing — and for one whose harness
 * cannot say.
 *
 * `sessionUnread` is why the runtime could not read the step's session alone, in its words (`unreadOf`, off its view): the step is
 * neither working nor gone, and its status says nothing of it. Null for a step whose session was read — on the first request whose look
 * reads it, as nothing carries it.
 *
 * `queuedFor` is why the step's current task waits to start, its session's, else its check's, as the engine last judged it
 * (`queuedForOf`, off its view's `waits`): memory, a slot, or the store paused. Null where neither waits.
 */
export type StepNeeds = {
  needs: string | null;
  waitingFor: { words: string; advice: string } | null;
  approve: string | null;
  denied: { words: string; calls: string[] } | null;
  sessionUnread: string | null;
  queuedFor: { task: QueuedTask; wait: QueuedFor } | null;
};

/**
 * A run waited on that never lands without a person: what `nemia ls` prints `→ waiting on you:` for, and `waitAdvice` says is yours to
 * resolve.
 *
 * The package decides it (`neverSucceeds` in wait/wait.ts) and does not export it. Read here off `Wait`'s own contract — its id and, when
 * it may never succeed without a person, why — so any reason it carries counts, not only `missing`, `cancelledAt` and `failed`.
 */
const neverSucceeds = (w: Wait) => Object.entries(w).some(([key, why]) => key !== 'run' && why !== undefined);

/**
 * What a run still waits on (`RunWaiting`), in the package's words; null when it waits on no run.
 * @param run The run that waits.
 * @param waits The runs it waits on, as the reading found them; empty where it waits on none.
 */
function runWaitingOf(run: Run, waits: readonly Wait[]) {
  if (!waits.length) return null;
  return {
    runs: waits.map((w) => ({ run: w.run, missing: Boolean(w.missing), cancelledAt: w.cancelledAt ?? null, failed: Boolean(w.failed) })),
    word: waitWord(waits),
    advice: waitAdvice(run, waits),
    waitingOnYou: waits.some(neverSucceeds),
  };
}

/**
 * A person's hold on a run (`RunHolding`), in the package's words, what its person said of why and who they are (`why`, `by`), and who
 * put it (`actor`), each where its file says; null for a run nobody holds, and one called off.
 * @param run The run held.
 * @param holds The holds the reading found on it; empty where nobody holds it.
 */
function holdingOf(run: Run, holds: readonly Wait[]) {
  if (!run.hold || run.cancelledAt) return null;
  return {
    at: run.hold.at,
    runs: holds.map((w) => ({
      run: w.run,
      missing: Boolean(w.missing),
      cancelledAt: w.cancelledAt ?? null,
      failed: Boolean(w.failed),
      released: Boolean(w.released),
    })),
    word: holdWord(holds, run.hold),
    advice: holdAdvice(run, holds),
    waitingOnYou: holdNeedsYou(holds),
    ...(run.hold.why ? { why: run.hold.why } : {}),
    ...(run.hold.by ? { by: run.hold.by } : {}),
    ...(run.hold.actor ? { actor: run.hold.actor } : {}),
  };
}

/**
 * Where a run's assignee stands at `now` (`assigneeStanding`), from what its judgement read: whether the run asks anything of a person
 * (`asksOfAPerson`, which an assignee does not change), since when — the earliest open wait on a person, as the list dates it
 * (`waitingSinceOf`), or the assignment where the record dates none — and whether it is still in play. The one judgement of it: the
 * run's object serves it (`judge`), and the tick ends an assignee by it (`assigneesEnded`, tick.verb.ts), so the two never part.
 * @param assignee Who has the run, as its file says.
 * @param asks Whether the run asks anything of a person now.
 * @param asksSince When its present ask began, an ISO 8601 time; null where the record dates none.
 * @param inPlay Whether the run's phase is still in play.
 * @param now The instant judged at, in epoch milliseconds.
 */
export function assigneeStandingOf(assignee: Assignee, asks: boolean, asksSince: string | null, inPlay: boolean, now: number) {
  const parsed = Date.parse(assignee.at);
  const at = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  const since = asksSince === null ? NaN : Date.parse(asksSince);
  return assigneeStanding({
    at,
    forMs: assignee.forMs,
    asksSince: asks ? (Number.isSafeInteger(since) && since >= 0 ? since : at) : null,
    inPlay,
    now,
  });
}

/**
 * Who has a run in hand (`RunAssignee`), in the package's words: who, why, and when it comes back to the person if its ask is not
 * answered; null for a run nobody has in hand, and one whose assignee lapsed or ended (`standing`), though its file is still there.
 * @param assignee Who has the run, as its file says; undefined where nobody does.
 * @param standing Where that assignee stands now (`assigneeStandingOf`).
 */
export function runAssigneeOf(assignee: Assignee | undefined, standing: AssigneeStanding | null) {
  if (!assignee || standing?.kind !== 'stands') return null;
  const comesBackAt = standing.comesBackAt === null ? null : new Date(standing.comesBackAt).toISOString();
  return {
    at: assignee.at,
    forMs: assignee.forMs,
    comesBackAt,
    word: assigneeWord(assignee, comesBackAt),
    ...(assignee.name ? { name: assignee.name } : {}),
    ...(assignee.why ? { why: assignee.why } : {}),
    ...(assignee.actor ? { actor: assignee.actor } : {}),
  } satisfies RunAssignee;
}

/**
 * Who has run `run` in hand as it is judged now (`runAssigneeOf`): its assignee's standing read at the clock's now, timed from when its
 * present ask began (`waitingSinceOf`) where it asks anything of a person (`asksOfAPerson`); null for a run nobody has in hand.
 * @param run The run, with its assignee's file as the record reads it.
 * @param views The engine's views of its tasks, which date the end of a waiting step's last try.
 * @param steps The run's steps, in its workflow's order.
 * @param asked What the run asks of a person now: the steps waiting on you, the runs it waits on and its hold.
 * @param inPlay Whether the run's phase is still in play.
 */
const assigneeJudged = Effect.fnUntraced(function* (
  run: Run,
  views: Views,
  steps: readonly StepSpec[],
  asked: Pick<Parameters<typeof asksOfAPerson>[0], 'waitingOnYou' | 'waiting' | 'holding'> & { holding: { at: string } | null },
  inPlay: boolean,
) {
  if (!run.assignee) return null;
  const asks = asksOfAPerson({ ...asked, cancelledAt: run.cancelledAt, assignee: null });
  const since = asks ? waitingSinceOf(run, views, steps, asked.waitingOnYou, asked.holding?.waitingOnYou ? asked.holding.at : null) : null;
  const now = yield* Clock.currentTimeMillis;
  return runAssigneeOf(run.assignee, assigneeStandingOf(run.assignee, asks, since, inPlay, now));
});

/**
 * The engine's own word for a task — `working`, `needs-human`, `succeeded` — as `nemia ls` shows it (`wordOfView`): `unknown`
 * for a task the engine has no record of, which it folds to the state of one filed and waiting for a slot and calls `pending`, in flight;
 * and `succeeded` for a task held open that was closed after it signed, which it calls `between-attempts` until its next pass settles it.
 * @param views The engine's views of the tasks the request read.
 */
export const wordOf = (views: Views) => (taskId: string) => wordOfView(views.get(taskId));

/**
 * Where a step stands as codes, as the listing judged it (`Listing`'s `phase`, `reason`, `on`, `via` and `verdict`): `on` null but on a
 * `Waiting` step, `via` null but on an `AwaitingAnswer` one, and its check's verdict null where it was not judged by one.
 */
type StepCodes = {
  phase: StepPhase;
  reason: StepReason;
  on: WaitOn | null;
  via: AnswerVia | null;
  verdict: CheckVerdict | null;
};

/** A row's codes as a door carries them (`StepCodes`): what qualifies its reason null where nothing does. */
const doorCodes = (s: CodedStep & { verdict?: CheckVerdict }) => ({
  phase: s.phase,
  reason: s.reason,
  on: s.on ?? null,
  via: s.via ?? null,
  verdict: s.verdict ?? null,
});

/** A run's codes as a door carries them: what qualifies its reason null where nothing does. */
const runDoor = (c: CodedRun) => ({
  phase: c.phase,
  reason: c.reason,
  on: c.on ?? null,
  via: c.via ?? null,
});

/**
 * A run's word and codes as a door says them (`RunSummary`): `assess`'s status, and its phase and reason (`runCodes`).
 * @param judged The run's judgement, read down to its status, phase, reason and where it came from.
 */
export const runSaid = (judged: Pick<Judged, 'status' | 'phase' | 'reason' | 'on' | 'via'>) => ({
  status: judged.status,
  phase: judged.phase,
  reason: judged.reason,
  on: judged.on,
  via: judged.via,
});

/**
 * What `judged` holds of the step `name` in `of`, its codes or its words. Thrown for a step it did not judge, which a caller naming the
 * steps of the run it judged (`judgedSteps`) never asks for.
 */
const judgedOf = <T>(of: ReadonlyMap<string, T>, name: string) => {
  const held = of.get(name);
  if (held === undefined) throw new Error(`${name} is no step of the judged run: name one of the steps judge read of it (judgedSteps).`);
  return held;
};

/**
 * A step's word and codes as a door says them (`RunSummary`'s steps): its codes (`StepCodes`) and its word as `message`.
 * @param judged The step's judgement, read down to its codes and words.
 * @param name The step's name.
 */
export const stepSaid = (judged: Pick<Judged, 'codes' | 'words'>, name: string) => {
  const { phase, reason, on, via, verdict } = judgedOf(judged.codes, name);
  const word = judgedOf(judged.words, name);
  return { phase, reason, on, via, message: word, verdict };
};

/**
 * What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it
 * still moves.
 */
type Judged = {
  words: ReadonlyMap<string, string>;
  /** Each step's codes (`StepCodes`), beside its word: what a door carries and compares, the word being what a person reads. */
  codes: ReadonlyMap<string, StepCodes>;
  notes: ReadonlyMap<string, string | null>;
  /** The looping steps whose next round is due (`Listing`'s `roundDue`). */
  roundDue: ReadonlySet<string>;
  /**
   * What the reading says beside each step's word: what its harness waits for (`waits`), what its try was denied (`denied`), and how many
   * questions its closeout asks of a person it waits on (`asks`), and the run whose ending holds the checkout it waits on (`baseHeldBy`).
   */
  beside: ReadonlyMap<string, { waits?: string; denied?: string; asks?: number; baseHeldBy?: CheckoutHold }>;
  waitingOnYou: string[];
  /** `waitingOnYou` in `nemia ls`'s words (`onYouWords`), in the page's order: `approve plan` for a step at its gate. */
  waitingOnYouWords: string[];
  /**
   * What a person has to decide about the result (`toDecide`), as `listing` reads it off the branch standings it was given; null while
   * there is nothing.
   */
  toDecide: RunToDecide | null;
  /** The run in one word, as `assess` judged it: `failed` where a step broke, `awaiting approval` or `waiting` where a person stops it. */
  status: RunStatus;
  /**
   * Where the run is in its life, and why, as codes (`runCodes`): `Waiting` on `run` for a running run a person holds until a run lands
   * (`holding`), on `hold` for one held until a person lifts it, and
   * for a run a person's word stops, the reason and `via` of its first step that waits on them.
   */
  phase: RunPhase;
  reason: RunReason;
  on: WaitOn | null;
  via: AnswerVia | null;
  /**
   * The line `cancelPlan` draws for a finished run, which `status` does not: something in flight, or something a tick would still file — a
   * check, a try, a round due once a loop's looping step settled, or roots `assess` makes ready. Roots of a run waiting on runs are filed
   * once those land (`runReady`), which never happens on its own for one that never lands: the gate is the tick's, and `assess` does not
   * know it. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands. A held run's due is what it
   * files once its hold lifts, for a hold that lifts on its own; a hold that lifts only by a person's hand leaves nothing due. A record the
   * tick cannot read — no frozen workflow, its folder gone — has nothing filed for it, whatever its bare steps would make ready: the tick
   * fails on it.
   */
  moving: boolean;
  /** The runs its roots wait on (`runWaitingOf`). */
  waiting: RunWaiting | null;
  /** A person's hold on it (`holdingOf`). */
  holding: RunHolding | null;
  /** Who has it in hand, as it stands at the judgement's instant (`runAssigneeOf`); null where nobody does, or their time ran out. */
  assignee: RunAssignee | null;
  /** The tries people asked for that the next tick files, by step: `assess`'s, off their ask files. */
  asked: ReadonlyMap<string, Retry>;
  /** Every ask that carried a message, waiting or consumed (the Run door): what says a try was answered (`answerOf`). */
  answers: readonly RetryAsk[];
  /** What each task's sessions cost, off the views read (`spendReader`): what holds a step to its `budget:`. */
  spendOf: SpendOf;
  /** What the run has cost, every step's tries (`runSpend`); null until a cost was measured. */
  cost: Spent | null;
  /**
   * What is left for a person to do about the run (`decision`), on the same read as everything above, each branch on the base or not as
   * the judgement's `git` read it: what `nemia decide` and the api's decision answer from.
   */
  decision: Decision;
  /** What `assess` says of the run on that read (`Assessment`): each step's word, and the tries, rounds and checks due. */
  assessed: Assessment;
  /** The runs its roots wait on and the runs a person holds it until, as `waitsOf` and `holdsOf` read them, unworded. */
  waits: readonly Wait[];
  holds: readonly Wait[];
  /**
   * The run's one read the judgement was made on (`RunRead`), its checkout and standings with it: the readers of its tasks, so a reader of
   * the judgement reads no task again. Left out of what two judgements are compared by, as its readers are functions.
   */
  read: RunRead;
};

/**
 * Result branches this process has seen on their base branch, as `<run>/<branch>` — a run id has no slash, so the pair is unambiguous —
 * against the work the run had filed when git said so (`workFiled`).
 *
 * A branch merged into the base does not come off it again short of a history rewrite, and it is the answer that says there is nothing
 * left to decide: remembering it can only forget a decision, never invent one, which is the safe direction of the level-triggered rule
 * (the dangerous answer, `ahead`, is asked every time). A read's cache: a fresh process reads again.
 * It spares the store's long tail — finished runs whose branches are already on the base — a reading a branch on every poll of the list.
 *
 * The work is what the answer is remembered against, because the other way a branch grows is a person trying a finished run's step again:
 * a run whose branch had nothing on it past its base reads `on` too (`landedOver`'s `unchanged`), and its next try may commit. A try or a
 * round files a task, which the record carries, so the memo is dropped and the branch read afresh. What is left is a person committing
 * to a finished run's branch by hand, which nothing on the board or on `nemia decide` is told of: a fresh process reads it afresh.
 */
const onTheBase = new Map<string, { filed: string; landed: Landed }>();

/**
 * The work a run has filed, for the memo above: each result step's current task and how many tries are behind it. A try a person asked for,
 * or a round, files a task of its own, so this changes exactly when the work that could grow a result branch has been done again.
 */
const workFiled = (run: Run, steps: readonly StepSpec[]) =>
  resultSteps(steps)
    .map((s) => `${s.name}:${run.steps[s.name]?.taskId ?? ''}:${run.steps[s.name]?.tries?.length ?? 0}`)
    .join(' ');

/**
 * Where each of a run's result branches stands against the base branch, as `git` read it (`branchStandings`): what says a finished run
 * whose folder has no ending step is one nobody has decided (`toDecide`'s git kind).
 *
 * Asked of the branches `branchesAsked` names and of no other: those the tick's pass reads, of a run no longer running, nobody called off,
 * that cut worktrees of its own. Level-triggered, as the package is: read on the request that asks, off the tick's last reading, stored
 * nowhere but the memo of branches already on the base (`onTheBase`), so a branch a person merged by hand stops being one to decide with
 * nobody telling the run. A record whose branches cannot be read is no branch: git said nothing, and only a gate says there is something
 * to decide. A branch no reading has is unread, and decides nothing either.
 *
 * A branch known to be on the base is answered `on` without being read again. A folder run has no branch, and stands nowhere.
 *
 * `git` is the request's reader (`standingReader`, off `standing.json`). `asked`, where given, is told what was read of — the branches not
 * on the base, which only their tips can move, a branch on the base staying there as `onTheBase` has it; and whether a branch was unread or
 * the read failed (`failed`) — which is what the informer of each run's judgement watches (`InformerMemo`).
 * @param run The run whose branches are asked of.
 * @param steps The steps the run is judged by.
 * @param status The run's status, which says whether its branches are asked of at all.
 * @param git The request's reader of the branches.
 * @param asked Told what was read of, or undefined where nobody watches.
 */
export function standingsOf(run: Run, steps: readonly StepSpec[], status: RunStatus, git: BranchReader, asked?: GitAsked) {
  if (!isRepositoryRun(run)) return [] satisfies BranchStanding[];
  const filed = workFiled(run, steps);
  const branches = branchesAsked(askedOf(run, steps, status));
  if (!branches.length) return [] satisfies BranchStanding[];
  const known = (branch: string) => onTheBase.get(`${run.id}/${branch}`)?.filed === filed;
  try {
    const read = branchStandings(
      run,
      branches.filter((branch) => !known(branch)),
      git,
    );
    for (const stood of read)
      if (stood.where === 'on') onTheBase.set(`${run.id}/${stood.branch}`, { filed, landed: landedOf(run, git)(stood.branch) });
    asked?.branches.push(...read.filter((stood) => stood.where !== 'on').map((stood) => stood.branch));
    if (asked && read.some((stood) => stood.where === 'unread')) asked.failed = true;
    return branches.map(
      (branch) => read.find((stood) => stood.branch === branch) ?? { branch, where: 'on' as const },
    ) satisfies BranchStanding[];
  } catch {
    if (asked) asked.failed = true;
    return [] satisfies BranchStanding[];
  }
}

/**
 * Whether a branch of `run` is on its base (`Landed`), as `standingsOf` says it: off the memo of branches already on the base where it
 * holds the branch against the work filed (`onTheBase`), else as `git` reads it (`landedOf`). What the judgement's decision reads, so it
 * never says a branch landed or not where its standings say otherwise.
 * @param run The run whose branch is asked of.
 * @param steps The steps the run is judged by.
 * @param git The request's reader of the branches.
 */
const landedThrough = (run: Run, steps: readonly StepSpec[], git: BranchReader) => (branch: string) => {
  const kept = onTheBase.get(`${run.id}/${branch}`);
  return kept && kept.filed === workFiled(run, steps) ? kept.landed : landedOf(run, git)(branch);
};

/**
 * What `standingsOf` read for one run: the result branches not found on the base, and whether one was unread or the read failed
 * (`failed`).
 */
export type GitAsked = { branches: string[]; failed: boolean };

/**
 * What `judge` reads with: the request's reader (`seenBy`), which answers the run's tasks and those of the runs it waits on off the views
 * already read; the request's branch reader (`standingReader`), off the tick's last reading of where the branches stand; where the run's
 * result branches stand once its status is known (`standingsOf`), no branch read left out; and the runs it waits on and is held until as
 * the caller read them (`parentsRead`), read afresh left out.
 */
export type JudgeHow = {
  reader: Engine;
  git: BranchReader;
  standings?: (status: RunStatus, steps: readonly StepSpec[]) => readonly BranchStanding[];
  parent?: (id: string) => ParentRun;
  /** The settings the checkout's claim reads the cap on runs in flight from (`ListReadingHow`'s `config`); left out, the program's. */
  config?: Settings;
  /** The store's runs as the caller listed them, the checkout's claims read among them (`ListReadingHow`'s `store`); left out, listed. */
  store?: () => readonly Run[];
  /** Who writes each condition in the run's factory (`ListReadingHow`'s `writerOf`); left out, a step says no more than that it runs. */
  writerOf?: ((condition: string) => ConditionWriter) | undefined;
};

/**
 * What `nemia ls` says about each step, what `assess` says about the run, and whether the run still moves: the package's one reading of the
 * run (`listReading`), which `nemia ls` answers from too, over the views the request already has.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`, `unsigned`, `succeeded · BLOCKED`,
 * `rounds exhausted`, the engine's bare word while a step runs (`needs-human`), and
 * `unknown` for a task it has no record of — and so are the notes beside them; what the harness says a session waits for and what it was
 * denied are fields of the reading the board does not show here (`needsOf` says them). A step the page shows and the tick does not judge —
 * one a record names that has no frozen workflow and whose folder lacks it — is worded as a `bare` step, and has no say in the run's
 * status. A refused check's verdict is its exit off the engine's record (`exitVerdicts`), never a read of its logs on a poll. Beside each
 * word, its codes (`codes`): what the board and `needsOf` compare, never the word itself.
 *
 * The runs its roots wait on and the runs a person holds it until are each read once, through the request's reader: a root of a run
 * waiting on runs says `waiting on <run>`, and the run moves while each may still land — the tick files the roots when they do — and not
 * once one never will without a person. A held run moves as it would unheld while the hold may still lift on its own — the tick lifts it
 * once every run it names has landed, and files then what is due — and not once it lifts only by a person's hand: a run it names never
 * lands, or it names none. No slot is said — the board says the run slots over its Factory — and the run holding the repository's
 * checkout is read as the pass reads it (`listReading`): a try a person asked stands in `asked` while the checkout or the pause holds it.
 *
 * Where the run's result branches stand is asked once the run's status is known (`standings`): left out, no branch is read, only a gate
 * says a run is one nobody has decided, and a finished run whose branch nobody merged says there is nothing to decide.
 * Traced: its span is how a reader counts the runs judged. A warm list through the informer judges only the runs moving, so its trace
 * holds a few; a cold or verified one holds one per run.
 */
export const judge = Effect.fn('judge')(function* (
  run: Run,
  names: readonly string[],
  folder: readonly StepSpec[] | null,
  views: Views,
  { reader, git, standings = () => [], parent, config, store, writerOf }: JudgeHow,
) {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const read = yield* listReading(reader, run, {
    views,
    steps,
    shown,
    standings,
    git,
    landed: landedThrough(run, steps, git),
    ...(config ? { config } : {}),
    ...(parent ? { parent } : {}),
    ...(store ? { store } : {}),
    writerOf,
  });
  const { status, ready, check, retry, round } = read.assessed;
  const waiting = runWaitingOf(run, read.waiting);
  const holding = holdingOf(run, read.holding ?? []);
  const { hold: _, ...unheld } = run;
  const lifts = holding !== null && holding.runs.length > 0 && !holding.waitingOnYou;
  const due = lifts ? read.assessOf(unheld) : { ready, check, retry, round };
  const tickReads = Boolean(run.workflow ?? folder);
  const waitingOnYou = names.filter((name) => read.waitingOnYou.includes(name));
  const codes = runCodes(status, holding?.runs ?? null, read.steps);
  const assignee = yield* assigneeJudged(run, views, steps, { waitingOnYou, waiting, holding }, RUN_PHASE_IN_PLAY[codes.phase]);
  return {
    words: new Map(read.steps.map((s) => [s.name, s.message])),
    codes: new Map(read.steps.map((s) => [s.name, doorCodes(s)])),
    notes: new Map(read.steps.map((s) => [s.name, s.note ?? null])),
    roundDue: new Set(read.steps.filter((s) => s.roundDue).map((s) => s.name)),
    beside: new Map(read.steps.map(({ name, waits, denied, asks, baseHeldBy }) => [name, { waits, denied, asks, baseHeldBy }])),
    waitingOnYou,
    waitingOnYouWords: onYouWords({ steps: read.steps, waitingOnYou }),
    toDecide: toDecideOf(run, read.toDecide, steps),
    status,
    ...runDoor(codes),
    moving:
      inFlight(run, read.phaseOf).length > 0 ||
      (tickReads &&
        ((due.ready.length > 0 && !waiting?.waitingOnYou) || due.check.length > 0 || due.retry.length > 0 || due.round.length > 0)),
    waiting,
    holding,
    assignee,
    asked: new Map(read.assessed.due.retry.filter((r) => r.by === 'ask').map((r) => [r.step, r])),
    answers: read.answers,
    spendOf: read.spendOf,
    cost: spentOf(read.spend),
    decision: read.decision,
    assessed: read.assessed,
    waits: read.waiting,
    holds: read.holding ?? [],
    read: read.read,
  } satisfies Judged;
});

/**
 * Whether a step's codes say its harness stopped its session to ask, with no closeout signed off blocked: the engine's `needs-human`.
 * @param codes The step's codes: its reason, and how it was answered where it was.
 */
export const atHarness = (codes: { reason: StepReason; via?: AnswerVia | null }) =>
  codes.reason === 'AwaitingAnswer' && codes.via === 'session';

/** The name a step's harness lists its current try's session under (`nameFor`); null for a step with no task, or no attempt yet. */
const sessionOf = (taskId: string | null | undefined, view: ReturnType<Views['get']>) => {
  const attempt = view?.state.attempts.at(-1)?.n;
  return taskId && attempt !== undefined ? nameFor(taskId, attempt) : null;
};

/**
 * What a person has to know to act on a step (`StepNeeds`), off the views the request already read, with no observation of its own: its
 * current try's closeout, the engine's word for its task, and what the run established of it (`judge`) — for a step at its gate that waits
 * on you, what `nemia ls` asks of you, in its words (`onYouWords`). A wait is said only for a step the harness blocked, nothing else having
 * one for a person to answer: the words the reading put beside its status (`waits`), and the name its harness lists that session under
 * (`nameFor`). What its try was denied is the reading's words too (`denied`), with each call off the views (`deniedOf`), and why its
 * session alone was unread the runtime's (`unreadOf`).
 * @param run The run the step is of.
 * @param name The step's name.
 * @param views The engine's views of the tasks the request read.
 * @param judged The step's judgement, read down to its codes, whether it waits on you, and what it put beside its status.
 */
export function needsOf(run: Run, name: string, views: Views, judged: Pick<Judged, 'codes' | 'waitingOnYou' | 'beside'>) {
  const taskId = run.steps[name]?.taskId;
  const view = taskId ? views.get(taskId) : undefined;
  const said = view ? closeoutOf(views, run, name) : undefined;
  const codes = judgedOf(judged.codes, name);
  const reason = codes.reason;
  const atGate = reason === 'AwaitingApproval' && judged.waitingOnYou.includes(name);
  const { waits, denied } = judged.beside.get(name) ?? {};
  const words = atHarness(codes) ? waits : undefined;
  return {
    needs: said && !('error' in said) && said.outcome === 'blocked' ? said.needs || null : null,
    waitingFor: words
      ? {
          words,
          advice: answerIn(sessionOf(taskId, view), isRemoteHarness(view?.state.harness) ? { run: run.id, step: name } : undefined),
        }
      : null,
    approve: atGate ? (onYouWords({ steps: [{ name, reason }], waitingOnYou: [name] })[0] ?? null) : null,
    denied: denied && view && taskId ? { words: denied, calls: deniedOf(views)(taskId) } : null,
    sessionUnread: unreadOf(view),
    queuedFor: queuedOf(run, name, views),
  };
}

/**
 * Why a step's current task waits to start, as the engine last judged it: its session's wait, else its check's (`queuedForOf`), with
 * which; null where neither waits.
 * @param run The run the step is of.
 * @param name The step's name.
 * @param views The engine's views of the tasks the request read.
 */
const queuedOf = (run: Run, name: string, views: Views) => {
  const rec = run.steps[name];
  const of = (taskId: string | null | undefined) => queuedForOf(taskId ? views.get(taskId)?.waits : undefined);
  const session = of(rec?.taskId);
  if (session) return { task: 'session', wait: session } satisfies StepNeeds['queuedFor'];
  const check = of(rec?.check?.taskId);
  return check ? ({ task: 'check', wait: check } satisfies StepNeeds['queuedFor']) : null;
};
