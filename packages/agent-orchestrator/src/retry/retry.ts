/**
 * A person's try of a step, from the run's side: what may be asked (`retryable`), the tries due now (`retriesDue`), and what `nemia ls` and
 * `nemia decide` say of them (`tryNote`, `retryLines`, `answerLines`, `deniedOffer`, `overBudgetLine`). Pure; the ask itself, and the
 * record of a try, are `retry-ask.ts`'s, and what `nemia retry` refuses (`retryRefusal`) is `retry-refusal.ts`'s.
 */
import type { Workflow } from '../step/step.ts';
import {
  DENIED_SHOWN,
  oneLine,
  prunedWords,
  refusedCheck,
  satisfiesAfter,
  SETTLED,
  tryOf,
  type CloseoutAsked,
  type Run,
  type StepRecord,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import {
  aboveWord,
  approvalOf,
  capOf,
  endingStopped,
  hasGate,
  landsOnCheck,
  loopOf,
  loopOver,
  overBudget,
  ownStatus,
  raiseOf,
  roundIn,
  roundWord,
  spentWord,
  standing,
  waitsAtGate,
  type Raise,
  type SpendOf,
  budgetWord,
} from '../status/status.ts';
import type { Verdict } from '../check/check.ts';
import { retriesSpent, signoffDue, type EarlierTry, type Retry, type RetryAsk, type RetryMode } from './retry-ask.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import type { Decision, Offer } from '../decide/decide.ts';
import { filedDenies, landedWords } from '../ending/ending.ts';
import { allowRuleOf, disallowedBy, type DeniedAt } from '../keys/index.ts';
import { heldLater } from '../round/round.ts';
import { answersOr } from '../question/index.ts';

/**
 * What a person may ask for a step, and the status that says why. Pure.
 *
 * Only a try that is over and let nothing that waits on it run: its check did not pass, it ended without its
 * closeout, it signed off blocked, or its session failed or was stopped. `recheck` only where a check did not
 * pass, since nothing else has a check to run again, and never on an ending that lands on its check
 * (`landsOnCheck`): the run aborted the merge its check judged, so a recheck would judge the checkout
 * without it. A step that signed off blocked only once its session
 * has settled: a session can outlive its closeout, and a try resuming one still running would be two agents
 * in one conversation.
 *
 * And one try that is not over: a step whose session its harness blocked — the engine's `needs-human`, as
 * `harnessBlocked` says it — and that signed nothing, `blockedByHarness`. It reads `running`, and nothing in it
 * moves without a person. `nudge` and `fresh` may be asked for it, and the tick stops the session before it
 * files the try (`stopFirst`), so no two agents share the conversation. Not `recheck`: nothing of it was
 * checked. Left out, `harnessBlocked` says no session is blocked, and such a step is running, with nothing to try.
 *
 * A step `over budget` from a try is tried the ways its own status takes, and one `budget exhausted` as a session that failed — each with
 * `raise`: a session filed for it has to carry a `--budget` above what it has spent, since spending past the cap on anyone's word but a
 * person's raising it is what a cap forbids. A recheck costs nothing, and needs none. So `raise` is on a settled step over its budget, or
 * ended at it, that may be tried: those two statuses, and a `failed (check)` whose check did not finish past its budget, which is offered
 * the recheck first. A step over budget whose loop's round waits (`held`) has no try: going round is `nemia round`'s. Any other step with a
 * cap that may be tried takes a `--budget` too, above its floor (`raiseOf`), which `carries` and `retryRefusal` read: `raise` marks only
 * the steps a session of which must carry one.
 *
 * And a step whose work the run is parked on at an ending step's gate (`waitsAtGate`), with nothing after it filed: the ending has nothing
 * of its own to object to — it has not run — so a send-back there goes to the work, which is this step (`sendBackTo`).
 *
 * And a gated step that signed off, while nothing after it is filed: `awaiting approval`, or approved and not yet handed on — which a step
 * nothing waits on never is: approved, it has handed on, since there is nothing left to file. A try of it is
 * a send-back from its gate (`sendsBack`) — `nudge` or `fresh`, with what to change, which `retryRefusal` holds it to — and the try after
 * it is on a try its approval does not name, so an approval given before the send-back is spent by it.
 *
 * And the looping step an ending waits on, once that ending has been filed and stopped on the base branch (`endingStopped`): a try of it
 * sends the work back from there through the folder's loop — the step filed again with what the person and the ending said, free to ask for
 * a round — and `back` names the endings whose try the pass that files it moves behind (`sentBack`), once every step after it that has been
 * filed is such an ending. Only a looping step: its `again: true` is what gives the work a round, and a folder with no loop before its
 * ending has no way back but a new run (`retryRefusal` says so).
 *
 * @param harnessBlocked Whether the harness marked a task's session blocked while its attempt runs: the engine's `needs-human`
 *   (`harnessBlocked` in views.verb.ts).
 * @param spendOf What each task's sessions cost (`taskSpend`). Left out, no step is over budget, and none carries `raise`.
 * @param verdictOf What each step's current check exited with (`stepStatus`): a check that refused holds a step over its budget, one that
 *   did not finish does not.
 */
export function retryable(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  steps: readonly Workflow[] = [],
  harnessBlocked: (taskId: string) => boolean = () => false,
  spendOf: SpendOf = () => undefined,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): { status: StepStatus; modes: RetryMode[]; blockedByHarness: boolean; sendsBack?: true; back?: string[]; raise?: Raise } {
  const { status, own } = standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf);
  const taskId = run.steps[step.name]?.taskId;
  const settled = taskId ? SETTLED.has(phaseOf(taskId)) : false;
  const blockedByHarness = status === 'running' && Boolean(taskId) && harnessBlocked(taskId!) && !closeoutOf(step.name);
  const tried = status === 'over budget' ? own : status;
  const followers = steps.filter((s) => s.after.includes(step.name));
  const noneFiled = followers.length > 0 && !followers.some((s) => run.steps[s.name]?.taskId);
  const stopped = followers.filter((f) => run.steps[f.name]?.taskId);
  const back =
    step.loop &&
    satisfiesAfter(status) &&
    stopped.length > 0 &&
    stopped.every((f) => endingStopped(f, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf))
      ? stopped.map((f) => f.name)
      : undefined;
  const sendsBack =
    settled &&
    (status === 'awaiting approval' ||
      Boolean(back) ||
      (hasGate(step, run) && satisfiesAfter(status) && Boolean(approvalOf(run, step.name)) && noneFiled) ||
      (satisfiesAfter(status) &&
        noneFiled &&
        followers.some((f) => waitsAtGate(f, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf))));
  const modes: RetryMode[] =
    tried === 'failed (check)'
      ? landsOnCheck(step, run)
        ? ['nudge', 'fresh']
        : ['nudge', 'fresh', 'recheck']
      : tried === 'unsigned' ||
          tried === 'failed' ||
          tried === 'stopped' ||
          (tried === 'blocked' && settled) ||
          tried === 'budget exhausted' ||
          tried === 'denied' ||
          blockedByHarness ||
          sendsBack
        ? ['nudge', 'fresh']
        : [];
  const raise =
    settled && modes.length && (status === 'budget exhausted' || overBudget(step, run, spendOf)) ? raiseOf(step, run, spendOf) : undefined;
  return {
    status,
    modes,
    blockedByHarness,
    ...(sendsBack ? { sendsBack: true as const } : {}),
    ...(sendsBack && back ? { back } : {}),
    ...(raise ? { raise } : {}),
  };
}

