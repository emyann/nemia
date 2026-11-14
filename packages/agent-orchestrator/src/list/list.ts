/**
 * What `nemia ls` shows of a run and each of its steps (`listing`), and the words it and the board say of a wait: a harness's
 * (`waitingWords`, `harnessWaitLine`), a denial's (`deniedWords`), a person's (`onYouWords`). Pure.
 */
import { gated, hasStarted, waitWord, type Wait } from '../wait/wait.ts';
import { slotWord, type RunSlot } from '../cap/cap.ts';
import { waitingOnNeedsWord, type NeedWaited } from '../needs/index.ts';
import { checkoutWord, LANDED_CAP, landedWords, onBaseNote, unrunEnding, type ToDecide } from '../ending/ending.ts';
import type { StepSpec } from '../step/step.ts';
import type { AttemptMemory, EnginePhase } from '../views/views-words.ts';
import { memoryBytesWord, outOfMemory, outOfMemoryWords } from '../out-of-memory/out-of-memory.ts';
import { DENIED_CAP, DENIED_SHOWN, honoursAsks, oneLine, satisfiesAfter, type Run, type StepStatus } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { checkVerdictOf, verdictWord, type CheckVerdict, type Verdict } from '../check/index.ts';
import { routedRows, routedWords } from '../route/routed/index.ts';
import { codedStep, ENGINE_REASON, holdsTheRun, REASON_OF, type CodedStep, type QualifiedStep } from '../phase/phase.ts';
import { answerOf, dueNote, modeWord, tryNote, type RetryAsk } from '../retry/index.ts';
import {
  acceptanceOf,
  budgetOf,
  waitsOnCheckout,
  loopOver,
  overBudget,
  resultOnBase,
  roundSpans,
  runSpend,
  sendBackTo,
  unfiledBack,
  spentWord,
  standing,
  stepSpend,
} from '../status/status.ts';
import { budgetWord } from '../money/money.ts';
import { durationWord } from '../usage/usage.ts';
import { acceptedNote, exhaustedNote, heldLater, heldNote, roundDueNote } from '../round/round.ts';
import { saidBeforeWord, saidWord } from '../say/say.ts';
import { askedQuestions } from '../question/index.ts';
import { assess, type Assessment, type AssessRead } from '../tick/assess.ts';
import { neverApproved } from '../forget/prune/prune.ts';
import { staleAfterMs, type DaemonStanding } from '../daemon/daemon.ts';
import type { Paused } from '../pause/pause.ts';
import type { ScheduleListed } from '../factory/schedule/schedule.ts';

