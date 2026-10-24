/**
 * What `nemia retry` refuses (`retryRefusal`): the ask read first, then the step's standing, each refusal a named phase, asked in the order
 * a person is told them. Pure; what may be tried is `retry.ts`'s (`retryable`, `retriesDue`).
 */
import type { Workflow } from '../step/step.ts';
import {
  lackedOf,
  refusedCheck,
  satisfiesAfter,
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
  budgetWord,
  capOf,
  endingStopped,
  gateWords,
  landsOnCheck,
  loopOf,
  ownStatus,
  raiseOf,
  raiseWords,
  sendBackTo,
  spentWord,
  waitsAtGate,
  type Raise,
  type SpendOf,
} from '../status/status.ts';
import type { Verdict } from '../check/check.ts';
import { messageRefusal, modeWord, retriesSpent, type RetryAsk, type RetryHow } from './retry-ask.ts';
import { carries, heard, pauseAskVoid, retriesDue, retryable } from './retry.ts';
import { remoteRetryRefusal } from '../harness/harness.ts';
import { autoDropped } from '../workflow/index.ts';
import { modeOf } from '../former/former.ts';
import { heldRefusal, prunedRefusal } from '../prune/prune.ts';

/** What `retryRefusal` was asked: its arguments, and the command its refusals name. */
type Asked = {
  steps: readonly Workflow[];
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
};

/**
 * The ask with the step's standing read (`retryable`): the step, its next try, the ask already waiting for it (`pending`), and the ending
 * stopped on the base branch (`stoppedAt`), with the command that lands it again (`again`).
 */
type Judged = Asked &
  ReturnType<typeof retryable> & {
    step: Workflow;
    next: number;
    pending?: RetryAsk;
    stoppedAt?: Workflow;
    again: string;
    floor?: Raise;
  };

/**
 * Why `nemia retry` will not ask for this, in words that say what to do instead — or null, when it may. Pure.
 *
 * Refused: a message that cannot ride on the ask (`messageRefusal`); a step the run does not have; a `--model` a Claude Code step in
 * `auto` would run in `default` on (`autoDropped`, as the load refuses it on the step's own `model:`); a cancelled run, which files
 * nothing, so the ask would never be honoured; an ask for the same try already waiting — one `nemia pause --now` wrote that is void
 * (`pauseAskVoid`) too, said as set aside by the next pass, which alone moves it; a step whose last try is not over, or that let what
 * waits on it run (`retryable`); `--recheck` where no check failed, or on an ending that lands on its check, whose merge the run aborted;
 * and a step the run is about to try again itself, because `retries:` still covers its refusal — that step is not waiting on a person.
 *
 * An ending that stopped on the base branch (`endingStopped`) has two ways on that take the same try of it, so one waiting refuses the
 * other: landing again would act on the work being changed, and a send-back would take back the try a person asked to land again on.
 * A send-back from it goes through the folder's loop, to the looping step it waits on, and a folder with none is told it has no such way.
 * An ending at its gate with nothing of it filed has no try to replace: it is offered its approval, and the send-back of the work it would
 * act on (`sendBackTo`).
 *
 * A send-back is an objection, refused with no words: a try with nothing to change would sign off as it did, and wait there again. At an
 * ending's gate held before it is filed (`waitsAtGate`), the refusal names that gate and the ending's approval, never the step's own,
 * which would be refused itself.
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
 * @param harnessBlocked Whether a task's session is blocked by its harness (`retryable`). Left out, a step whose session is blocked is
 *   running, and refused.
 * @param spendOf What each task's sessions cost (`taskSpend`). Left out, no step is over budget, and `--budget` is refused on every one.
 */
export function retryRefusal(
  steps: readonly Workflow[],
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
): string | null {
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
  };
  const step = askedStep(asked);
  if (typeof step === 'string') return step;
  const c = judged(asked, step);
  return (
    pendingRefusal(c) ??
    (c.modes.length ? undefined : nothingToTry(c)) ??
    modeRefusal(c) ??
    wordlessRefusal(c) ??
    runTriesItself(c) ??
    budgetAskRefusal(c) ??
    null
  );
}

/**
 * The step asked for — or why the ask is refused before its standing is read: words or a budget that cannot ride on it, a step the run
 * does not have, a flag a remote step cannot take, a model an `auto` step would drop, and a run cancelled, pruned or held.
 */