/**
 * Whether a person's ask carries what a try of its step needs, and nothing it cannot take. A recheck files no session, and carries. An ask
 * with no `--budget` carries unless the step is past its budget (`raise`). An ask with one carries only on a step with a cap, and only
 * above its floor (`raiseOf`): what its tries have cost, and the cap in force.
 *
 * @param raise The raise a session of the step must carry: set on a step over its budget, or ended at it (`retryable`).
 * @param floor What any `--budget` on the step must pass (`raiseOf`): undefined for a step with no `budget:`.
 */
export const carries = (a: Pick<RetryAsk, 'mode' | 'budget'>, raise: Raise | undefined, floor: Raise | undefined): boolean =>
  a.mode === 'recheck' || (a.budget === undefined ? !raise : floor !== undefined && a.budget > floor.above);

/** What a due try takes from its ask's `--budget`: the cap it raises to, on a session, and `pastCap` where the step was past its budget. */
const raisedBy = (ask: RetryAsk, raise: Raise | undefined): Pick<Retry, 'budget' | 'pastCap'> =>
  ask.budget === undefined || ask.mode === 'recheck' ? {} : { budget: ask.budget, ...(raise ? { pastCap: true as const } : {}) };

/**
 * Whether a person's ask says what a send-back from a gate needs (`sendsBack`): words. One with none — written while the step's harness
 * blocked its session, which takes a wordless try, or by hand — tells a session it was sent back and gives it nothing to change, so no tick
 * files it for a step at its gate, as `nemia retry` refuses to write one.
 */