export type Listing = {
  /**
   * One line per step: its name, what to say about it, and the branch it is on — and, only for a step tried
   * again or about to be, `note`: the try it is on and how it got there (`tryNote`), or the try due (`dueNote`).
   * Beside the message and never in it, so the words stay the vocabulary a reader of them keys on: so are `waits`, what the harness says a
   * `needs-human` session waits for (`waitingWords`), and `denied`, what its current try was denied (`deniedWords`), which `nemia ls`
   * prints in the line (`shownStatus`, `shownNote`) and the board does not, and `ranOn`, what the session of a step at work runs on
   * (`ranOnWords`), which `nemia ls` prints in the note beside them (`shownNote`) and the board shows off the run object. `roundDue`,
   * only on a looping step whose next round is due (`roundsDue`) and which no retry takes first: what its note words as
   * `roundDueNote`. `asks`, only on a step waiting on a person whose closeout asks questions: how many (`askedQuestions`), which
   * `nemia ls` counts in the note and `nemia decide` prints whole.
   *
   * `reason` and `phase` are where the step stands as codes (`StepReason`, `StepPhase`), with `on`, what a `Waiting` step waits on, and
   * `via`, where an `AwaitingAnswer` step's answer is asked (`CodedStep`), set here from the facts the row's word is built from and never
   * read back off it: what every door carries and compares, the word (`message`) being what a person reads.
   * `verdict`, only on a step judged by its check: that check's, as codes (`CheckVerdict`).
   */
  steps: Array<
    CodedStep & {
      name: string;
      message: string;
      verdict?: CheckVerdict;
      branch: string | null;
      note?: string;
      cost?: string;
      waits?: string;
      denied?: string;
      ranOn?: string;
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
   * `held until <run> lands` where it would say who the run waits on (`holdWord`). Absent on a run nobody holds, or one called off; empty
   * on a hold that names no run, which a person alone lifts (`held until a person lifts it`).
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
export type Unjudged = { said: string; steps: Array<{ name: string; message: string; branch?: string }> };

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

/**
 * What `listing` reads a run's steps off: the run's one read (`read`, `readRun`'s) and its assessment, which judge every step; and, for the
 * words alone, the engine's own words for its tasks and what people said of it.
 */
export interface ListingInput {
  /** The run's steps as they are shown, as the frozen folder names them, in its order. */
  readonly steps: readonly StepSpec[];
  /** The run's one read (`AssessRead`): what judges each step, its tries and rounds due, its result and its checkout. */
  readonly read: AssessRead;
  /** `assess` on `read`, where the caller judged it already: each step's standing and what is due. Left out, the listing assesses it. */
  readonly assessed?: Assessment;
  /** The engine's own word for a task's phase — `working`, `needs-human` — shown as-is. */
  readonly phaseOf: (taskId: string) => ListedPhase;
  /** Each step's closeout, or the error that kept it from being read. */
  readonly closeoutOf: (step: string) => Closeout | { error: string } | undefined;
  /** Every ask that carried a message, waiting or consumed (`readAnswers`): what says a step's try was answered (`answerOf`). */
  readonly answers?: readonly RetryAsk[];
  /** The runs this run waits on that have not landed (`waitsOf`): what its roots say where `waiting` would be. */
  readonly waits?: readonly Wait[];
  /**
   * How many times a person said something to each step's current try while it ran (`nemia say`), off the engine's `said` on its
   * task.
   */
  readonly saidTo?: (step: string) => number;
  /** The cap on runs in flight holding this run (`heldRuns`), if it does: what its roots say where `waiting` would be. */
  readonly slot?: RunSlot;
  /**
   * What the harness says a blocked session waits for, in its own words (`TaskView.waitingFor`): the row's `waits` beside
   * the engine's `needs-human`. **Beside the word, never in it.** Read for a task the run's one read says its harness blocked
   * (`sessionBlocked`, `harnessBlocked` in views.verb.ts), and a row says it as its reason (`AwaitingAnswer`, `via: 'session'`), which
   * the api and the board compare; the status stays the engine's bare word, and only what `nemia ls` prints gains the harness's
   * (`shownStatus`).
   */
  readonly waitingOf?: (taskId: string) => string | undefined;
  /**
   * Why the runtime holds each queued task back from its admission (`admissionWaitOf` in views.verb.ts): a slot of its pool, or the memory
   * it asks and the room there is. Said in the row's note (`admissionWords`), after its own words, for the step's task and its check's;
   * the word and the codes stay the engine's. Left out, no row says one.
   */
  readonly admissionWaitOf?: (taskId: string) => HeldBack | undefined;
  /**
   * What each task's sessions were denied, as permission rules name them (`deniedOf` in views.verb.ts): the row's `denied`,
   * `denied: Skill(look), Bash(pytest)` (`deniedWords`), for the step's current try, and neither in its status nor its note; `nemia ls`
   * prints it last in the note (`shownNote`), and the api carries the list as a field of its own (`StepNeeds.denied`).
   */
  readonly deniedOf?: (taskId: string) => readonly string[];
  /**
   * What the session of each task at work runs on, in words (`ranOnOf` in views.verb.ts): the row's `ranOn`,
   * `on v1.2.0, <harness> <version>`, for a step whose current try is at work, beside its status and note and never in them;
   * `nemia ls` prints it in the note before what the try was denied (`shownNote`). Left out, no row says one.
   */
  readonly ranOnOf?: (taskId: string) => string | undefined;
  /**
   * Whether each task's session is parked (`parkedOf` in views-words.ts): held at its hook with the call it stopped `after`, or ended
   * with the call it `cut`. A parked step at work says `paused` (`pausedWord`), reason `Paused`, in place of the engine's word. Left out,
   * none is.
   */
  readonly parkedOf?: (taskId: string) => { after?: string; cut?: string } | undefined;
  /**
   * The runs a held run waits on to land, as `holdsOf` reads them: said where `waiting on you` would be (`holdWord`). Left out,
   * the runs the hold names, each taken as one that may still land.
   */
  readonly holds?: readonly Wait[];
  /**
   * The memory record of each task's current turn in which the kernel killed a process at its limit (`killedMemoryOf` in
   * views-words.ts): a step whose session or check it says so of carries the words in its note (`memoryNoted`). Left out, or undefined
   * for a task, no note says one.
   */
  readonly memoryOf?: (taskId: string) => AttemptMemory | undefined;
}

/** Where a step stands on a pass: its word, and its own work's (`standing`). */
type Stood = { status: StepStatus; own: StepStatus };

/** Whether a step carries a routing key a step's word reads: a condition's `routes:`, or a workflow node's `workflow:`. */
const routes = (step: StepSpec): boolean => step.routes !== undefined || step.workflow !== undefined;

/**
 * `listedSteps`, with the routing's rows laid over the steps it words (`routedRows`): a node `skipped (<condition>: <route>)`, a workflow
 * node `sent → <card>`, a condition never filed its route and the line that routes it by hand.
 *
 * Each step's standing is the assessment's (`stepWords`, `assess` on the run's one read), so the listing stands no step itself and says
 * what the pass says; the routing is laid over it only where a step has a routing key a word reads (`routes:`, `workflow:`): with none,
 * the words are the standings (`routedWords`).
 */
export function listing(input: ListingInput): Listing {
  const { steps, read } = input;
  const { run } = read;
  const assessed = input.assessed ?? assess(read);
  const stoodOf = (step: StepSpec): Stood =>
    assessed.stepWords.get(step.name) ??
    standing(step, run, read.phaseOf, read.signedOff, read.asked, read.steps, read.spendOf, read.verdictOf);
  const statuses = new Map(steps.map((s) => [s.name, stoodOf(s).status]));
  const words = steps.some(routes) ? routedWords(steps, run, statuses, read.signedOff) : statuses;
  const listed = memoryNoted(input, admissionNoted(input, listedSteps(input, assessed, stoodOf, words)));
  const routed = routedRows({ steps, run, closeoutOf: input.closeoutOf }, words);
  if (!routed.size) return listed;
  const rows = listed.steps.map((s) => {
    const row = routed.get(s.name);
    if (row && 'besides' in row) return { ...s, message: `${s.message} · ${row.besides}` };
    return row ? { name: s.name, branch: s.branch, ...row } : s;
  });
  return { ...listed, steps: rows };
}

/**
 * Why the runtime holds a task queued, as it says so on its view (`TaskView.waits`): a slot of its pool, `pool` at its `ceiling`
 * (`WF_MAX_CONCURRENT`), or the memory it asks (`needBytes`) and the room the machine has above its floor (`roomBytes`). The
 * orchestrator's copy, held equal to the runtime's `AdmissionWait` in runtime-client.ts, since a pure file imports no runtime.
 */
export type HeldBack =
  | { readonly for: 'slot'; readonly pool: string; readonly ceiling: number }
  | { readonly for: 'memory'; readonly needBytes: number; readonly roomBytes: number };

/**
 * What a queued task the runtime holds waits for, in the words the run cap's wait is said in (`slotWord`): what it waits for, and the
 * number that decides it — `waits for memory: needs 2.5Gi, 1Gi free`, or `waits for a session slot: <pool> has 4 at work
 * (WF_MAX_CONCURRENT)`. Pure.
 */
export const admissionWords = (wait: HeldBack): string =>
  wait.for === 'memory'
    ? `waits for memory: needs ${memoryBytesWord(wait.needBytes)}, ${memoryBytesWord(wait.roomBytes)} free`
    : `waits for a session slot: ${wait.pool} has ${wait.ceiling} at work (WF_MAX_CONCURRENT)`;

/**
 * Each step's note with why the runtime holds its task or its check's queued (`admissionWords`), after the note's own words: read off
 * the views on every pass, so a step whose tasks wait for nothing reads as it did. In the note and not the word, so the word and the
 * codes stay the engine's and a room that moves leaves the feed's word alone.
 */
const admissionNoted = ({ read, admissionWaitOf }: ListingInput, listed: Listing): Listing => {
  if (!admissionWaitOf) return listed;
  const said = (taskId: string | null | undefined, of: string): string => {
    const wait = taskId ? admissionWaitOf(taskId) : undefined;
    return wait ? `${of}${admissionWords(wait)}` : '';
  };
  return {
    ...listed,
    steps: listed.steps.map((s) => {
      const rec = read.run.steps[s.name];
      const words = [said(rec?.taskId, ''), said(rec?.check?.taskId, 'check ')].filter(Boolean);
      return words.length ? { ...s, note: [s.note, ...words].filter(Boolean).join(' · ') } : s;
    }),
  };
};

/**
 * Each step's note with what its current try's session and check say of a kill at the memory limit (`outOfMemoryWords`), after the note's
 * own words: read off the attempts on every pass, so a step whose tasks carry no such record reads as it did. The session's words name the
 * step's own `memory:` where it names one; a check runs under the daemon's default alone.
 */
const memoryNoted = ({ steps, read, memoryOf }: ListingInput, listed: Listing): Listing => {
  if (!memoryOf) return listed;
  const { run } = read;
  const said = (taskId: string | null | undefined, own: string | undefined, of: 'session' | 'check'): string => {
    const killed = taskId ? outOfMemory(memoryOf(taskId), own) : undefined;
    return killed ? outOfMemoryWords(killed, own, of) : '';
  };
  const owns = new Map(steps.map((s) => [s.name, s.memory]));
  return {
    ...listed,
    steps: listed.steps.map((s) => {
      const rec = run.steps[s.name];
      const words = [said(rec?.taskId, owns.get(s.name), 'session'), said(rec?.check?.taskId, undefined, 'check')].filter(Boolean);
      return words.length ? { ...s, note: [s.note, ...words].filter(Boolean).join(' · ') } : s;
    }),
  };
};

/**
 * How often a step was said to (`nemia say`): to its current try's sessions (`saidWord`), and before it was filed while it is on its first
 * try or has none (`saidBeforeWord`, off the run's `saidBefore`).
 */
const notedSaid = (run: Run, name: string, saidTo: (step: string) => number): string =>
  [saidWord(saidTo(name)), saidBeforeWord(run.steps[name]?.tries?.length ? 0 : (run.saidBefore?.[name]?.length ?? 0))]
    .filter(Boolean)
    .join(' · ');

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
 * harness blocked it (`sessionBlocked`) what the harness says it waits for (`waitingWords`). Nothing is inferred
 * for a step with no closeout — a missing closeout is not a claim that the work was done, and a run with
 * none still lists. A cap reached says what was spent and the cap in force; a looping step held on another
 * step's budget shows that step's.
 *
 * One line per step, deliberately. The summary, `needs` and a check's output were written for
 * `nemia decide`, where there is room to read them; here they would turn a list into a report.
 *
 * A step never filed that the run's words read at its gate (`runWords`: a gated table condition whose table answered) is listed there, as
 * a gated step that signed off is: awaiting approval, waiting on you, its note the approval and the send-back of what it routes on.
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
 * A step's note says, in order: its try, or the try, round or send-back due — a try the checkout holds back says so (`waitsOnCheckout`) —
 * or that a person accepted its loop (`nemia approve`), never their words, which are free text in a padded column; at its gate, the
 * approval and the send-back; what the run did with an ending's merge (`landed`), unless it found nothing staged; how many times it was
 * spoken to, and how many before it was filed while it is on its first try (`saidBeforeWord`); and what it was denied. Its cost goes beside
 * its word once measured, unless the word already shows it.
 *
 * @param assessed `assess` on the run's one read: the tries, rounds and send-backs due, read here and never judged again.
 * @param stoodOf Where a step stands on this pass (`stepWords`).
 * @param routed Every step's word on this pass, routing and all (`routedWords` over `stood`).
 */
function listedSteps(
  {
    steps,
    read,
    phaseOf,
    closeoutOf,
    answers = [],
    waits = [],
    saidTo = () => 0,
    slot,
    waitingOf = () => undefined,
    deniedOf = () => [],
    ranOnOf = () => undefined,
    parkedOf = () => undefined,
    holds,
  }: ListingInput,
  assessed: Assessment,
  stoodOf: (step: StepSpec) => Stood,
  routed: ReadonlyMap<string, StepStatus>,
): Listing {
  const { run, verdictOf, spendOf, standings, checkout, sessionBlocked } = read;
  const waiting = gated(run) ? [...waits] : [];
  const held = slot && !waiting.length && !hasStarted(run) && !run.cancelledAt ? slot : undefined;
  const due = assessed.due.retry;
  const rounds = assessed.due.round;
  const refiled = roundSpans(steps, rounds);
  const waitingAgain = new Set(assessed.unheld);
  const takenByHand = (name: string): boolean => resultOnBase(standings) && unrunEnding(steps, run, name);

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
    const heldOut = retry && checkout && waitsOnCheckout(steps, step.name, checkout) ? { retry, checkout } : undefined;
    const tried = heldOut
      ? `try ${heldOut.retry.try} asked (${modeWord(heldOut.retry)}) — ${checkoutWord(heldOut.checkout)}`
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
    const gate = atGates.has(step.name) && !retry ? atGateNote(step, run, takenByHand(step.name), standings) : '';
    const back = waitingAgain.has(step.name) ? '' : backNote(step, run);
    const note = [tried, gate || back, row.note, landingWord(run, step.name), notedSaid(run, step.name, saidTo)]
      .filter(Boolean)
      .join(' · ');
    const roundDue = round && !retry ? { roundDue: true as const } : {};
    return { ...row, ...(note ? { note } : {}), ...roundDue, ...taskRow(run.steps[step.name]?.taskId, ranOnOf, deniedOf), ...cost };
  });

  function lineOf(step: StepSpec): Listing['steps'][number] {
    const { name } = step;
    const taskId = run.steps[name]?.taskId;
    const branch = run.steps[name]?.branch ?? null;
    const { status: stoodAs, own } = stoodOf(step);
    const stands: StepStatus = !taskId && routed.get(name) === 'awaiting approval' ? 'awaiting approval' : stoodAs;
    if (!taskId && (stands !== 'awaiting approval' || waitingAgain.has(name))) {
      if (checkout && waitsOnCheckout(steps, name, checkout) && !waitingAgain.has(name))
        return { name, message: checkoutWord(checkout), ...coded({ reason: 'Waiting', on: 'base' }), branch };
      return { name, ...unfiled(step, waiting, held, assessed.waitingOnNeeds), branch };
    }
    if (waitingAgain.has(name)) return { name, message: 'pending', ...coded({ reason: 'Pending' }), branch };

    const status = refiled.has(name) ? own : stands;
    if (holdsTheRun(status) && !takenByHand(name) && !due.some((r) => r.step === name) && !rounds.some((r) => r.step === name))
      waitingOnYou.push(name);
    if (status === 'over budget' || status === 'budget exhausted') {
      if (step.loop && status === 'over budget' && satisfiesAfter(own)) heldLoops.add(name);
      if (status === 'budget exhausted' || overBudget(step, run, spendOf)) priced.add(name);
      return { name, message: budgetStatus(step, status), ...coded(REASON_OF[status]), branch };
    }
    if (status === 'awaiting approval') {
      atGates.add(name);
      return { name, message: 'awaiting approval', ...coded({ reason: 'AwaitingApproval' }), branch };
    }
    if (status === 'exhausted') {
      exhausted.add(name);
      return { name, message: 'rounds exhausted', ...coded({ reason: 'AwaitingRound' }), branch };
    }
    const judged = judgedRow(status, () => verdictOf(name), assessed.waitingOnPause?.checks.includes(name) === true);
    if (judged) return { name, ...judged, branch };

    return { name, ...taskWord(status, taskId, closeoutOf(name), { phaseOf, parkedOf, waitingOf, sessionBlocked }), branch };
  }

  function budgetStatus(step: StepSpec, status: StepStatus): string {
    const spent = stepSpend(run, step.name, spendOf);
    const cap = budgetOf(step, run);
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
    waitingOnYou: honoursAsks(run) ? waitingOnYou : [],
    waiting,
    ...(run.hold && !run.cancelledAt ? { holding: holds ? [...holds] : run.hold.until.map((id) => ({ run: id })) } : {}),
    ...(held ? { slot: held } : {}),
    ...(total.measured ? { cost: spentWord(total) } : {}),
    ...(decide ? { toDecide: decide } : {}),
  };
}