function askedStep(asked: Asked): string | Workflow {
  const { steps, run, name, how, command } = asked;
  const wrong = messageRefusal(how, command) ?? budgetRefusal(how, command);
  if (wrong) return wrong;
  const step = steps.find((s) => s.name === name);
  if (!step || !run.steps[name]) return `${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`;
  const remote =
    (how.model === undefined ? undefined : remoteRetryRefusal(step, 'model', how.model, command)) ??
    (how.budget === undefined ? undefined : remoteRetryRefusal(step, 'budget', how.budget, command));
  if (remote) return remote;
  const dropped = how.model === undefined ? undefined : autoDropped(step.harness, how.model, modeOf(step));
  if (dropped) {
    return (
      `\`--model ${how.model}\`: ${name} ${dropped}. The step's mode is frozen with the run, so ask for a model that keeps \`auto\` — ${command} --model sonnet, or opus, or fable — ` +
      `or, to run it on ${how.model}, start a run of a folder whose step names a mode the model keeps: \`permissionMode: acceptEdits\`, or \`permissionMode: dontAsk\` with \`allowedTools:\` rules.`
    );
  }
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
function judged(asked: Asked, step: Workflow): Judged {
  const { steps, run, name, phaseOf, closeoutOf, askedCloseout, asks, spendOf } = asked;
  const next = tryOf(run, name) + 1;
  const floor = raiseOf(step, run, spendOf);
  const stoppedAt = steps.find((s) => endingStopped(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf));
  const again = stoppedAt ? `nemia retry ${run.id} ${stoppedAt.name}` : '';
  return {
    ...asked,
    ...retryable(step, run, phaseOf, closeoutOf, askedCloseout, steps, asked.harnessBlocked, spendOf, asked.verdictOf),
    step,
    next,
    pending: asks.find((a) => a.step === name && a.try === next),
    stoppedAt,
    again,
    ...(floor ? { floor } : {}),
  };
}

/** How an ending that stopped on the base branch is said: its name, its own status, and that it did not do what it was approved for. */
function stoppedWords(c: Judged, ending: Workflow): string {
  const { steps, run, phaseOf, closeoutOf, askedCloseout, spendOf } = c;

  return `${ending.name} stopped on the base branch (${ownStatus(ending, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)}) without doing what it was approved for`;
}

/** The ask `nemia pause --now` wrote for this try: void, which the next pass sets aside; or still due, tried on the resume. */
function pauseAskRefusal(c: Judged): string | undefined {
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
function pendingRefusal(c: Judged): string | undefined {
  const paused = pauseAskRefusal(c);
  if (paused !== undefined) return paused;
  const { run, name, command, asks, next, pending, sendsBack, back, stoppedAt } = c;
  if (pending && !carries(pending, c.raise, c.floor)) return uncarriedRefusal(c, pending);
  if (pending && !heard(pending, sendsBack)) {
    return `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) with no words, and ${name} ${back ? `sends the work back from ${back.join(', ')}` : gateWords(run, name)}, so no tick honours it: a send-back says what to change. Delete that ask — retry-${name}-${next}, in the run's .asks directory — and ask again: ${command} --message "<objection>".`;
  }
  if (pending) {
    return `try ${next} of ${name} is already asked for (${modeWord(pending)}, at ${pending.at}), and the next tick honours it once. Wait for it: nemia ls ${run.id}.`;
  }
  const landing = back?.map((b) => asks.find((a) => a.step === b && a.try === tryOf(run, b) + 1)).find(Boolean);
  if (landing) {
    return (
      `try ${landing.try} of ${landing.step} is asked for (${modeWord(landing)}, at ${landing.at}): it does the act again on the work as it stands, and a send-back would take that try back. ` +
      `Wait for it: nemia ls ${run.id} — or, if the work is what must change, delete that ask — retry-${landing.step}-${landing.try}, in the run's .asks directory — and send the work back: ${command} --message "<objection>".`
    );
  }
  if (stoppedAt?.name === name) {
    const sending = stoppedAt.after.map((a) => asks.find((x) => x.step === a && x.try === tryOf(run, a) + 1)).find(Boolean);
    if (sending) {
      return `the work is being sent back from ${name} (nemia retry ${run.id} ${sending.step}, at ${sending.at}): ${name} returns to its gate once it settles, and a try of ${name} now would act on work that is being changed. Wait for it: nemia ls ${run.id}.`;
    }
  }
  return undefined;
}

/** An ask already waiting that no tick honours for its budget: one missing past the cap, or one the step cannot take. */
function uncarriedRefusal(c: Judged, pending: RetryAsk): string {
  const { name, command, next, status, raise, floor } = c;
  const asked = `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at})`;
  const again = `Delete that ask — retry-${name}-${next}, in the run's .asks directory — and ask again`;
  if (pending.budget === undefined) {
    return `${asked} without a --budget above ${aboveWord(raise!)}, and ${name} ${raiseWords(status, raise!)}, so no tick honours it. ${again}: ${command} --budget <amount>.`;
  }
  if (!floor) {
    return `${asked} with --budget ${pending.budget}, and ${name} has no \`budget:\`, so there is no cap to raise and no tick honours it. ${again}: ${command}.`;
  }
  return `${asked} with --budget ${pending.budget}, not above ${aboveWord(floor)}, so no tick honours it. ${again}: ${command} --budget <amount>.`;
}

/** Why a step with no way to be tried has none: an ending stopped on the base branch, an ending at its gate, or its status. */
function nothingToTry(c: Judged): string {
  return stoppedEndingRefusal(c) ?? endingGateRefusal(c) ?? statusRefusal(c);
}

/** A step whose work an ending stopped on the base branch acted on: sent back through the folder's loop, or landed again. */
function stoppedEndingRefusal(c: Judged): string | undefined {
  const { steps, run, name, status, stoppedAt, again } = c;
  if (!stoppedAt || !satisfiesAfter(status)) return undefined;
  const through = stoppedAt.after.filter((a) => steps.find((s) => s.name === a)?.loop);
  if (through.length) {
    return (
      `${stoppedWords(c, stoppedAt)}, and the work goes back through the folder's loop, not to ${name}: send it back to ${through.join(' or ')}, which is filed again with your objection and what ${stoppedAt.name} said, and may ask for a round of the work — ` +
      `${through.map((t) => `nemia retry ${run.id} ${t} --message "<objection>"`).join(' or ')}. Or land again, for what was not the work — a dirty checkout, a flaky test: ${again}.`
    );
  }
  return (
    `${stoppedWords(c, stoppedAt)}, and this workflow has no loop before it to send the work back through: a send-back files the looping step an ending waits on, whose \`again: true\` gives the work a round, and ${stoppedAt.after.join(', ') || 'nothing'} ${stoppedAt.after.length > 1 ? 'do' : 'does'} not loop. ` +
    `Land again, for what was not the work — a dirty checkout, a flaky test: ${again}. For work that does not hold on the base branch, call this run off (nemia cancel ${run.id}) and start one for the work on the base branch as it is now (nemia start); a folder that gives its ending a \`loop:\` step to wait on can send work back.`
  );
}

/** An ending at its gate with nothing of it filed: no try to replace, so its approval, or a send-back of the work it would act on. */
function endingGateRefusal(c: Judged): string | undefined {
  const { step, run, name, status } = c;
  if (status !== 'awaiting approval' || run.steps[name].taskId) return undefined;
  const back = sendBackTo(step, run)
    .map((s) => `nemia retry ${run.id} ${s} --message "<objection>"`)
    .join(' or ');
  return (
    `${name} is at its gate, and nothing of it has run: it ends the run in the repository's own checkout, and your approval is what files it, so there is no try of it to replace. ` +
    `Approve it: nemia approve ${run.id} ${name}${back ? ` — or send the work back: ${back}` : ''}.`
  );
}

/** What a step's status says of a try, when it has none: not filed, running, checking, done, or a loop's round to go. */
function statusRefusal(c: Judged): string {
  const { steps, step, run, name, status } = c;
  const why: Partial<Record<StepStatus, string>> = {
    waiting: `${name} has not been filed yet, so there is no try to replace. Wait for it: nemia ls ${run.id}.`,
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

/** `--recheck` where no check failed, or on an ending that lands on its check, whose merge the run aborted. */
function modeRefusal(c: Judged): string | undefined {
  const { step, run, name, how, command, phaseOf, verdictOf, modes, status, blockedByHarness, sendsBack } = c;
  if (modes.includes(how.mode)) return undefined;
  if (landsOnCheck(step, run) && status === 'failed (check)') {
    const why = refusedCheck(run.steps[name]?.check ? phaseOf(run.steps[name].check.taskId) : 'unknown', verdictOf(name))
      ? 'refused it'
      : 'did not finish';
    return `--recheck runs a step's check again on the work as it stands, and ${name}'s check was run on the merge ${name} staged in the repository's checkout, which the run aborted when its check ${why}: there is nothing staged for it to judge. Merge and check again, in a new try of ${name}: ${command}.`;
  }
  const is = blockedByHarness
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

/** A send-back with no words: from an ending stopped on the base branch, from an ending's gate, or from the step's own. */
function wordlessRefusal(c: Judged): string | undefined {
  const { steps, run, name, how, command, phaseOf, closeoutOf, askedCloseout, verdictOf, spendOf, sendsBack, back } = c;
  if (!sendsBack || how.message !== undefined) return undefined;
  const say = `Say what to change: ${command} --message "<objection>"${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
  if (back) {
    const ending = steps.find((s) => s.name === back[0])!;
    return (
      `${name}'s work went on to ${ending.name}, and ${stoppedWords(c, ending)}: a try of ${name} sends the work back from there, and one with no words tells its session nothing to change. ` +
      `${say} — or land again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${run.id} ${ending.name}.`
    );
  }
  const ending = steps.find(
    (s) => s.after.includes(name) && waitsAtGate(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf),
  );
  if (ending) {
    return (
      `${ending.name} is at its gate, not ${name}: ${ending.name} ends the run in the repository's own checkout, nothing of it has run, and the send-back from that gate goes to ${name}, the work it would act on. ` +
      `A try with no words tells its session nothing to change, so it would sign off as it did. ${say} — or approve the ending, which is what files it: nemia approve ${run.id} ${ending.name}.`
    );
  }
  const given = approvalOf(run, name);
  return `${name} ${gateWords(run, name)}: a try of it sends it back from its gate, and one with no words tells its session nothing to change, so it would sign off as it did. ${say} — or ${given ? 'leave it approved, and the next tick files what waits on it' : `approve it: nemia approve ${run.id} ${name}`}.`;
}

/** A `--budget` missing from a try of a step over its budget, or one given that the step cannot take. */
function budgetAskRefusal(c: Judged): string | undefined {
  return raiseMissing(c) ?? budgetMisgiven(c);
}

/** A session of a step over its budget, or ended at it, asked for without a `--budget`: the recheck first, where it is offered. */
function raiseMissing(c: Judged): string | undefined {
  const { name, how, command, modes, status, raise } = c;
  if (raise && how.mode !== 'recheck' && how.budget === undefined) {
    const withTry = `${command} --budget <amount>${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
    if (status === 'failed (check)' && modes.includes('recheck')) {
      return `${name}'s check did not finish, and ${name} ${raiseWords(status, raise)}. Run its check again, which needs no --budget: ${command} --recheck — or raise the cap for a new session, above ${aboveWord(raise)}: ${withTry}.`;
    }
    return `${name} ${raiseWords(status, raise)}, and the run spends nothing more on it until a person raises the cap. Raise it with the try, above ${aboveWord(raise)}: ${withTry}.`;
  }
  return undefined;
}

/**
 * A `--budget` a step cannot take: on a step with no `budget:`, which has no cap to raise; or not above its floor (`raiseOf`) — what its
 * tries have cost, or the cap in force, whichever is more — since a `--budget` only ever raises the cap.
 */
function budgetMisgiven(c: Judged): string | undefined {
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

/** A step the run is about to try again itself: a nudge to sign off, or a try `retries:` still covers. */
function runTriesItself(c: Judged): string | undefined {
  const { steps, step, run, name, phaseOf, closeoutOf, askedCloseout, verdictOf, spendOf, next } = c;
  const itself = retriesDue(steps, run, phaseOf, closeoutOf, askedCloseout, verdictOf, [], () => false, spendOf).find(
    (r) => r.step === name,
  );
  if (itself?.by === 'signoff') {
    const why = lackedOf(run.steps[name]).length
      ? 'its closeout named a file the run does not have'
      : 'its session ended without the closeout it was asked for';
    return `the run nudges ${name} itself: ${why}, and the run continues it once a round, told to sign off, before it waits on you — the next tick files try ${next}. Wait for it: nemia ls ${run.id}.`;
  }
  if (itself) {
    const left = (step.retries ?? 0) - retriesSpent(run.steps[name]);
    return `the run tries ${name} again itself: its check refused, and \`retries: ${step.retries}\` has ${left} left, so the next tick files try ${next}. Wait for it: nemia ls ${run.id}.`;
  }
  return undefined;
}