export const heard = (a: Pick<RetryAsk, 'message'>, sendsBack: true | undefined): boolean => !sendsBack || a.message !== undefined;

/** The task a pause's ask is written for, as the step's record names it now: its check's for a recheck, else its session's. */
const currentOf = (run: Run, a: RetryAsk): string | null | undefined =>
  a.mode === 'recheck' ? run.steps[a.step]?.check?.taskId : run.steps[a.step]?.taskId;

/**
 * Whether an ask may be due on its task's standing: any ask of a person's own, and the ask `nemia pause --now` wrote (`interrupted`) only
 * while the task it stopped is still the step's current one and the engine reads it settled `stopped`. So such an ask never stops a session
 * first, and never tries a step that ended on its own before its stop was taken.
 */
const pauseAskDue = (run: Run, a: RetryAsk, phaseOf: (taskId: string) => TaskPhase): boolean =>
  a.interrupted === undefined || (currentOf(run, a) === a.interrupted && phaseOf(a.interrupted) === 'stopped');

/**
 * Whether the ask `nemia pause --now` wrote for a task (`interrupted`) is void: never to be filed, and set aside by the tick, paused or not
 * (`consumeAsks`). Void once the step's current task is another — a later try replaced it — or once that task settled other than
 * `stopped` — it succeeded or failed on its own, its check exited with a number — or settled `stopped` on a step over its budget, which
 * the ask, written with no `--budget`, does not carry (`carries`). Not void while the task has not settled: its stop may still be taken.
 * An ask of a person's own is never void here. Pure.
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a step over its budget.
 */
export function pauseAskVoid(
  step: Workflow,
  run: Run,
  a: RetryAsk,
  phaseOf: (taskId: string) => TaskPhase,
  spendOf: SpendOf = () => undefined,
): boolean {
  if (a.interrupted === undefined) return false;
  if (currentOf(run, a) !== a.interrupted) return true;
  const phase = phaseOf(a.interrupted);
  if (!SETTLED.has(phase)) return false;
  const floor = raiseOf(step, run, spendOf);
  return phase !== 'stopped' || !carries(a, overBudget(step, run, spendOf) ? floor : undefined, floor);
}

/**
 * The asks among `asks` that `nemia pause --now` wrote and that are void on this pass (`pauseAskVoid`), each of a step of `steps`. Pure.
 */
export const pauseAsksVoid = (
  steps: readonly Workflow[],
  run: Run,
  asks: readonly RetryAsk[],
  phaseOf: (taskId: string) => TaskPhase,
  spendOf: SpendOf = () => undefined,
): RetryAsk[] =>
  asks.filter((a) => {
    const step = steps.find((s) => s.name === a.step);
    return step !== undefined && pauseAskVoid(step, run, a, phaseOf, spendOf);
  });