/**
 * A step not filed: waiting on the steps before it (`Pending`), on the runs it `waits` on (`waitWord`; `Waiting` on `run`), on the needs
 * of its run that are missing (`waitingOnNeedsWord`, `waiting on <need>: <fix>`, beside its phase: `Pending`), on a run slot the limit
 * `held` it for (`slotWord`; `Waiting` on `limit`), or on nothing yet (`Pending`).
 */
function unfiled(
  step: StepSpec,
  waits: readonly Wait[],
  held: RunSlot | undefined,
  needs: readonly NeedWaited[] | undefined,
): CodedStep & { message: string } {
  if (step.after.length) return { message: 'pending', ...coded({ reason: 'Pending' }) };
  if (waits.length) return { message: waitWord(waits), ...coded({ reason: 'Waiting', on: 'run' }) };
  if (needs?.length) return { message: waitingOnNeedsWord(needs), ...coded({ reason: 'Pending' }) };
  return held
    ? { message: slotWord(held), ...coded({ reason: 'Waiting', on: 'limit' }) }
    : { message: 'pending', ...coded({ reason: 'Pending' }) };
}

/** A row's codes: its reason and what qualifies it, and the phase that reason stands in (`codedStep`). */
const coded = codedStep;

/**
 * The word of a step the run has no verdict of its own on, its closeout `c` beside it: the status it is shown by where it has no task or
 * the record says `unsigned` or `unverified`; else `paused` where its session is parked (`pausedWord`, reason `Paused`), or the engine's
 * word for its task, with what a session its harness blocked waits for (`sessionBlocked`, `waitingWords`).
 */
