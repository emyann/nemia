/**
 * What `nemia retry` refuses (`retryRefusal`): the ask read first, then the step's standing, each refusal a named phase, asked in the order
 * a person is told them. Pure; what may be tried is `retry.ts`'s (`retryable`, `retriesDue`).
 */
import type { StepSpec } from '../step/step.ts';
import {
  lackedOf,
  refusedCheck,
  tryOf,
  type CloseoutAsked,
  type Run,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import {
  aboveWord,
  approvalOf,
  budgetRefusal,
  capOf,
  gateWords,
  loopOf,
  raiseOf,
  raiseWords,
  spentWord,
  type Raise,
  type SpendOf,
} from '../status/status.ts';
import { budgetWord } from '../money/money.ts';
import type { Verdict } from '../check/index.ts';
import { messageRefusal, modeWord, retriesSpent, type RetryAsk, type RetryHow } from './retry-ask.ts';
import { carries, heard, pauseAskVoid, retriesDue, retryable, type CheckKillOf } from './retry.ts';
import { blockedRecheck, blockedRecheckRead, type TipOf } from './blocked-recheck.ts';
import { remoteRetryRefusal } from '../harness/harness.ts';
import { listedFor, modelWords, stepModelJudged, type ModelLists } from '../workflow/index.ts';
import { answersOr } from '../question/index.ts';
import { heldRefusal, prunedRefusal } from '../forget/prune/prune.ts';
import { checksPhase } from '../check/index.ts';

/** What `retryRefusal` was asked: its arguments, and the command its refusals name. */
type Asked = {
  steps: readonly StepSpec[];
  run: Run;
  name: string;
  how: RetryHow;
  command: string;
  phaseOf: (taskId: string) => TaskPhase;
  closeoutOf: (step: string) => Closeout | undefined;
  askedCloseout: (taskId: string) => CloseoutAsked;
  verdictOf: (step: string) => Verdict | undefined;
  asks: readonly RetryAsk[];
  harnessBlocked: (taskId: string) => boolean;
  spendOf: SpendOf;
  checkKillOf: CheckKillOf;
  tipOf: TipOf;
  lists: ModelLists | undefined;
};

/**
 * The ask with the step's standing read (`retryable`): the step, its next try, the ask already waiting for it (`pending`), and the ending

 */
type Judged = Asked &
  ReturnType<typeof retryable> & {
    step: StepSpec;
    next: number;
    pending?: RetryAsk;
    floor?: Raise;
  };

/**
 * Why `nemia retry` will not ask for this, in words that say what to do instead — or null, when it may. Pure.
 *
 * Refused: a message that cannot ride on the ask (`messageRefusal`); a step the run does not have; a `--model` its harness does not list
 * by that id, or on which a step in `auto` would run in `default` (`stepModelJudged`, as the load refuses it on the step's own `model:`);
 * a cancelled run, which files
 * nothing, so the ask would never be honoured; an ask for the same try already waiting — one `nemia pause --now` wrote that is void
 * (`pauseAskVoid`) too, said as set aside by the next pass, which alone moves it; a step whose last try is not over, or that let what
 * waits on it run (`retryable`); `--recheck` where no check failed;
 * and a step the run is about to try again itself, because `retries:` still covers its refusal — that step is not waiting on a person.
 *
 * A send-back is an objection, refused with no words: a try with nothing to change would sign off as it did, and wait there again.
 *
 * A step whose session its harness blocked, with nothing signed, may be asked for only when `harnessBlocked` is given: the tick
 * stops that session before it files the try (`retryable`). Without it, such a step is still running, and refused as one.
 *
 * A budget: a `--budget` that is not an amount or rides on `--recheck` (`budgetRefusal`); a session of a step over its budget, or ended at
 * it, asked for without a `--budget` (`Raise`); a `--budget` on a step with no `budget:`, which has no cap to raise, or one not above its
 * floor (`raiseOf`: what its tries have cost, and the cap in force) — each by name; and an ask already waiting that no tick will honour,
 * for want of a `--budget` or for one the step cannot take. A `--budget` above the floor is taken on any step a person may try, blocked
 * or failed as much as over its budget. A step over its budget whose check did not finish is offered the recheck first, which costs nothing
 * and needs no `--budget`. A step the run tries again itself is told so before any of these, so no refusal's fix is a `--budget` that
 * would be refused next.
 *
 * @param steps The run's steps.
 * @param run The run's record.
 * @param name The step the ask names.
 * @param how How the try is asked for.
 * @param phaseOf The phase of a task by its id.
 * @param closeoutOf The closeout of a step by its name: left out, none has one.
 * @param askedCloseout What the engine says of the closeout a task was asked for: left out, none was asked.
 * @param verdictOf The verdict of a step's check by its name: left out, none has one.
 * @param asks The asks of the run already waiting: left out, none.
 * @param harnessBlocked Whether a task's session is blocked by its harness (`retryable`). Left out, a step whose session is blocked is
 *   running, and refused.
 * @param spendOf What each task's sessions cost (`taskSpend`). Left out, no step is over budget, and `--budget` is refused on every one.
 * @param checkKillOf What the machine's OOM killer did to each step's current check: left out, it killed nothing.
 * @param tipOf Where each branch of the run is now (`blockedRecheck`): left out, no blocked step may be rechecked, each told why.
 * @param lists The models each harness lists, as the store recorded them: left out, no `--model` is judged.
 */
export function retryRefusal(
  steps: readonly StepSpec[],
  run: Run,
  name: string,
  how: RetryHow,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  harnessBlocked: (taskId: string) => boolean = () => false,
  spendOf: SpendOf = () => undefined,
  checkKillOf: CheckKillOf = () => undefined,
  tipOf: TipOf = () => undefined,
  lists?: ModelLists,
) {
  const asked: Asked = {
    steps,
    run,
    name,
    how,
    command: `nemia retry ${run.id} ${name}`,
    phaseOf,
    closeoutOf,
    askedCloseout,
    verdictOf,
    asks,
    harnessBlocked,
    spendOf,
    checkKillOf,
    tipOf,
    lists,
  };
  const step = askedStep(asked);
  if (typeof step === 'string') return step;
  const c = judged(asked, step);
  return (
    pendingRefusal(c) ??
    (c.modes.length ? undefined : nothingToTry(c)) ??
    modeRefusal(c) ??
    checkNameRefusal(c) ??
    wordlessRefusal(c) ??
    runTriesItself(c) ??
    budgetAskRefusal(c) ??
    null
  );
}

/**
 * The step asked for — or why the ask is refused before its standing is read: words or a budget that cannot ride on it, a step the run
 * does not have, a flag a remote step cannot take, a model its harness does not list or that drops the step's mode, and a run
 * cancelled, pruned or held.
 */
function askedStep(asked: Asked) {
  const { steps, run, name, how, command } = asked;
  const wrong = messageRefusal(how, command) ?? budgetRefusal(how, command);
  if (wrong) return wrong;
  const step = steps.find((s) => s.name === name);
  if (!step || !run.steps[name]) return `${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`;
  const remote =
    (how.model === undefined ? undefined : remoteRetryRefusal(step, 'model', how.model, command)) ??
    (how.budget === undefined ? undefined : remoteRetryRefusal(step, 'budget', how.budget, command));
  if (remote) return remote;
  const words =
    how.model === undefined
      ? undefined
      : modelWords(how.model, stepModelJudged(how.model, step, asked.lists), listedFor(step.harness, asked.lists));
  if (words) return `\`--model ${how.model}\`: ${name}: ${words} The step's mode is frozen with the run.`;
  if (run.cancelledAt) {
    return `${run.id} was cancelled at ${run.cancelledAt}, and a cancelled run files nothing, so a retry would never be honoured. Start a new run for the work with nemia start.`;
  }
  const pruned = prunedRefusal(run, 'a retry');
  if (pruned) return pruned;
  const holding = heldRefusal(run, 'a retry');
  if (holding) return holding;
  return step;
}

/** The ask with the step's standing read, once the step is known to exist. */
function judged(asked: Asked, step: StepSpec) {
  const { steps, run, name, phaseOf, closeoutOf, askedCloseout, asks, spendOf } = asked;
  const next = tryOf(run, name) + 1;
  const floor = raiseOf(step, run, spendOf);
  return {
    ...asked,
    ...retryable(step, run, phaseOf, closeoutOf, askedCloseout, steps, asked.harnessBlocked, spendOf, asked.verdictOf, asked.tipOf),
    step,
    next,
    pending: asks.find((a) => a.step === name && a.try === next),
    ...(floor ? { floor } : {}),
  };
}

/** The ask `nemia pause --now` wrote for this try: void, which the next pass sets aside; or still due, tried on the resume. */
function pauseAskRefusal(c: Judged) {
  const { run, name, command, next, pending } = c;
  if (pending?.interrupted === undefined) return undefined;
  const ran = pending.mode === 'recheck' ? 'check' : 'session';
  if (pauseAskVoid(c.step, run, pending, c.phaseOf, c.spendOf)) {
    return `try ${next} of ${name} is held by the ask nemia pause --now wrote (at ${pending.at}), void since its ${ran} ended on its own or another try replaced it: the next pass sets it aside, and no tick files it. Ask again once it has: ${command}.`;
  }
  return `try ${next} of ${name} is asked by nemia pause --now (at ${pending.at}), which stopped its ${ran}: it is tried once the store is resumed (nemia resume), or set aside if it ended on its own first. Wait for it: nemia ls ${run.id}.`;
}

/**
 * An ask already waiting: for this try — one no tick honours, or one it will — or a send-back or a try to land again that takes the same
 * try.
 */
function pendingRefusal(c: Judged) {
  const paused = pauseAskRefusal(c);
  if (paused !== undefined) return paused;
  const { run, name, command, next, pending, sendsBack } = c;
  if (pending && !carries(pending, c.raise, c.floor)) return uncarriedRefusal(c, pending);
  if (pending && !heard(pending, sendsBack)) {
    return `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) with no words, and ${name} ${gateWords(run, name)}, so no tick honours it: a send-back says what to change. Take that ask back — nemia retry ${run.id} ${name} --off — and ask again: ${command} --message "<objection>".`;
  }
  if (pending) {
    return `try ${next} of ${name} is already asked for (${modeWord(pending)}, at ${pending.at}), and the next tick honours it once. Wait for it: nemia ls ${run.id}.`;
  }
  return undefined;
}

/** An ask already waiting that no tick honours for its budget: one missing past the cap, or one the step cannot take. */
function uncarriedRefusal(c: Judged, pending: RetryAsk) {
  const { run, name, command, next, status, raise, floor } = c;
  const asked = `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at})`;
  const again = `Take that ask back — nemia retry ${run.id} ${name} --off — and ask again`;
  if (pending.budget === undefined && raise !== undefined) {
    return `${asked} without a --budget above ${aboveWord(raise)}, and ${name} ${raiseWords(status, raise)}, so no tick honours it. ${again}: ${command} --budget <amount>.`;
  }
  if (!floor) {
    return `${asked} with --budget ${pending.budget}, and ${name} has no \`budget:\`, so there is no cap to raise and no tick honours it. ${again}: ${command}.`;
  }
  return `${asked} with --budget ${pending.budget}, not above ${aboveWord(floor)}, so no tick honours it. ${again}: ${command} --budget <amount>.`;
}

/** Why a step with no way to be tried has none: its status. */
function nothingToTry(c: Judged) {
  return statusRefusal(c);
}

/** What a step's status says of a try, when it has none: not filed, running, checking, done, or a loop's round to go. */
function statusRefusal(c: Judged) {
  const { steps, step, run, name, status } = c;
  const why: Partial<Record<StepStatus, string>> = {
    pending: `${name} has not been filed yet, so there is no try to replace. Wait for it: nemia ls ${run.id}.`,
    running: `${name} is still running, so there is nothing to try again until it ends. Wait for it: nemia ls ${run.id} (or stop the run: nemia cancel ${run.id}).`,
    checking: `${name}'s check is still due or running, so there is no verdict to act on yet. Wait for it: nemia ls ${run.id}.`,
    verified: `${name} is verified: its check passed, and there is nothing to try again.`,
    unverified: `${name} signed off done and declares no check: what waits on it has been filed, and there is nothing to try again.`,
    blocked: `${name} signed off blocked and its session has not ended, so a new try would run beside it. Wait for it to settle: nemia ls ${run.id}.`,
    exhausted: `${name} asked for another round on the last one \`rounds: ${capOf(step)}\` allows: its work is signed, and what happens next is a person's call, not another try. Go round once more — nemia retry ${run.id} ${name} --round — or take the work as it stands, its findings open: nemia approve ${run.id} ${name} --message "<why>".`,
    'over budget': `${name} did its work, and its loop asks for a round that would file ${loopOf(steps, name)?.name === name ? 'a step of it' : 'it'} again, past its budget: going round is a person's call, not another try. Raise the cap with the round: nemia retry ${run.id} ${loopOf(steps, name)?.name ?? name} --round --budget <amount>.`,
  };
  return why[status] ?? `${name} is ${status}, and there is nothing to try again.`;
}

/**
 * `--recheck` where no check failed; and on a step ended at its
 * budget with no check to run, or whose staged merge the run took back, its session retry with `--budget` named instead.
 */
/**
 * `--check <name>` naming no refused check of the step: a step judged by one check, whose recheck runs it whole, or a name that is no check
 * of its several, or one whose task did not fail.
 */
function checkNameRefusal({ how, run, name, command, phaseOf }: Judged) {
  if (how.check === undefined) return undefined;
  const tasks = run.steps[name]?.check?.tasks;
  if (!tasks) return `--check names one of a step's several checks, and ${name} is judged by one: run it again with ${command} --recheck.`;
  const refused = Object.entries(tasks).flatMap(([check, id]) => (phaseOf(id) === 'failed' ? [check] : []));
  if (refused.includes(how.check)) return undefined;
  const which = refused.length
    ? `its refused ${refused.length === 1 ? 'check is' : 'checks are'} ${refused.join(', ')}`
    : 'none of its checks refused';
  return `--check ${how.check} names no refused check of ${name}: ${which}. Name one (${command} --recheck --check <name>), or recheck every one that did not pass: ${command} --recheck.`;
}

function modeRefusal(c: Judged) {
  const { run, name, how, command, modes, status, via, sendsBack } = c;
  if (modes.includes(how.mode)) return undefined;
  if (status === 'budget exhausted') return budgetStopRefusal(c);
  if (status === 'blocked') return blockedRecheckRefusal(c);
  const is =
    via === 'session'
      ? 'is running, its session blocked by its harness with nothing signed off'
      : status === 'denied'
        ? 'was denied a call by its harness, and its check was never run'
        : `is ${status}`;
  return `--recheck runs a step's check again, and ${name} ${is}: no check of it failed. ${
    sendsBack
      ? `To send it back from its gate, say what to change: nemia retry ${run.id} ${name} --message "<objection>".`
      : `Ask for another session instead: nemia retry ${run.id} ${name} (or --fresh).`
  }`;
}

/**
 * `--recheck` of a step that signed off blocked, refused where its failed check may not run again (`blockedRecheck`): each why says what to
 * do instead, and names only a command taken on the same state — a wait, or the session's answer.
 */
function blockedRecheckRefusal(c: Judged) {
  const { run, name, command, phaseOf, tipOf, closeoutOf } = c;
  const said = blockedRecheck(blockedRecheckRead(run.steps[name], true, phaseOf, tipOf));
  const answer = `${command} ${answersOr(c.step, closeoutOf(name), '--message "<answer>"')}`;
  const head = `--recheck runs again the check that failed before ${name} signed off blocked`;
  if (said.recheck) return `${head}, and may run again now: ${command} --recheck.`;
  switch (said.why) {
    case 'unsettled':
    case 'not blocked':
      return `${head}, and its session has not settled: wait for it, then ask again — nemia ls ${run.id}.`;
    case 'not handed off':
      return `${head}, and the run has not yet committed what its session left on its branch: the next pass does. Ask again after it — nemia ls ${run.id}.`;
    case 'unread':
      return `${head}, and where its branch stands now was not read: ask again with the store's daemon up (nemia up), which reads it.`;
    case 'moved':
      return `${head}, and its branch moved since that check was filed, from ${said.was} to ${said.now}: the check never judged what is there now. Answer it with a session, whose check judges it: ${answer}`;
    case 'unrecorded':
      return `${head}, and the commit that check judged was never recorded (a run filed before checks kept it): what it judged is unknown. Answer it with a session: ${answer}`;
    case 'no failed check':
      return `${head}, and no check of it failed before it did: there is nothing to run again. Answer it with a session: ${answer}`;
  }
}

/** `--recheck` of a step ended at its budget that has no check to run: its session, raised. */
function budgetStopRefusal({ command, raise }: Judged) {
  const why = `its session was ended at its budget, and it declares no check: there is nothing to run`;
  return `--recheck runs a step's check, and ${why}. Ask for another session, with its cap raised: ${command} --budget <amount>${
    raise ? ` (above ${aboveWord(raise)})` : ''
  }.`;
}

/** A send-back with no words, from the step's own gate. */
function wordlessRefusal(c: Judged) {
  const { run, name, how, command, sendsBack } = c;
  if (!sendsBack || how.message !== undefined) return undefined;
  const say = `Say what to change: ${command} --message "<objection>"${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
  const given = approvalOf(run, name);
  return `${name} ${gateWords(run, name)}: a try of it sends it back from its gate, and one with no words tells its session nothing to change, so it would sign off as it did. ${say} — or ${given ? 'leave it approved, and the next tick files what waits on it' : `approve it: nemia approve ${run.id} ${name}`}.`;
}

/** A `--budget` missing from a try of a step over its budget, or one given that the step cannot take. */
function budgetAskRefusal(c: Judged) {
  return raiseMissing(c) ?? budgetMisgiven(c);
}

/** A session of a step over its budget, or ended at it, asked for without a `--budget`: the recheck first, where it is offered. */
function raiseMissing(c: Judged) {
  const { name, how, command, modes, status, raise } = c;
  if (raise && how.mode !== 'recheck' && how.budget === undefined) {
    const withTry = `${command} --budget <amount>${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
    if (status === 'failed (check)' && modes.includes('recheck')) {
      return `${name}'s check did not finish, and ${name} ${raiseWords(status, raise)}. Run its check again, which needs no --budget: ${command} --recheck — or raise the cap for a new session, above ${aboveWord(raise)}: ${withTry}.`;
    }
    if (status === 'budget exhausted' && modes.includes('recheck')) {
      return `${name} ${raiseWords(status, raise)}, before its check ran. Run its check on the work as it stands, which needs no --budget: ${command} --recheck — or raise the cap for a new session, above ${aboveWord(raise)}: ${withTry}.`;
    }
    return `${name} ${raiseWords(status, raise)}, and the run spends nothing more on it until a person raises the cap. Raise it with the try, above ${aboveWord(raise)}: ${withTry}.`;
  }
  return undefined;
}

/**
 * A `--budget` a step cannot take: on a step with no `budget:`, which has no cap to raise; or not above its floor (`raiseOf`) — what its
 * tries have cost, or the cap in force, whichever is more — since a `--budget` only ever raises the cap.
 */
function budgetMisgiven(c: Judged) {
  const { name, how, command, status, raise, floor } = c;
  if (how.budget === undefined) return undefined;
  if (!floor) {
    return `--budget raises a step's cap, and ${name} has no \`budget:\`, so there is no cap to raise. Try it without --budget: ${command}.`;
  }
  if (how.budget > floor.above) return undefined;
  const capped = floor.above > floor.spent.usd;
  const what = !capped
    ? `what ${name}'s tries have cost`
    : raise
      ? `the ${budgetWord(floor.cap)} budget ${name}'s session was ended at`
      : `the ${budgetWord(floor.cap)} cap in force on ${name}, whose tries have cost ${spentWord(floor.spent)}`;
  const why = raise
    ? `a try under it would read ${status === 'budget exhausted' ? status : 'over budget'} again as soon as it ended`
    : '--budget only ever raises the cap';
  return `--budget ${how.budget} is not above ${aboveWord(floor)}, ${what}: ${why}. Give more than ${aboveWord(floor)}: ${command} --budget <amount>.`;
}

/** A step the run is about to try again itself: an ask to sign off, or a try `retries:` still covers. */
function runTriesItself(c: Judged) {
  const { steps, step, run, name, phaseOf, closeoutOf, askedCloseout, verdictOf, spendOf, checkKillOf, next } = c;
  const itself = retriesDue(steps, run, phaseOf, closeoutOf, askedCloseout, verdictOf, [], () => false, spendOf, checkKillOf, c.tipOf).find(
    (r) => r.step === name,
  );
  if (itself?.by === 'signoff') {
    const why = lackedOf(run.steps[name]).length
      ? 'its closeout named a file the run does not have'
      : 'its session ended without the closeout it was asked for';
    return `the run continues ${name} itself: ${why}, once a round, told to sign off, before it waits on you — the next tick files try ${next}. Wait for it: nemia ls ${run.id}.`;
  }
  if (itself?.mode === 'recheck') {
    const left = (step.retries ?? 0) - retriesSpent(run.steps[name]);
    return `the run runs ${name}'s check again itself: the machine ran out of memory and killed a process of it, and \`retries: ${step.retries}\` has ${left} left, so the next tick runs it as try ${next}. Wait for it: nemia ls ${run.id}.`;
  }
  if (itself) {
    const left = (step.retries ?? 0) - retriesSpent(run.steps[name]);
    return `the run tries ${name} again itself: its check refused, and \`retries: ${step.retries}\` has ${left} left, so the next tick files try ${next}. Wait for it: nemia ls ${run.id}.`;
  }
  return undefined;
}