/**
 * The tries due now. Pure, and blind to cancellation on purpose: `assess` answers for a cancelled run, and
 * `advance` looks for a try a pass filed and never wrote down whatever became of the run after.
 *
 * A person's ask for a step's next try, when the step may be tried again that way. For a step whose task has not settled, with
 * `stopFirst`, since its session is still there to stop — `--nudge` or `--fresh`, the ways `nemia retry` takes for a session its harness
 * blocked (`retryable`), whether or not the harness still says so. An ask can only be written for such a step while its harness blocks
 * the session, and the session can work again before a tick stops it, told something by a peer with no `nemia up` running. Left for its
 * task to settle, such an ask would be neither due nor spent, and the step's next failure would file it at once, ahead of `retries:`. So
 * the engine's record of the task decides, as it does everywhere here, not what the harness said when the ask was written; `runsOn`
 * marks a session the harness no longer calls blocked. Otherwise a check that REFUSED (`refusedCheck`), while `retries:` has tries left:
 * the step re-filed as a nudge. Past them, or for a check that did not finish, nothing is due — the step waits on the person.
 *
 * And a session that ended `unsigned` — quiet, or `done` by its harness, without the closing statement it was asked for — that said
 * nothing at all — a session that said anything reads `failed`, not `unsigned` (`ownStatus`) — its session continued once (`signoff`),
 * told it ended without calling `StructuredOutput`, that its work stands and it should change nothing and sign off, finishing first if
 * it had not, and signing off anyway saying what stops it if it cannot (`retrySection`). Once a round (`signoffsSpent`), never in a
 * loop: a nudge that ends unsigned again leaves the step `unsigned`, on a person. Keyed on what the engine recorded (`closeoutAsked`:
 * `stated: false`, or a reason `unsigned`), not on the step's word `unsigned`, which also covers a closeout short of a declared field —
 * a statement given, which a reminder to give one would not mend — and a `done` whose end says nothing of a statement. Nor is a step
 * over its budget nudged: its status is `over budget`, and the run spends nothing more on it on its own word.
 *
 * And a step `unsigned` because its closeout named a file the run did not have (`lackedOf`) is nudged the same way, under the same one
 * nudge a round (`signoffDue`): its session continued, told each file, why, and to write it or take the name off. One that names a file
 * the run does not have again stays `unsigned`, on a person.
 *
 * An ask names one try, by number, so it is honoured once: an ask for a try the record already holds is
 * spent (`spentAsks`) and files nothing, whichever pass reads it.
 *
 * A step over its budget, or ended at it, is never tried on the run's word — it is not `failed (check)`, so `retries:` files nothing — and
 * a person's ask for a session of it is due only with a `--budget` above what it has spent (`Raise`), the try marked `pastCap`. An ask with
 * a `--budget` on any step is due only where the step has a cap and the amount is above its floor (`carries`). The try carries it, and the
 * record keeps it.
 *
 * A step at its gate, or approved and not handed on (`sendsBack`), is tried only on an ask with words (`heard`): a wordless one, asked
 * while its harness blocked the session that then signed off, would send it back with nothing to change, before anyone read what it handed
 * on.
 *
 * An ending the work is sent back from is not also tried: its own ask, written by hand beside the send-back, names the try the send-back
 * takes, and is spent by it (`spentAsks`).
 *
 * @param harnessBlocked Whether a task's session is blocked by its harness (`retryable`): what makes a person's try of such a step due,
 *   to stop it first.
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a step over its budget.
 */
export function retriesDue(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  harnessBlocked: (taskId: string) => boolean = () => false,
  spendOf: SpendOf = () => undefined,
): Retry[] {
  const due: Retry[] = [];
  const open = asks.filter((a) => pauseAskDue(run, a, phaseOf));
  for (const step of steps) {
    const record = run.steps[step.name];
    const { status, modes, blockedByHarness, sendsBack, back, raise } = retryable(
      step,
      run,
      phaseOf,
      closeoutOf,
      askedCloseout,
      steps,
      harnessBlocked,
      spendOf,
      verdictOf,
    );
    if (!record?.taskId) continue;
    const phase = phaseOf(record.taskId);
    const unsettled = phase === 'pending' || phase === 'running';
    const ways = unsettled ? STOPPED_FIRST : modes;
    if (!ways.length) continue;
    const next = tryOf(run, step.name) + 1;
    const ask = open.find(
      (a) =>
        a.step === step.name &&
        a.try === next &&
        ways.includes(a.mode) &&
        carries(a, raise, raiseOf(step, run, spendOf)) &&
        heard(a, sendsBack),
    );
    if (ask) {
      due.push({
        step: step.name,
        try: next,
        mode: ask.mode,
        ...(ask.model ? { model: ask.model } : {}),
        ...(ask.message !== undefined ? { message: ask.message } : {}),
        ...raisedBy(ask, raise),
        by: askedBy(ask),
        ...(unsettled ? { stopFirst: true as const, ...(blockedByHarness ? {} : { runsOn: true as const }) } : {}),
        ...(back && !unsettled ? { back } : {}),
      });
    } else if (
      status === 'failed (check)' &&
      record.check &&
      refusedCheck(phaseOf(record.check.taskId), verdictOf(step.name)) &&
      retriesSpent(record) < (step.retries ?? 0)
    ) {
      due.push({ step: step.name, try: next, mode: 'nudge', by: 'retries' });
    } else if (status === 'unsigned' && signoffDue(record, askedCloseout(record.taskId))) {
      due.push({ step: step.name, try: next, mode: 'nudge', by: 'signoff' });
    }
  }
  return due.filter((r) => !due.some((o) => o.back?.includes(r.step)));
}