function taskWord(
  status: StepStatus,
  taskId: string | null | undefined,
  c: Closeout | { error: string } | undefined,
  read: Required<Pick<ListingInput, 'phaseOf' | 'parkedOf' | 'waitingOf'>> & Pick<AssessRead, 'sessionBlocked'>,
): CodedStep & { message: string; waits?: string } {
  const said = !c ? '' : 'error' in c ? ' · closeout unreadable' : ` · ${c.outcome === 'blocked' ? 'BLOCKED' : 'done'}`;
  const engine = typeof taskId === 'string' && taskId !== '' && status !== 'unsigned' && status !== 'unverified';
  const parked = engine ? read.parkedOf(taskId) : undefined;
  if (parked) return { message: `${pausedWord(parked)}${said}`, ...coded({ reason: 'Paused' }) };
  const word = engine ? read.phaseOf(taskId) : status;
  const waitsFor = engine && read.sessionBlocked(taskId) ? read.waitingOf(taskId) : undefined;
  return { message: `${word}${said}`, ...coded(saidReason(word, c)), ...(waitsFor ? { waits: waitingWords(waitsFor) } : {}) };
}

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
): (CodedStep & { message: string; verdict?: CheckVerdict; note?: string }) | undefined {
  if (status === 'verified') return { message: 'verified ✓', ...coded({ reason: 'CheckPassed' }), verdict: { result: 'passed', exit: 0 } };
  if (status === 'checking')
    return held
      ? { message: PAUSE_WAIT, ...coded({ reason: 'Waiting', on: 'pause' }), verdict: CHECK_RUNNING, note: PAUSE_WAIT_NOTE }
      : { message: 'checking', ...coded({ reason: 'Checking' }), verdict: CHECK_RUNNING };
  if (status === 'failed (check)') {
    const verdict = verdictOf() ?? 'unfinished';
    return {
      message: `failed ✗ check (${verdictWord(verdict)})`,
      ...coded({ reason: 'CheckFailed' }),
      verdict: checkVerdictOf('failed', verdict),
    };
  }
  if (status === 'denied') return { message: 'denied', ...coded({ reason: 'Denied' }) };
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

/** A parked step's word: `paused`, `paused after its call to <tool>`, or `paused, its call to <tool> cut`. */
export const pausedWord = (parked: { after?: string; cut?: string }): string =>
  parked.cut ? `paused, its call to ${parked.cut} cut` : parked.after ? `paused after its call to ${parked.after}` : 'paused';

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
/**
 * What a step's current task says beside its note: what its session runs on (`ranOn`), then what it was denied (`denied`), each where
 * it says one; nothing for a step with no task.
 */
const taskRow = (
  taskId: string | null | undefined,
  ranOnOf: (taskId: string) => string | undefined,
  deniedOf: (taskId: string) => readonly string[],
): { ranOn?: string; denied?: string } => {
  if (!taskId) return {};
  const ranOn = ranOnOf(taskId);
  const denied = deniedOf(taskId);
  return { ...(ranOn ? { ranOn } : {}), ...(denied.length ? { denied: deniedWords(denied) } : {}) };
};

/**
 * A step's word as `nemia ls` prints it: the bare `needs-human` the row's message keeps, then what the harness says it waits for (`waits`),
 * then what its closeout said, where it gave one. `waits` is set on a row whose word is the engine's `needs-human` and on no other
 * (`lineOf`), so the word is built from it rather than found in the message.
 */
export const shownStatus = (s: Pick<Listing['steps'][number], 'message' | 'waits'>): string =>
  s.waits ? `${NEEDS_HUMAN}: ${s.waits}${s.message.slice(NEEDS_HUMAN.length)}` : s.message;

/** The engine's word for a session its harness blocked, which a row's `waits` is said beside. */
const NEEDS_HUMAN = 'needs-human';

/**
 * Each row of a step waiting on a person (`waitingOnYou`) whose closeout asks questions, with how many (`asks`); every other as it is. None
 * on a run cancelled, pruned or held, which waits on no one.
 */
function asking(
  rows: Listing['steps'],
  steps: readonly StepSpec[],
  run: Pick<Run, 'cancelledAt' | 'pruned' | 'hold'>,
  waitingOnYou: readonly string[],
  closeoutOf: (step: string) => Closeout | { error: string } | undefined,
): Listing['steps'] {
  const waits = honoursAsks(run);
  return rows.map((row) => {
    const step = waits && waitingOnYou.includes(row.name) ? steps.find((s) => s.name === row.name) : undefined;
    const asks = step ? askedQuestions(step, closeoutOf(row.name)).flatMap((a) => a.questions).length : 0;
    return asks ? { ...row, asks } : row;
  });
}

/**
 * A step's note as `nemia ls` prints it: the row's note, then how many questions its closeout asks (`asks`), then what its current try was
 * denied (`denied`), last.
 */
export const shownNote = (s: Pick<Listing['steps'][number], 'note' | 'denied' | 'asks' | 'ranOn'>): string | undefined =>
  [s.note, s.asks ? `asks ${s.asks} question${s.asks === 1 ? '' : 's'}` : '', s.ranOn, s.denied].filter(Boolean).join(' · ') || undefined;

/**
 * A step at its gate, beside its line on `nemia ls`: the two things a person can say, as the commands that say them. The send-back goes to
 * the step itself once it has run, and to the work it would act on at an ending step's gate, which holds before it is filed (`sendBackTo`).
 * Pruned, neither word is left: `nemia approve` and `nemia retry` are each refused there (`prunedRefusal`). Cancelled, neither is either
 * (`approvalRefusal`): a cancelled run files nothing more, held or not. Held, neither is yet (`heldRefusal`).
 */
const gateNote = (run: Pick<Run, 'id' | 'pruned' | 'hold' | 'cancelledAt'>, step: string, back: readonly string[]): string =>
  run.pruned
    ? neverApproved(run.pruned)
    : run.cancelledAt
      ? `not approved, and never can be: the run was cancelled at ${run.cancelledAt}`
      : run.hold
        ? heldLater(run.hold, 'its approval')
        : `approve it: nemia approve ${run.id} ${step}${back.length ? ` — or send it back: ${back.map((name) => `nemia retry ${run.id} ${name} --message "<objection>"`).join(' or ')}` : ''}`;

/**
 * What `nemia ls` says beside a step at its gate: the merge a person made by hand, for an ending whose result is on the base branch
 * (`onBaseNote`), else the approval and the send-back (`gateNote`). Pure.
 */
const atGateNote = (step: StepSpec, run: Run, byHand: boolean, standings: Parameters<typeof onBaseNote>[2]): string =>
  byHand ? onBaseNote(run, step.name, standings) : gateNote(run, step.name, sendBackTo(step, run));

/**
 * The send-back an ending approved and not filed still offers (`unfiledBack`), beside what it waits for: the work it would act on, sent
 * back with words, which spends the approval. Pure.
 */
const backNote = (step: StepSpec, run: Run): string => {
  const back = unfiledBack(step, run);
  return back.length ? `or send it back: ${back.map((name) => `nemia retry ${run.id} ${name} --message "<objection>"`).join(' or ')}` : '';
};

/**
 * What `nemia ls` names after `→ waiting on you:`, one entry per step a person has to act on (`waitingOnYou`): the step's name — and for a
 * step at its gate, what is asked of them, `approve plan`. Pure.
 */
export const onYouWords = (l: {
  steps: ReadonlyArray<Pick<Listing['steps'][number], 'name' | 'reason'>>;
  waitingOnYou: readonly string[];
}): string[] =>
  l.waitingOnYou.map((name) => (l.steps.find((s) => s.name === name)?.reason === 'AwaitingApproval' ? `approve ${name}` : name));
