/**
 * What `nemia ls` shows of a run and each of its steps (`listing`), and the words it and the board say of a wait: a harness's
 * (`waitingWords`, `harnessWaitLine`), a denial's (`deniedWords`), a person's (`onYouWords`). Pure.
 */
import { gated, hasStarted, holdAdvice, holdWord, waitAdvice, waitWord, type Wait } from '../wait/wait.ts';
import { slotWord, type CheckoutHold, type RunSlot } from '../cap/cap.ts';
import { checkoutWord, LANDED_CAP, landedWords, onBaseNote, toDecideWords, type ToDecide } from '../ending/ending.ts';
import type { Workflow } from '../step/step.ts';
import type { EnginePhase } from '../views/views-words.ts';
import {
  DENIED_CAP,
  DENIED_SHOWN,
  oneLine,
  satisfiesAfter,
  type CloseoutAsked,
  type Run,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { checkVerdictOf, verdictWord, type CheckVerdict, type Verdict } from '../check/check.ts';
import { codedStep, ENGINE_REASON, REASON_OF, type CodedStep, type QualifiedStep } from '../phase/phase.ts';
import { answerOf, dueNote, modeWord, retriesDue, tryNote, HOLDS_THE_RUN, type RetryAsk } from '../retry/index.ts';
import {
  acceptanceOf,
  approvedFirst,
  budgetOf,
  heldByCheckout,
  loopOver,
  overBudget,
  resultOnBase,
  roundSpans,
  runSpend,
  sendBackTo,
  spentWord,
  standing,
  stepSpend,
  unheld,
  type BranchStanding,
  type RoundAsk,
  type SpendOf,
  budgetWord,
  durationWord,
} from '../status/status.ts';
import { acceptedNote, exhaustedNote, heldLater, heldNote, roundDueNote, roundsDue } from '../round/round.ts';
import { saidWord } from '../say/say.ts';
import { askedQuestions } from '../question/index.ts';
import { assess } from '../tick/assess.ts';
import { neverApproved } from '../prune/prune.ts';
import { daemonLine, staleAfterMs, type DaemonStanding } from '../daemon/daemon.ts';
import type { Paused } from '../pause/pause.ts';
import { fireWord, scheduleLines, type ScheduleListed } from '../schedule/schedule.ts';

export type Listing = {
  /**
   * One line per step: its name, what to say about it, and the branch it is on — and, only for a step tried
   * again or about to be, `note`: the try it is on and how it got there (`tryNote`), or the try due (`dueNote`).
   * Beside the status and never in it, so the words stay the vocabulary a reader of them keys on: so are `waits`, what the harness says a
   * `needs-human` session waits for (`waitingWords`), and `denied`, what its current try was denied (`deniedWords`), which `nemia ls`
   * prints in the line (`shownStatus`, `shownNote`) and the board does not. `roundDue`, only on a looping step whose next round is due
   * (`roundsDue`) and which no retry takes first: what its note words as `roundDueNote`. `asks`, only on a step waiting on a person whose
   * closeout asks questions: how many (`askedQuestions`), which `nemia ls` counts in the note and `nemia decide` prints whole.
   *
   * `reason` and `phase` are where the step stands as codes (`StepReason`, `StepPhase`), with `on`, what a `Waiting` step waits on, and
   * `via`, where an `AwaitingAnswer` step's answer is asked (`CodedStep`), set here from the facts the row's word is built from and never
   * read back off it: what every door carries and compares, the word (`status`) being the message a person reads.
   * `verdict`, only on a step judged by its check: that check's, as codes (`CheckVerdict`).
   */
  steps: Array<
    CodedStep & {
      name: string;
      status: string;
      verdict?: CheckVerdict;
      branch: string | null;
      note?: string;
      cost?: string;
      waits?: string;
      denied?: string;
      roundDue?: true;
      asks?: number;
    }
  >;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, or awaiting approval, with no try due — on a run nobody has
   * called off, pruned or held.
   */
  waitingOnYou: string[];
  /**
   * The runs a person holds this run until (`Run.hold`, `holdsOf`): while the hold stands, nothing is asked of anyone, and `nemia ls` says
   * `held until <run> ships` where it would say who the run waits on (`holdWord`). Absent on a run nobody holds, or one called off; empty
   * on a hold whose file names no run, which `Run.hold` still says.
   */
  holding?: Wait[];
  /** The runs this run's roots wait on (`waitsOf`): none once it has started, or on a run nobody has called off. */
  waiting: Wait[];
  /**
   * The cap on runs in flight holding this run, and the count it is held at (`heldRuns`): absent unless it holds a run with nothing filed.
   */
  slot?: RunSlot;
  /**
   * What the run has cost so far, every step's ended tries together (`runSpend`): `$12.40`, and `≥$12.40` where an ended attempt has no
   * cost on it. Absent until a cost was measured. Each step's own is `cost` on its line, beside its word — and in it, for a step at its
   * budget.
   */
  cost?: string;
  /**
   * What a person has to decide about the run's result (`toDecide`), as `assess` reads it on the same inputs: its ending step's gate, or
   * its branch ahead of the base with no ending step to take it. Absent while there is nothing — which is every run still going.
   */
  toDecide?: ToDecide;
};

/** A run left unjudged (`unjudgedOf` in list.verb.ts): why, in one sentence, and each step's word with the branch it works on. */
export type Unjudged = { said: string; steps: Array<{ name: string; status: string; branch?: string }> };

/**
 * `nemia ls`'s answer (`runsListed` in list.verb.ts): each run with its record, judged or left unjudged, and its result branches
 * (`resultBranches`); whether a nemia up ticks the store; when the tick's last pass read where the branches stand (`standing.json`), or
 * that none has; while the store is paused, the pause and the checks it holds; and the factories' schedules.
 */
export type RunsListed = {
  runs: Array<{ run: Run; listed: Listing | Unjudged; result: string[] }>;
  daemon: DaemonStanding;
  standing: ListedStanding;
  paused?: Paused;
  /** The factories' schedules (`schedulesListed`), each with its next fire and last scheduled run; none listed where none is declared. */
  schedules?: ScheduleListed[];
};

/** When the tick's last pass read where the branches stand, as `standing.json` says (`at`), or that no pass has (`none`). */
export type ListedStanding = { at: string } | { none: true };

/**
 * `nemia ls`'s line on where the branches it shows stand, at `now`: none while a daemon ticks and its last reading is within
 * `staleAfterMs` of its interval; how long ago it was read where it is older, or nothing ticks; and that it is not read where no pass has
 * read it, with what reads it.
 */
export function standingLine(standing: ListedStanding, daemon: DaemonStanding, now: number): string | undefined {
  if ('none' in standing) return 'where branches stand: not read — nemia up reads them';
  const age = now - Date.parse(standing.at);
  if (daemon.kind === 'ticking' && age <= staleAfterMs(daemon.file.every)) return undefined;
  return `where branches stand: read ${durationWord(age)} ago`;
}

/**
 * The engine's word for a task as `listing` reads it: one of its phases (`engineWord`), `unknown` for a task it has no record of, or the
 * `running` the feed folds a session's live words into (`feedPhase`).
 */
export type ListedPhase = EnginePhase | 'unknown' | 'running';

/** What `listing` reads a run's steps off: the run, the engine's words for its tasks, and what people and git said of it. */
export interface ListingInput {
  /** The run's steps, as the frozen folder names them, in its order. */
  readonly steps: readonly Workflow[];
  /** The run whose steps are listed. */
  readonly run: Run;
  /** The engine's own word for a task's phase — `working`, `needs-human` — shown as-is. */
  readonly phaseOf: (taskId: string) => ListedPhase;
  /** Each step's closeout, or the error that kept it from being read. */
  readonly closeoutOf: (step: string) => Closeout | { error: string } | undefined;
  /** Whether a task was asked its closeout, and what it was asked. */
  readonly askedCloseout?: (taskId: string) => CloseoutAsked;
  /** What a refused check exited with, as its log tells it. */
  readonly verdictOf?: (step: string) => Verdict | undefined;
  /** What people asked for with `nemia retry`, and the run has not consumed yet. */
  readonly asks?: readonly RetryAsk[];
  /** What people asked for with `nemia round`, and the run has not consumed yet. */
  readonly roundAsks?: readonly RoundAsk[];
  /** Every ask that carried a message, waiting or consumed (`readAnswers`): what says a step's try was answered (`answerOf`). */
  readonly answers?: readonly RetryAsk[];
  /** The runs this run waits on that have not shipped (`waitsOf`): what its roots say where `waiting` would be. */
  readonly waits?: readonly Wait[];
  /**
   * How many times a person said something to each step's current try while it ran (`nemia say`), off the engine's `said` on its
   * task.
   */
  readonly saidTo?: (step: string) => number;
  /** What each task's sessions cost (`taskSpend`): a step over its budget, or ended at it, with the amounts. */
  readonly spendOf?: SpendOf;
  /** The cap on runs in flight holding this run (`heldRuns`), if it does: what its roots say where `waiting` would be. */
  readonly slot?: RunSlot;
  /**
   * Where each result branch stands against the base branch, as git says it on this pass (`branchStandings` in
   * branches.store.ts): what says a finished run is one nobody has decided.
   */
  readonly standings?: readonly BranchStanding[];
  /**
   * The run whose `workspace: main` step is in the repository's own checkout while this run's waits for it (`checkoutHold` in
   * ending.verb.ts): what this run's ending says where `waiting` would be.
   */
  readonly checkout?: CheckoutHold;
  /**
   * What the harness says a blocked session waits for, in its own words (`TaskView.waitingFor`): the row's `waits` beside
   * the engine's `needs-human`. **Beside the word, never in it.** `phaseOf` is compared for `needs-human` exactly, here and in
   * `harnessBlocked` (views.verb.ts), and a row says it as its reason (`AwaitingAnswer`, `via: 'session'`), which the api and the board
   * compare; the status stays the engine's bare word, and only what `nemia ls` prints gains the harness's (`shownStatus`).
   */
  readonly waitingOf?: (taskId: string) => string | undefined;
  /**
   * What each task's sessions were denied, as permission rules name them (`deniedOf` in views.verb.ts): the row's `denied`,
   * `denied: Skill(look), Bash(pytest)` (`deniedWords`), for the step's current try, and neither in its status nor its note; `nemia ls`
   * prints it last in the note (`shownNote`), and the api carries the list as a field of its own (`StepNeeds.denied`).
   */
  readonly deniedOf?: (taskId: string) => readonly string[];
  /**
   * The runs a held run waits on to ship, as `holdsOf` reads them: said where `waiting on you` would be (`holdWord`). Left out,
   * the runs the hold names, each taken as one that may still ship.
   */
  readonly holds?: readonly Wait[];
}

/**
 * What `nemia ls` shows for each step of a run. Pure, like `decision`, and tested the same way.
 *
 * The words are `stepStatus`'s, so the list says what the run established and not only what the
 * engine settled: `verified ✓`, `checking`, `failed ✗ check (exit 1)`, `unsigned` — and `unverified`
 * for a step whose only evidence is its own word, on every line where that is true, because a step
 * nobody checked must not pass for one somebody did.
 *
 * Where the run has no verdict of its own, the step's closeout goes beside the word — `closeout unreadable`
 * for one nobody can read. A step that stopped itself `blocked` ended its session as cleanly as one that
 * finished the work, so the engine's phase reads `succeeded` for both; `BLOCKED` is shouted beside it, in
 * the word `nemia decide` uses. A step still running shows the engine's own word for it, and a session whose
 * word is exactly `needs-human` what the harness says it waits for (`waitingWords`). Nothing is inferred
 * for a step with no closeout — a missing closeout is not a claim that the work was done, and a run with
 * none still lists. A cap reached says what was spent and the cap in force; a looping step held on another
 * step's budget shows that step's.
 *
 * One line per step, deliberately. The summary, `needs` and a check's output were written for
 * `nemia decide`, where there is room to read them; here they would turn a list into a report.
 *
 * Who a run waits on is asked again here, so a caller's stale list cannot say a run that started, or was
 * called off, waits on a run or a slot. A root not filed names them, and an ending step approved and not
 * filed names the run whose step has the checkout (`checkoutWord`). The engine's word for a settled task
 * is its outcome, and `input-required` reads as it signed (`phaseOfView`), while its line prints the word.
 *
 * Nothing waits on a person for a step the next tick tries again, nor for a loop going round again, and
 * none of either is due on a run cancelled, pruned or held, whose `waitingOnYou` is empty. A step a round
 * due files again reads no budget hold (`roundSpans`); an ending whose work is sent back reads `waiting`
 * (`unheld`); and an ending at its gate whose result git already has waits on nobody, its note saying
 * where the branch stands (`resultOnBase`).
 *
 * A step's note says, in order: its try, or the try, round or send-back due — a try the checkout holds back
 * says so (`heldByCheckout`) — or that a person accepted its loop (`nemia accept`), never their words, which
 * are free text in a padded column; at its gate, the approval and the send-back; what the run did with an
 * ending's merge (`landed`), unless it found nothing staged; how many times it was spoken to; and what it
 * was denied. Its cost goes beside its word once measured, unless the word already shows it.
 */
export function listing({
  steps,
  run,
  phaseOf,
  closeoutOf,
  askedCloseout = () => false,
  verdictOf = () => undefined,
  asks = [],
  roundAsks = [],
  answers = [],
  waits = [],
  saidTo = () => 0,
  spendOf = () => undefined,
  slot,
  standings = [],
  checkout,
  waitingOf = () => undefined,
  deniedOf = () => [],
  holds,
}: ListingInput): Listing {
  const waiting = gated(run) ? [...waits] : [];
  const held = slot && !waiting.length && !hasStarted(run) && !run.cancelledAt ? slot : undefined;
  const settledOf = (taskId: string): TaskPhase => {
    const word = phaseOf(taskId);
    if (word === 'input-required') return 'succeeded';
    return word === 'succeeded' || word === 'failed' || word === 'stopped' || word === 'unknown' ? word : 'running';
  };
  const readable = (name: string): Closeout | undefined => {
    const c = closeoutOf(name);
    return c && !('error' in c) ? c : undefined;
  };
  const due =
    run.cancelledAt || run.pruned || run.hold
      ? []
      : retriesDue(steps, run, settledOf, readable, askedCloseout, verdictOf, asks, (taskId) => phaseOf(taskId) === 'needs-human', spendOf);
  const rounds =
    run.cancelledAt || run.pruned || run.hold ? [] : roundsDue(steps, run, settledOf, readable, askedCloseout, roundAsks, spendOf);
  const refiled = roundSpans(steps, rounds);
  const waitingAgain = unheld(steps, run, due, rounds);
  const assessed = assess(
    steps,
    run,
    settledOf,
    readable,
    askedCloseout,
    verdictOf,
    asks,
    roundAsks,
    (taskId) => phaseOf(taskId) === 'needs-human',
    spendOf,
    standings,
    checkout,
  );
  const takenByHand = (name: string): boolean =>
    resultOnBase(standings) && !run.steps[name]?.taskId && steps.some((s) => s.name === name && approvedFirst(s, run));

  const waitingOnYou: string[] = [];
  const exhausted = new Set<string>();
  const heldLoops = new Set<string>();
  const atGates = new Set<string>();
  const priced = new Set<string>();
  const rows = steps.map((step) => {
    const row = lineOf(step);
    const spent = stepSpend(run, step.name, spendOf);
    const cost = spent.measured && !priced.has(step.name) ? { cost: spentWord(spent) } : {};
    const retry = due.find((r) => r.step === step.name);
    const round = rounds.find((r) => r.step === step.name);
    const accepted = step.loop ? acceptanceOf(run, step.name) : undefined;
    const heldOut = retry && checkout && heldByCheckout(steps, step.name, checkout) ? checkout : undefined;
    const tried = heldOut
      ? `try ${retry!.try} asked (${modeWord(retry!)}) — ${checkoutWord(heldOut)}`
      : retry
        ? dueNote(step, run, retry)
        : round
          ? roundDueNote(steps, round)
          : exhausted.has(step.name)
            ? exhaustedNote(step, run, loopOver(steps, step, run, spendOf).length > 0)
            : heldLoops.has(step.name)
              ? heldNote(step, run)
              : accepted
                ? acceptedNote(step, run, accepted)
                : waitingAgain.has(step.name) && run.steps[step.name]?.taskId
                  ? `the work is sent back (${due
                      .filter((r) => r.back?.includes(step.name))
                      .map((r) => r.step)
                      .join(', ')}) — it waits at its gate again once that settles`
                  : tryNote(step, run.steps[step.name], steps, Boolean(answerOf(run, step.name, answers)));
    const gate =
      !atGates.has(step.name) || retry
        ? ''
        : takenByHand(step.name)
          ? onBaseNote(run, step.name, standings)
          : gateNote(run, step.name, sendBackTo(step, run));
    const taskId = run.steps[step.name]?.taskId;
    const note = [tried, gate, row.note, landingWord(run, step.name), saidWord(saidTo(step.name))].filter(Boolean).join(' · ');
    const roundDue = round && !retry ? { roundDue: true as const } : {};
    return { ...row, ...(note ? { note } : {}), ...roundDue, ...deniedRow(taskId ? deniedOf(taskId) : []), ...cost };
  });

  function lineOf(step: Workflow): Listing['steps'][number] {
    const { name } = step;
    const taskId = run.steps[name]?.taskId;
    const branch = run.steps[name]?.branch ?? null;
    const { status: stands, own } = standing(step, run, settledOf, readable, askedCloseout, steps, spendOf, verdictOf);
    if (!taskId && (stands !== 'awaiting approval' || waitingAgain.has(name))) {
      if (checkout && heldByCheckout(steps, name, checkout) && !waitingAgain.has(name))
        return { name, status: checkoutWord(checkout), ...coded({ reason: 'Waiting', on: 'checkout' }), branch };
      return { name, ...unfiled(step, waiting, held), branch };
    }
    if (waitingAgain.has(name)) return { name, status: 'waiting', ...coded({ reason: 'Pending' }), branch };

    const status = refiled.has(name) ? own : stands;
    if (HOLDS_THE_RUN[status] && !takenByHand(name) && !due.some((r) => r.step === name) && !rounds.some((r) => r.step === name))
      waitingOnYou.push(name);
    if (status === 'over budget' || status === 'budget exhausted') {
      if (step.loop && status === 'over budget' && satisfiesAfter(own)) heldLoops.add(name);
      if (status === 'budget exhausted' || overBudget(step, run, spendOf)) priced.add(name);
      return { name, status: budgetStatus(step, status), ...coded(REASON_OF[status]), branch };
    }
    if (status === 'awaiting approval') {
      atGates.add(name);
      return { name, status: 'awaiting approval', ...coded({ reason: 'AwaitingApproval' }), branch };
    }
    if (status === 'exhausted') {
      exhausted.add(name);
      return { name, status: 'rounds exhausted', ...coded({ reason: 'AwaitingRound' }), branch };
    }
    const judged = judgedRow(status, () => verdictOf(name), assessed.paused?.checks.includes(name) === true);
    if (judged) return { name, ...judged, branch };

    const c = closeoutOf(name);
    const said = !c ? '' : 'error' in c ? ' · closeout unreadable' : ` · ${c.outcome === 'blocked' ? 'BLOCKED' : 'done'}`;
    const word = status === 'unsigned' || status === 'unverified' || !taskId ? status : phaseOf(taskId);
    const waitsFor = taskId && word === 'needs-human' ? waitingOf(taskId) : undefined;
    const waits = waitsFor ? { waits: waitingWords(waitsFor) } : {};
    return { name, status: `${word}${said}`, ...coded(saidReason(word, c)), branch, ...waits };
  }

  function budgetStatus(step: Workflow, status: StepStatus): string {
    const spent = stepSpend(run, step.name, spendOf);
    const cap = budgetOf(step, run.steps[step.name]);
    const of = cap === undefined ? '' : ` of ${budgetWord(cap)}`;
    if (status === 'budget exhausted')
      return `budget exhausted${spent.measured ? ` ${spentWord(spent)}${of}` : cap === undefined ? '' : ` at ${budgetWord(cap)}`}`;
    if (overBudget(step, run, spendOf)) return `over budget ${spentWord(spent)}${of}`;
    return `over budget — ${loopOver(steps, step, run, spendOf)
      .map((o) => `${o.name} ${spentWord(o.spent)} of ${budgetWord(o.cap)}`)
      .join(', ')}`;
  }

  const total = runSpend(run, spendOf);
  const decide = assessed.toDecide;
  return {
    steps: asking(rows, steps, run, waitingOnYou, closeoutOf),
    waitingOnYou: run.cancelledAt || run.pruned || run.hold ? [] : waitingOnYou,
    waiting,
    ...(run.hold && !run.cancelledAt ? { holding: holds ? [...holds] : run.hold.until.map((id) => ({ run: id })) } : {}),
    ...(held ? { slot: held } : {}),
    ...(total.measured ? { cost: spentWord(total) } : {}),
    ...(decide ? { toDecide: decide } : {}),
  };
}

/**
 * A step not filed: waiting on the steps before it (`Pending`), on the runs it `waits` on (`waitWord`; `Waiting` on `run`), on a run slot
 * the limit `held` it for (`slotWord`; `Waiting` on `limit`), or on nothing yet (`Pending`).
 */
function unfiled(step: Workflow, waits: readonly Wait[], held: RunSlot | undefined): CodedStep & { status: string } {
  if (step.after.length) return { status: 'waiting', ...coded({ reason: 'Pending' }) };
  if (waits.length) return { status: waitWord(waits), ...coded({ reason: 'Waiting', on: 'run' }) };
  return held
    ? { status: slotWord(held), ...coded({ reason: 'Waiting', on: 'limit' }) }
    : { status: 'waiting', ...coded({ reason: 'Pending' }) };
}

/** A row's codes: its reason and what qualifies it, and the phase that reason stands in (`codedStep`). */
const coded = codedStep;

/**
 * The reason of a step's word where nothing narrower is known of it: `AwaitingAnswer` by the closeout where its closeout `c` signed off
 * blocked, whatever the word; else the engine's word for its task (`ENGINE_REASON`), or the status it is shown by where it has no task
 * or no word of the engine's counts (`REASON_OF`) — and, for a word that names no reason of its own (`unverified`, and the engine's
 * `input-required`, `idle` and `restarting`), what its closeout says: done, or unreadable. `unknown`, a task the engine has no record
 * of, stays `Unknown` whatever its closeout, as the feed has always read it.
 */
function saidReason(word: StepStatus | ListedPhase, c: Closeout | { error: string } | undefined): QualifiedStep {
  if (c && !('error' in c) && c.outcome === 'blocked') return { reason: 'AwaitingAnswer', via: 'closeout' };
  const known =
    word === 'unverified'
      ? undefined
      : Object.hasOwn(ENGINE_REASON, word)
        ? ENGINE_REASON[word as ListedPhase]
        : REASON_OF[word as StepStatus];
  if (known !== undefined && (known.reason !== 'Unknown' || word === 'unknown')) return known;
  return { reason: !c ? 'Unknown' : 'error' in c ? 'UnreadableCloseout' : 'Succeeded' };
}

/** What a check's verdict is as codes while it runs, and while the pause keeps it from being filed: running, with no exit yet. */
const CHECK_RUNNING: CheckVerdict = { result: 'running', exit: null };

/**
 * The row of a step its run judged by its check or a person refused: `verified ✓`; `checking` while its check is filed, else `waiting on
 * the pause` (`PAUSE_WAIT`) with its note, where the pause keeps it from being filed (`held`); `failed ✗ check (exit 1)` by its verdict
 * (`verdictOf`); `denied`. Each with its codes, and a check's verdict as codes. Undefined for any other status.
 */
function judgedRow(
  status: StepStatus,
  verdictOf: () => Verdict | undefined,
  held: boolean,
): (CodedStep & { status: string; verdict?: CheckVerdict; note?: string }) | undefined {
  if (status === 'verified') return { status: 'verified ✓', ...coded({ reason: 'CheckPassed' }), verdict: { result: 'passed', exit: 0 } };
  if (status === 'checking')
    return held
      ? { status: PAUSE_WAIT, ...coded({ reason: 'Waiting', on: 'pause' }), verdict: CHECK_RUNNING, note: PAUSE_WAIT_NOTE }
      : { status: 'checking', ...coded({ reason: 'Checking' }), verdict: CHECK_RUNNING };
  if (status === 'failed (check)') {
    const verdict = verdictOf() ?? 'unfinished';
    return {
      status: `failed ✗ check (${verdictWord(verdict)})`,
      ...coded({ reason: 'CheckFailed' }),
      verdict: checkVerdictOf('failed', verdict),
    };
  }
  if (status === 'denied') return { status: 'denied', ...coded({ reason: 'Denied' }) };
  return undefined;
}

/**
 * The longest harness word a screen will print. Whatever `waitingFor` holds is the harness's, shown to a person verbatim, and on
 * `nemia ls` it goes inside a column sized to the widest status: a long word from a future Claude Code would stretch the list. Clipped,
 * never dropped — but `claude agents` is the only place the rest of it is: every screen here words it through `waitingWords`, the
 * board's included (`StepNeeds.waitingFor.words`), so a word over this length is read whole nowhere else.
 */
const WAIT_CAP = 60;

/** The word of a step whose check is due and the pause keeps from being filed, where `checking` would say its check exists. */
export const PAUSE_WAIT = 'waiting on the pause';

/** The note beside `PAUSE_WAIT`: when the check it waits for is filed, on `nemia resume`. */
const PAUSE_WAIT_NOTE = 'its check is filed on nemia resume';

/** A word that already names its own thing. `permission prompt` does not, and reads as `a permission prompt`; `the login dialog` does. */
const DETERMINED = /^(a|an|the|its|their|another|some|one|no)\b/i;

/**
 * What the harness says a blocked session is waiting for, in a sentence a person reads: `waiting for a permission prompt`.
 *
 * **One writer for these words**, because `nemia ls`, `nemia decide` and the board all say the same fact and must not word it three ways.
 * The word itself is the harness's — no enum, here or in the engine — so all this does is put an
 * article in front of it and clip it: `a`/`an` by the sound, none where the word brings its own determiner or is plural. That rule is
 * a guess about English, not about the harness, and it is wrong for an odd noun phrase a harness emits; printing the word bare reads
 * wrong for `permission prompt`.
 *
 * **One line, whatever the harness sent.** The word is free text, so it can carry a newline — `permission prompt` naming a command it
 * would run, say — and `nemia ls` pads each status to the width of the widest (`cli/main.ts`): a status with a newline in it breaks its row
 * in two and mis-aligns every other row of that run, and `nemia decide` splits the same way. So every run of whitespace becomes one space
 * before the word is measured or clipped.
 */
export function waitingWords(waitingFor: string): string {
  const shown = oneLine(waitingFor, WAIT_CAP);
  const article = DETERMINED.test(shown) || /s$/i.test(shown) ? '' : /^[aeiou]/i.test(shown) ? 'an ' : 'a ';
  return `waiting for ${article}${shown}`;
}

/**
 * What a step's sessions were denied, in a line a person reads: `denied: Skill(look), Bash(pytest)` — or nothing, for none. Pure.
 *
 * **One writer for these words**, as `waitingWords` is for a wait: `nemia ls`, `nemia decide` and the board say the same fact. Each call is
 * the harness's own free text — a path, a command's first word — so each is made one line (`oneLine`) before it is joined: `nemia ls`
 * prints the line in its note, `nemia decide` under the step, and a newline in either breaks the screen. At most `DENIED_SHOWN` are named,
 * then how many more.
 */
export function deniedWords(denied: readonly string[]): string {
  if (!denied.length) return '';
  const named = denied.slice(0, DENIED_SHOWN).map((d) => oneLine(d, DENIED_CAP));
  const more = denied.length - named.length;
  return `denied: ${named.join(', ')}${more ? ` and ${more} more` : ''}`;
}

/**
 * What a person does about such a wait: `answer it in Claude Code: claude agents, session ae/<task>/1`, naming the session `claude agents`
 * lists it under (`nameFor`), or without it where no attempt is on the record yet. Its own writer, because a screen with room for the
 * whole sentence says it in one line (`harnessWaitLine`, `nemia decide`) and one whose card says the wait already puts this under it (the
 * board's banner): the same words either way, and never assembled twice.
 *
 * The advice assumes the wait is something a person can answer in the harness, as a `permission prompt` is: a `waitingFor` naming
 * something nobody can answer there is given the same advice.
 *
 * A step on a remote A2A agent (`harness: a2a:<name>`, given as `remote`) is in no Claude Code: its Task waits on its caller, and the
 * answer is a follow-up message on it, which `nemia say` sends; the question is the Task's last message, which `nemia logs` prints.
 */
export const answerIn = (session: string | null, remote?: { run: string; step: string }): string =>
  remote
    ? `read its question with nemia logs ${remote.run} ${remote.step}, and answer it with nemia say ${remote.run} ${remote.step} "<your answer>"`
    : `answer it in Claude Code: claude agents${session ? `, session ${session}` : ''}`;

/** The wait and the advice in one line, for a screen with room for it: `waiting for a permission prompt — answer it in Claude Code: …`. */
export const harnessWaitLine = (waitingFor: string, session: string | null, remote?: { run: string; step: string }): string =>
  `${waitingWords(waitingFor)} — ${answerIn(session, remote)}`;

/** What a step's landing adds to its note, cut to one line (`LANDED_CAP`): nothing for one that left the base untouched, or none yet. */
function landingWord(run: Run, name: string): string {
  const landed = run.steps[name]?.landed;
  return landed && !('untouched' in landed) ? oneLine(landedWords(run, landed), LANDED_CAP) : '';
}

/** A row's `denied`, what a step's current try was denied (`deniedWords`); none for a step denied nothing. */
const deniedRow = (denied: readonly string[]): { denied?: string } => (denied.length ? { denied: deniedWords(denied) } : {});

/**
 * A step's word as `nemia ls` prints it: the bare `needs-human` the row's status keeps, then what the harness says it waits for (`waits`),
 * then what its closeout said, where it gave one. `waits` is set on a row whose word is the engine's `needs-human` and on no other
 * (`lineOf`), so the word is built from it rather than found in the status.
 */
export const shownStatus = (s: Pick<Listing['steps'][number], 'status' | 'waits'>): string =>
  s.waits ? `${NEEDS_HUMAN}: ${s.waits}${s.status.slice(NEEDS_HUMAN.length)}` : s.status;

/** The engine's word for a session its harness blocked, which a row's `waits` is said beside. */
const NEEDS_HUMAN = 'needs-human';

/**
 * Each row of a step waiting on a person (`onYou`) whose closeout asks questions, with how many (`asks`); every other as it is. None on a
 * run cancelled, pruned or held, which waits on no one.
 */
function asking(
  rows: Listing['steps'],
  steps: readonly Workflow[],
  run: Pick<Run, 'cancelledAt' | 'pruned' | 'hold'>,
  onYou: readonly string[],
  closeoutOf: (step: string) => Closeout | { error: string } | undefined,
): Listing['steps'] {
  const waits = !run.cancelledAt && !run.pruned && !run.hold;
  return rows.map((row) => {
    const step = waits && onYou.includes(row.name) ? steps.find((s) => s.name === row.name) : undefined;
    const asks = step ? askedQuestions(step, closeoutOf(row.name)).flatMap((a) => a.questions).length : 0;
    return asks ? { ...row, asks } : row;
  });
}

/**
 * A step's note as `nemia ls` prints it: the row's note, then how many questions its closeout asks (`asks`), then what its current try was
 * denied (`denied`), last.
 */
export const shownNote = (s: Pick<Listing['steps'][number], 'note' | 'denied' | 'asks'>): string | undefined =>
  [s.note, s.asks ? `asks ${s.asks} question${s.asks === 1 ? '' : 's'}` : '', s.denied].filter(Boolean).join(' · ') || undefined;

/**
 * A step at its gate, beside its line on `nemia ls`: the two things a person can say, as the commands that say them. The send-back goes to
 * the step itself once it has run, and to the work it would act on at an ending step's gate, which holds before it is filed (`sendBackTo`).
 * Pruned, neither word is left: `nemia approve` and `nemia retry` are each refused there (`prunedRefusal`). Held, neither is yet
 * (`heldRefusal`).
 */
const gateNote = (run: Pick<Run, 'id' | 'pruned' | 'hold'>, step: string, back: readonly string[]): string =>
  run.pruned
    ? neverApproved(run.pruned)
    : run.hold
      ? heldLater(run.hold, 'its approval')
      : `approve it: nemia approve ${run.id} ${step}${back.length ? ` — or send it back: ${back.map((name) => `nemia retry ${run.id} ${name} --message "<objection>"`).join(' or ')}` : ''}`;

/**
 * What `nemia ls` names after `→ waiting on you:`, one entry per step a person has to act on (`waitingOnYou`): the step's name — and for a
 * step at its gate, what is asked of them, `approve plan`. Pure.
 */
export const onYouWords = (l: {
  steps: ReadonlyArray<Pick<Listing['steps'][number], 'name' | 'reason'>>;
  waitingOnYou: readonly string[];
}): string[] =>
  l.waitingOnYou.map((name) => (l.steps.find((s) => s.name === name)?.reason === 'AwaitingApproval' ? `approve ${name}` : name));

/** What `nemia ls` says a run asks beneath its steps: its ending's gate once, what waits on a person, a hold, and its result. */
function asksLines(run: Run, { steps, waitingOnYou, waiting, holding, toDecide }: Listing, result: readonly string[]): string[] {
  const lines: string[] = [];
  if (toDecide) lines.push(`   → to decide: ${toDecideWords(run, toDecide)}`);
  const onYou = onYouWords({ steps, waitingOnYou }).filter(
    (said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`),
  );
  if (onYou.length) lines.push(`   → waiting on you: ${onYou.join(', ')}  —  nemia decide ${run.id}`);
  if (waiting.some((w) => w.missing || w.cancelledAt || w.gone?.length)) lines.push(`   → waiting on you: ${waitAdvice(run, waiting)}`);
  if (holding) {
    const never = !holding.length || holding.some((w) => w.missing || w.cancelledAt || w.gone?.length);
    const lifting = holding.length > 0 && holding.every((w) => w.shipped);
    lines.push(
      `   → ${holdWord(holding, run.hold)}${never ? `: ${holdAdvice(run, holding)}` : lifting ? '' : `  —  nemia hold ${run.id} --off lifts it`}`,
    );
  }
  if (result.length) lines.push(`   → result: ${result.join(', ')}  —  nemia decide ${run.id}`);
  return lines;
}

/**
 * A run's lines on `nemia ls`: its brief and what it cost, a step a line — its word with what the harness says it waits for
 * (`shownStatus`), its cost, its branch, and its note with what it was denied (`shownNote`) — and what it asks; unjudged, its steps and
 * why.
 */
function runLines({ run, listed, result }: RunsListed['runs'][number]): string[] {
  const calledOff = `${run.cancelledAt ? '  (cancelled)' : ''}${run.pruned ? '  (pruned)' : ''}`;
  if ('said' in listed) {
    const width = Math.max(20, ...listed.steps.map((s) => s.status.length));
    return [
      `${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}`,
      ...listed.steps.map((s) => `   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}`),
      `   → unreadable: ${listed.said}`,
    ];
  }
  const { steps, cost } = listed;
  const said = steps.map((s) => `${shownStatus(s)}${s.cost ? `  ${s.cost}` : ''}`);
  const width = Math.max(20, ...said.map((w) => w.length));
  return [
    `${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}${cost ? `  ${cost}` : ''}`,
    ...steps.map((s, i) => {
      const note = shownNote(s);
      return `   ${s.name.padEnd(14)} ${said[i].padEnd(width)} ${s.branch ?? ''}${note ? `  · ${note}` : ''}`;
    }),
    ...asksLines(run, listed, result),
  ];
}

/**
 * Every line `nemia ls` prints of its answer at `now`: `no runs` for none, each run's lines, how old what it shows of where the branches
 * stand is (`standingLine`), the factories' schedules (`scheduleLines`), and last whether a nemia up ticks the store.
 */
export const lsLines = ({ runs, daemon, standing, schedules }: RunsListed, now: number): string[] => {
  const stood = standingLine(standing, daemon, now);
  const scheduled = scheduleLines(schedules ?? [], (iso) => fireWord(iso, now));
  return [...(runs.length ? runs.flatMap(runLines) : ['no runs']), ...(stood ? [stood] : []), ...scheduled, daemonLine(daemon, now)];
};