/** Who asked for a try by its ask: `nemia pause --now`, where the ask names the task it stopped, else a person. */
const askedBy = (ask: RetryAsk): 'ask' | 'pause' => (ask.interrupted === undefined ? 'ask' : 'pause');

/**
 * The ways a person's try of a step whose task has not settled may be asked for: those `retryable` takes for a session its harness blocked.
 */
const STOPPED_FIRST: readonly RetryMode[] = ['nudge', 'fresh'];

/**
 * How a step's record reached the try it is on, for `nemia ls` and `nemia decide`: `try 2, by retries: 2` — and for a step of a loop past
 * its first round, the round, before any try within it: `round 2 of 3`, `round 2 of 3, try 3, by retries: 1`. Empty on a first try.
 * A try a person asked for with a message says so, last: `try 2, nudged on your word, answered` — `answered` is the caller's
 * reading of the ask files (`answerOf`), since the record keeps no message. A cap a person raised is said beside the try it was raised
 * for: `budget $5`.
 */
export function tryNote(step: Workflow, record: StepRecord | undefined, steps: readonly Workflow[] = [], answered = false): string {
  const last = record?.tries?.at(-1);
  if (!last) return '';
  const looping = loopOf(steps, step.name);
  const round = roundIn(record);
  const inRound = looping && round > 1 ? roundWord(round, capOf(looping)) : '';
  const raised = last.budget !== undefined ? `budget ${budgetWord(last.budget)}` : '';
  if (last.then === 'round') return [inRound, raised].filter(Boolean).join(', ');
  const how = howOf(step, last);
  return [inRound, `try ${record!.tries!.length + 1}, ${how}`, raised, answered ? 'answered' : ''].filter(Boolean).join(', ');
}

/**
 * How a try was asked for, as `tryNote` says it: by `retries:`, the run's sign-off nudge, the pause, or a person's word — its mode, or a
 * merge of the base.
 */
function howOf(step: Workflow, last: EarlierTry): string {
  if (last.then === 'retries') return `by retries: ${step.retries ?? 0}`;
  if (last.then === 'signoff') return 'nudged to sign off by the run';
  if (last.paused) return `${last.then === 'recheck' ? 'rechecked' : 'continued'} after nemia pause --now`;
  if (last.then === 'recheck') return 'rechecked on your word';
  if (last.then === 'fresh') return `fresh${last.model ? ` on ${last.model}` : ''}, on your word`;
  if (last.then === 'merge') return 'merged the base, on your word (nemia merge), the round unchanged';
  return last.then === 'back' ? 'sent back with the work, on your word' : 'nudged on your word';
}

/** What a new session of a step over its budget needs, beside an offer that files one: a `--budget` above what its tries have cost. */
const sessionNeeds = (raise: Raise | undefined): string =>
  raise
    ? `  (a new session needs --budget above ${aboveWord(raise)}: its tries have cost ${spentWord(raise.spent)} of ${budgetWord(raise.cap)})`
    : '';

/**
 * The words of the offer to raise a step's cap past what it spent (`retryOffers`): its bare command, from `command`, what comes before it
 * in the sentence, from the step's state (`word`) and whether a ship may run again (`shipAgain`), and what after, ending on `more`.
 */
const raiseWords = (command: string, word: string, raise: Raise, shipAgain: string, more: string): [string, string, string] => [
  `${command} --budget <amount>`,
  `${word}, ${spentWord(raise.spent)} of ${budgetWord(raise.cap)}.${shipAgain} Raise its cap above ${aboveWord(raise)} and continue its session`,
  `  (--fresh, or --model <m>, for a new session${more})`,
];

/**
 * The words of the offer to send a step's work back when the endings after it (`back`) stopped on the base branch (`retryOffers`): its
 * bare command, from `command`, and what comes before it in the sentence.
 */
const backWords = (command: string, step: string, back: string): [string, string] => [
  `${command} --message "<objection>"`,
  `${back} stopped on the base branch. Send the work back, when it does not hold on the base branch — ${step} is filed again with your objection and what ${back} said, may ask for a round, and ${back} waits at its gate for a new approval`,
];

/**
 * The words of the offer to an ending that lands on its check, whose merge the run aborted (`retryOffers`): its bare `command`, what comes
 * before it in the sentence and what after. Merge and check again when its check did not finish (`unfinished`), with nothing staged for
 * `--recheck` to judge; otherwise continue its session, told what happened (`happened`). Each with what a new session needs past a budget.
 */
const abortedWords = (
  run: Run,
  command: string,
  unfinished: boolean,
  raise: Raise | undefined,
  happened: string,
): [string, string, string] =>
  unfinished
    ? [
        command,
        `its check did not finish, so the run aborted the merge and nothing landed on ${run.branch}. Merge and check again`,
        sessionNeeds(raise),
      ]
    : [
        command,
        `${happened} Continue its session, told what happened`,
        `  (--fresh, or --model <m>, for a new session${sessionNeeds(raise)})`,
      ];

/**
 * What `nemia decide` offers for each step a person may try again: the command, and what it does. Pure.
 *
 * A check that did not finish is said so, with `--recheck` first: the run spent no retry on it, and the work
 * may pass as it stands. For anything else, `nemia retry` continues the step's session, told what happened.
 *
 * Each offer is its sentence and, beside it, the bare command it ends on (`Offer`), which the board offers (`choicesOf`): the sentence is
 * written around the command, `<step>: …:  nemia retry <run> <step>  (--fresh…`, so the two cannot say different things. The answer to a
 * blocked step is `answerLines`', beside its question.
 *
 * None on a pruned run (`prunedRefusal`), nor on a held one (`heldRefusal`), whose decision is `running` and says so. A step at its gate
 * is offered its approval and its send-back (`gateLines`), never a try with nothing to change. The looping step an ending that stopped
 * on the base branch waits on is offered the send-back, which no gate line offers, and the ending a ship again for what was not the work.
 * An ending that lands on its check, whose merge the run aborted, is offered with why, and one whose check did not finish a merge again,
 * with nothing staged for `--recheck` to judge. Otherwise a check that did not finish is offered `--recheck` first, past a budget or not;
 * a step over budget, the raise, with why it stopped beside the cap, since a person pays for a broken session differently; and a remote
 * agent's try, a new Task, never its session continued, with no `--model` (`remoteRetryRefusal`).
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): a step over its budget, or ended at it, is offered its try with `--budget`.
 * @param verdictOf What each step's current check exited with (`stepStatus`): a check that refused past a budget is offered `--budget`,
 *   one that did not finish the recheck.
 * @param landingDenied What the run's place denies a landing session (`landingDenies`), read for a denied ending alone: a call it denies
 *   is said to be the step's own fence at work, and offered no rule.
 */
export function retryOffers(
  steps: readonly Workflow[],
  run: Run,
  d: Decision,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  spendOf: SpendOf = () => undefined,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  landingDenied: () => readonly string[] = () => [],
): Offer[] {
  if (d.kind !== 'awaiting' || run.pruned || run.hold) return [];
  const lines: Offer[] = [];
  for (const step of steps) {
    const offer = (bare: string, before: string, after = '') =>
      lines.push({ step: step.name, command: bare, said: `${step.name}: ${before}:  ${bare}${after}` });
    const { status, modes, sendsBack, back, raise } = retryable(
      step,
      run,
      phaseOf,
      closeoutOf,
      askedCloseout,
      steps,
      () => false,
      spendOf,
      verdictOf,
    );
    const command = `nemia retry ${run.id} ${step.name}`;
    if (back) {
      offer(...backWords(command, step.name, back.join(', ')));
      continue;
    }
    if (!modes.length || sendsBack) continue;
    const shipAgain = endingStopped(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)
      ? ' Ship again, when what stopped it was not the work — a dirty checkout, a flaky test.'
      : '';
    const spent = step.retries ? `; retries: ${step.retries}, ${retriesSpent(run.steps[step.name])} spent` : '';
    const record = run.steps[step.name];
    if (landsOnCheck(step, run) && record?.landed && 'aborted' in record.landed) {
      offer(
        ...abortedWords(
          run,
          `${command}${raise ? ' --budget <amount>' : ''}`,
          d.unfinishedCheck.includes(step.name),
          raise,
          `${status} — ${landedWords(run, record.landed)}.${shipAgain}`,
        ),
      );
      continue;
    }
    if (d.unfinishedCheck.includes(step.name)) {
      offer(
        `${command} --recheck`,
        'its check did not finish, so no retry was spent on it. Run the check again, and nothing else',
        sessionNeeds(raise),
      );
    } else if (raise) {
      const recheck = modes.includes('recheck') ? '; --recheck runs its check again, and needs no --budget' : '';
      const own = ownStatus(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
      const word = status === 'over budget' ? `over budget (${own === 'failed (check)' ? 'check refused' : own})` : status;
      offer(...raiseWords(command, word, raise, shipAgain, `${spent}${recheck}`));
    } else if (status === 'denied') {
      offer(
        `${command} --fresh`,
        `${deniedOffer(spendOf(run.steps[step.name].taskId!)?.denied ?? [], { disallowedTools: filedDenies(step, run, landingDenied) }, { cwd: run.steps[step.name].workspace, runId: run.id })}${shipAgain} A new session, told to do without it`,
        `  (or continue its session: ${command})`,
      );
    } else if (isRemoteHarness(step.harness)) {
      offer(command, `${status}. Send it again, as a new Task told what happened`, spent ? `  (${spent.slice(2)})` : '');
    } else {
      offer(
        command,
        `${status}.${shipAgain} Continue its session, told what happened`,
        `  (--fresh, or --model <m>, for a new session${spent})`,
      );
    }
  }
  return lines;
}

/** What `nemia decide` offers for each step a person may try again, as its lines: each offer's sentence (`retryOffers`). Pure. */
export const retryLines = (...args: Parameters<typeof retryOffers>): string[] => retryOffers(...args).map((o) => o.said);

/**
 * The longest one rule `deniedOffer` prints: a rule clipped with `…` is not one a person can copy into `allowedTools:`, so a path goes
 * whole but for a pathological one.
 */
const RULE_CAP = 240;

/**
 * Why a step that says `denials: fail` waits on you, and the way on that is not a try: the rules the folder's `allowedTools:` needs for a
 * new run (`allowRuleOf`), since this run's is frozen at `nemia start` and nothing widens it — `Bash(pytest)` denied is `Bash(pytest:*)`, a
 * file written, by any tool, `Edit(…)`, and a path in the step's own directory written from it (`at`), since the next run's is another. A
 * call the step's own `disallowedTools:` may have denied (`disallowedBy`) is offered no rule: a deny beats every allow, so the rule would
 * allow nothing, and the offer says which of its rules is at work instead. Each rule one line (`oneLine`), since the harness's words are
 * free text; at most `DENIED_SHOWN`, then how many more, as `deniedWords` names the calls themselves. Pure.
 */
export function deniedOffer(denied: readonly string[], step: Pick<Workflow, 'disallowedTools'> = {}, at: DeniedAt = {}): string {
  const calls = [...new Set(denied)];
  const fenced = calls.flatMap((call) => {
    const rule = disallowedBy(call, step.disallowedTools ?? [], at);
    return rule ? [{ call, rule }] : [];
  });
  const rules = [...new Set(calls.filter((call) => !fenced.some((f) => f.call === call)).map((call) => allowRuleOf(call, at)))];
  const add = rules.length
    ? ` For a new run, add ${shownList(rules)} to the folder's allowedTools:, which allows ${rules.length === 1 ? 'it' : 'them'}.`
    : '';
  const own = fenced.length
    ? ` ${shownList(fenced.map((f) => f.call))} may be its own disallowedTools: at work (${shownList([...new Set(fenced.map((f) => f.rule))])}), which beats any allowedTools:, so no rule is offered for ${fenced.length === 1 ? 'it' : 'them'}.`
    : '';
  return `denied — its harness denied its try ${calls.length === 1 ? 'a call' : 'calls'}, and denials: fail passes none on.${add}${own} This run's allowedTools: is frozen at nemia start, so a try of it is denied the same again.`;
}

/** Rules or calls as `deniedOffer` names them: each one line, the first `DENIED_SHOWN`, then how many more. Pure. */
function shownList(words: readonly string[]): string {
  const named = words.slice(0, DENIED_SHOWN).map((word) => oneLine(word, RULE_CAP));
  const more = words.length - named.length;
  return `${named.join(', ')}${more ? ` and ${more} more (nemia logs)` : ''}`;
}

/**
 * `nemia decide`'s OVER BUDGET line, saying for each step why it is held. A step whose own tries cost its budget or more gives the amounts:
 * `implement ($4.25 of $3)`. A looping step held because its round would file such a step again names that step, as `nemia ls` does:
 * `review (held: its round would file implement again, which has cost $4.25 of its $3 budget)`. Pure. Undefined with no step over budget.
 * How each ended on its own work is on its own line — FAILED, UNSIGNED, FAILED CHECK (`decision`). On a pruned run it waits on nobody, and
 * says the run was pruned where it would say so: the raise it waits for, a try or a round, is refused (`prunedRefusal`), as `listing`
 * waits on nobody for it. On a held run it waits on nobody either: the raise is refused while the hold stands (`heldRefusal`), and asked
 * for once it lifts.
 */
export function overBudgetLine(steps: readonly Workflow[], run: Run, d: Decision, spendOf: SpendOf): string | undefined {
  if (d.kind !== 'awaiting' || !d.overBudget.length) return undefined;
  const why = d.overBudget.map((name) => {
    const step = steps.find((s) => s.name === name);
    const own = step ? overBudget(step, run, spendOf) : undefined;
    if (own) return `${name} (${spentWord(own.spent)} of ${budgetWord(own.cap)})`;
    const others = step ? loopOver(steps, step, run, spendOf) : [];
    if (!others.length) return name;
    return `${name} (held: its round would file ${others.map((o) => `${o.name} again, which has cost ${spentWord(o.spent)} of its ${budgetWord(o.cap)} budget`).join(', and ')})`;
  });
  const them = d.overBudget.length > 1 ? 'them' : 'it';
  if (run.pruned)
    return `OVER BUDGET: ${why.join(', ')}  — nothing more is filed for ${them}, raised or not, since the run was ${prunedWords(run.pruned)}; nothing after ${them} ran`;
  if (run.hold) return `OVER BUDGET: ${why.join(', ')}  — ${heldLater(run.hold, 'the raise')}; nothing after ${them} ran`;
  return `OVER BUDGET, waiting on you: ${why.join(', ')}  — the run files nothing more for ${them} on its own; nothing after ${them} ran`;
}

/**
 * For each step that signed off blocked and may be tried again, the `nemia retry` that answers its `needs`, as `nemia decide` prints it
 * under the question. Pure. Not among `retryLines`' offers, whose shape the board reads. None for a blocked step whose session has not
 * settled, which a try would run beside, and none on a run that is not waiting on a person. None on a pruned run (`prunedRefusal`), whose
 * question stays with nothing to answer it, nor on a held one (`heldRefusal`), whose question is asked again once the hold lifts.
 *
 * A closeout that asks questions is answered with an `--answer` for each (`answersOr`), one that asks none with `--message`.
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): a blocked step over its budget is answered with `--budget` too.
 */
export function answerLines(
  steps: readonly Workflow[],
  run: Run,
  d: Decision,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  spendOf: SpendOf = () => undefined,
): Record<string, string> {
  if (d.kind !== 'awaiting' || run.pruned || run.hold) return {};
  const lines: Record<string, string> = {};
  for (const step of steps) {
    const { status, modes, raise } = retryable(step, run, phaseOf, closeoutOf, askedCloseout, steps, () => false, spendOf);
    const answer = answersOr(step, closeoutOf(step.name), '--message "<answer>"');
    if (status === 'blocked' && modes.length) lines[step.name] = `to answer it:  nemia retry ${run.id} ${step.name} ${answer}`;
    else if (raise && modes.length && closeoutOf(step.name)?.outcome === 'blocked') {
      lines[step.name] =
        `to answer it, its cap raised above ${aboveWord(raise)}:  nemia retry ${run.id} ${step.name} --budget <amount> ${answer}`;
    }
  }
  return lines;
}
