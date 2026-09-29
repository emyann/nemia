/**
 * A person's try of a step, from the run's side: what may be asked (`retryable`, `retryRefusal`), the tries due now (`retriesDue`), and
 * what `wf ls` and `wf decide` say of them (`tryNote`, `retryLines`, `answerLines`, `deniedOffer`, `overBudgetLine`). Pure; the ask
 * itself, and the record of a try, are `retry-ask.ts`'s.
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
import type { Closeout } from '../closeout/closeout.ts';
import {
  aboveWord,
  approvalOf,
  budgetOf,
  budgetRefusal,
  capOf,
  endingStopped,
  gateWords,
  hasGate,
  landsOnCheck,
  loopOf,
  loopOver,
  overBudget,
  ownStatus,
  raiseOf,
  raiseWords,
  roundIn,
  roundWord,
  sendBackTo,
  spentWord,
  standing,
  stepSpend,
  waitsAtGate,
  type Raise,
  type SpendOf,
} from '../status/status.ts';
import type { Verdict } from '../check/check.ts';
import {
  messageRefusal,
  modeWord,
  retriesSpent,
  signoffsSpent,
  type Retry,
  type RetryAsk,
  type RetryHow,
  type RetryMode,
} from './retry-ask.ts';
import { isRemoteHarness, remoteRetryRefusal } from '../harness/harness.ts';
import { autoDropped } from '../workflow/index.ts';
import { modeOf } from '../former/former.ts';
import { heldRefusal, prunedRefusal } from '../prune/prune.ts';
import { budgetWord } from '../radius.ts';
import type { Decision } from '../decide/decide.ts';
import { filedDenies, landedWords } from '../ending/ending.ts';
import { allowRuleOf, disallowedBy, type DeniedAt } from '../keys/index.ts';
import { heldLater } from '../round/round.ts';

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
 * the recheck first. A step over budget whose loop's round waits (`held`) has no try: going round is `wf round`'s.
 *
 * And a step whose work the run is parked on at an ending step's gate (`waitsAtGate`), with nothing after it filed: the ending has nothing
 * of its own to object to — it has not run — so a send-back there goes to the work, which is this step (`sendBackTo`).
 *
 * And a gated step that signed off, while nothing after it is filed: `awaiting approval`, or approved and not yet handed on — which a step
 * nothing waits on never is: approved, it has handed on, since there is nothing left to file. A try of it is
 * a send-back from its gate (`sendsBack`) — `nudge` or `fresh`, with what to change, which `retryRefusal` holds it to — and the try after it
 * is on a try its approval does not name, so an approval given before the send-back is spent by it.
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

/** Whether a person's ask carries what a try of its step needs past its budget (`Raise`): a `--budget` above it, on an ask that files a session. */
const carries = (a: Pick<RetryAsk, 'mode' | 'budget'>, raise: Raise | undefined): boolean =>
  !raise || a.mode === 'recheck' || (a.budget !== undefined && a.budget > raise.above);

/**
 * Whether a person's ask says what a send-back from a gate needs (`sendsBack`): words. One with none — written while the step's harness
 * blocked its session, which takes a wordless try, or by hand — tells a session it was sent back and gives it nothing to change, so no tick
 * files it for a step at its gate, as `wf retry` refuses to write one.
 */
export const heard = (a: Pick<RetryAsk, 'message'>, sendsBack: true | undefined): boolean => !sendsBack || a.message !== undefined;

/**
 * The tries due now. Pure, and blind to cancellation on purpose: `assess` answers for a cancelled run, and
 * `advance` looks for a try a pass filed and never wrote down whatever became of the run after.
 *
 * A person's ask for a step's next try, when the step may be tried again that way. For a step whose task has not settled, with
 * `stopFirst`, since its session is still there to stop — `--nudge` or `--fresh`, the ways `wf retry` takes for a session its harness
 * blocked (`retryable`), whether or not the harness still says so. An ask can only be written for such a step while its harness blocks
 * the session, and the session can work again before a tick stops it, told something by a peer with no `wf up` running. Left for its
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
 * An ask names one try, by number, so it is honoured once: an ask for a try the record already holds is
 * spent (`spentAsks`) and files nothing, whichever pass reads it.
 *
 * A step over its budget, or ended at it, is never tried on the run's word — it is not `failed (check)`, so `retries:` files nothing — and a
 * person's ask for a session of it is due only with a `--budget` above what it has spent (`Raise`), which the try carries and the record keeps.
 *
 * A step at its gate, or approved and not handed on (`sendsBack`), is tried only on an ask with words (`heard`): a wordless one, asked while
 * its harness blocked the session that then signed off, would send it back with nothing to change, before anyone read what it handed on.
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
    const ask = asks.find(
      (a) => a.step === step.name && a.try === next && ways.includes(a.mode) && carries(a, raise) && heard(a, sendsBack),
    );
    if (ask) {
      due.push({
        step: step.name,
        try: next,
        mode: ask.mode,
        ...(ask.model ? { model: ask.model } : {}),
        ...(ask.message !== undefined ? { message: ask.message } : {}),
        ...(raise && ask.mode !== 'recheck' ? { budget: ask.budget } : {}),
        by: 'ask',
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
    } else if (status === 'unsigned' && askedCloseout(record.taskId) === 'unsigned' && signoffsSpent(record) < 1) {
      due.push({ step: step.name, try: next, mode: 'nudge', by: 'signoff' });
    }
  }
  return due.filter((r) => !due.some((o) => o.back?.includes(r.step)));
}

/** The ways a person's try of a step whose task has not settled may be asked for: those `retryable` takes for a session its harness blocked. */
const STOPPED_FIRST: readonly RetryMode[] = ['nudge', 'fresh'];

/**
 * Why `wf retry` will not ask for this, in words that say what to do instead — or null, when it may. Pure.
 *
 * Refused: a message that cannot ride on the ask (`messageRefusal`); a step the run does not have; a `--model` a Claude Code step in
 * `auto` would run in `default` on (`autoDropped`, as the load refuses it on the step's own `model:`); a cancelled run, which files
 * nothing, so the ask would never be honoured; an ask for the same try already waiting; a step whose last try is not over, or that let
 * what waits on it run (`retryable`); `--recheck` where no check failed, or on an ending that lands on its check, whose merge the run
 * aborted; and a step the run is about to try again itself, because `retries:` still covers its refusal — that step is not waiting on a
 * person.
 *
 * An ending that stopped on the base branch (`endingStopped`) has two ways on that take the same try of it, so one waiting refuses the
 * other: shipping again would act on the work being changed, and a send-back would take back the try a person asked to ship again on.
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
 * A budget: a `--budget` that is not an amount or rides on `--recheck` (`budgetRefusal`); a session of a step over its budget, or ended at it,
 * asked for without a `--budget` above what it has spent (`Raise`), or with one not above it — by name; `--budget` on any other step, whose
 * cap is not what stops it; and an ask already waiting that no tick will honour, for want of one. A step over its budget whose check did
 * not finish is offered the recheck first, which costs nothing and needs no `--budget`.
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
  const command = `wf retry ${run.id} ${name}`;
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
    return `${run.id} was cancelled at ${run.cancelledAt}, and a cancelled run files nothing, so a retry would never be honoured. Start a new run for the work with wf start.`;
  }
  const pruned = prunedRefusal(run, 'a retry');
  if (pruned) return pruned;
  const holding = heldRefusal(run, 'a retry');
  if (holding) return holding;
  const next = tryOf(run, name) + 1;
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
  const pending = asks.find((a) => a.step === name && a.try === next);
  const stoppedAt = steps.find((s) => endingStopped(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf));
  const again = stoppedAt ? `wf retry ${run.id} ${stoppedAt.name}` : '';
  const stoppedWords = (ending: Workflow): string =>
    `${ending.name} stopped on the base branch (${ownStatus(ending, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)}) without doing what it was approved for`;
  if (pending && !carries(pending, raise)) {
    return `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) without a --budget above ${aboveWord(raise!)}, and ${name} ${raiseWords(status, raise!)}, so no tick honours it. Delete that ask — retry-${name}-${next}, in the run's .asks directory — and ask again: ${command} --budget <amount>.`;
  }
  if (pending && !heard(pending, sendsBack)) {
    return `try ${next} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) with no words, and ${name} ${back ? `sends the work back from ${back.join(', ')}` : gateWords(run, name)}, so no tick honours it: a send-back says what to change. Delete that ask — retry-${name}-${next}, in the run's .asks directory — and ask again: ${command} --message "<objection>".`;
  }
  if (pending) {
    return `try ${next} of ${name} is already asked for (${modeWord(pending)}, at ${pending.at}), and the next tick honours it once. Wait for it: wf ls ${run.id}.`;
  }
  const shipping = back?.map((b) => asks.find((a) => a.step === b && a.try === tryOf(run, b) + 1)).find(Boolean);
  if (shipping) {
    return (
      `try ${shipping.try} of ${shipping.step} is asked for (${modeWord(shipping)}, at ${shipping.at}): it does the act again on the work as it stands, and a send-back would take that try back. ` +
      `Wait for it: wf ls ${run.id} — or, if the work is what must change, delete that ask — retry-${shipping.step}-${shipping.try}, in the run's .asks directory — and send the work back: ${command} --message "<objection>".`
    );
  }
  if (stoppedAt?.name === name) {
    const sending = stoppedAt.after.map((a) => asks.find((x) => x.step === a && x.try === tryOf(run, a) + 1)).find(Boolean);
    if (sending) {
      return `the work is being sent back from ${name} (wf retry ${run.id} ${sending.step}, at ${sending.at}): ${name} returns to its gate once it settles, and a try of ${name} now would act on work that is being changed. Wait for it: wf ls ${run.id}.`;
    }
  }
  if (!modes.length) {
    if (stoppedAt && satisfiesAfter(status)) {
      const through = stoppedAt.after.filter((a) => steps.find((s) => s.name === a)?.loop);
      if (through.length) {
        return (
          `${stoppedWords(stoppedAt)}, and the work goes back through the folder's loop, not to ${name}: send it back to ${through.join(' or ')}, which is filed again with your objection and what ${stoppedAt.name} said, and may ask for a round of the work — ` +
          `${through.map((t) => `wf retry ${run.id} ${t} --message "<objection>"`).join(' or ')}. Or ship again, for what was not the work — a dirty checkout, a flaky test: ${again}.`
        );
      }
      return (
        `${stoppedWords(stoppedAt)}, and this workflow has no loop before it to send the work back through: a send-back files the looping step an ending waits on, whose \`again: true\` gives the work a round, and ${stoppedAt.after.join(', ') || 'nothing'} ${stoppedAt.after.length > 1 ? 'do' : 'does'} not loop. ` +
        `Ship again, for what was not the work — a dirty checkout, a flaky test: ${again}. For work that does not hold on the base branch, call this run off (wf cancel ${run.id}) and start one for the work on the base branch as it is now (wf start); a folder that gives its ending a \`loop:\` step to wait on can send work back.`
      );
    }
    if (status === 'awaiting approval' && !run.steps[name].taskId) {
      const back = sendBackTo(step, run)
        .map((s) => `wf retry ${run.id} ${s} --message "<objection>"`)
        .join(' or ');
      return (
        `${name} is at its gate, and nothing of it has run: it ends the run in the repository's own checkout, and your approval is what files it, so there is no try of it to replace. ` +
        `Approve it: wf approve ${run.id} ${name}${back ? ` — or send the work back: ${back}` : ''}.`
      );
    }
    const why: Partial<Record<StepStatus, string>> = {
      waiting: `${name} has not been filed yet, so there is no try to replace. Wait for it: wf ls ${run.id}.`,
      running: `${name} is still running, so there is nothing to try again until it ends. Wait for it: wf ls ${run.id} (or stop the run: wf cancel ${run.id}).`,
      checking: `${name}'s check is still due or running, so there is no verdict to act on yet. Wait for it: wf ls ${run.id}.`,
      verified: `${name} is verified: its check passed, and there is nothing to try again.`,
      unverified: `${name} signed off done and declares no check: what waits on it has been filed, and there is nothing to try again.`,
      blocked: `${name} signed off blocked and its session has not ended, so a new try would run beside it. Wait for it to settle: wf ls ${run.id}.`,
      exhausted: `${name} asked for another round on the last one \`rounds: ${capOf(step)}\` allows: its work is signed, and what happens next is a person's call, not another try. Go round once more — wf round ${run.id} ${name} — or take the work as it stands, its findings open: wf accept ${run.id} ${name} --message "<why>".`,
      'over budget': `${name} did its work, and its loop asks for a round that would file ${loopOf(steps, name)?.name === name ? 'a step of it' : 'it'} again, past its budget: going round is a person's call, not another try. Raise the cap with the round: wf round ${run.id} ${loopOf(steps, name)?.name ?? name} --budget <amount>.`,
    };
    return why[status] ?? `${name} is ${status}, and there is nothing to try again.`;
  }
  if (!modes.includes(how.mode) && landsOnCheck(step, run) && status === 'failed (check)') {
    const why = refusedCheck(run.steps[name]?.check ? phaseOf(run.steps[name].check.taskId) : 'unknown', verdictOf(name))
      ? 'refused it'
      : 'did not finish';
    return `--recheck runs a step's check again on the work as it stands, and ${name}'s check was run on the merge ${name} staged in the repository's checkout, which the run aborted when its check ${why}: there is nothing staged for it to judge. Merge and check again, in a new try of ${name}: ${command}.`;
  }
  if (!modes.includes(how.mode)) {
    const is = blockedByHarness
      ? 'is running, its session blocked by its harness with nothing signed off'
      : status === 'denied'
        ? 'was denied a call by its harness, and its check was never run'
        : `is ${status}`;
    return `--recheck runs a step's check again, and ${name} ${is}: no check of it failed. ${
      sendsBack
        ? `To send it back from its gate, say what to change: wf retry ${run.id} ${name} --message "<objection>".`
        : `Ask for another session instead: wf retry ${run.id} ${name} (or --fresh).`
    }`;
  }
  if (sendsBack && how.message === undefined) {
    const say = `Say what to change: ${command} --message "<objection>"${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
    if (back) {
      const ending = steps.find((s) => s.name === back[0])!;
      return (
        `${name}'s work went on to ${ending.name}, and ${stoppedWords(ending)}: a try of ${name} sends the work back from there, and one with no words tells its session nothing to change. ` +
        `${say} — or ship again, for what was not the work — a dirty checkout, a flaky test: wf retry ${run.id} ${ending.name}.`
      );
    }
    const ending = steps.find(
      (s) => s.after.includes(name) && waitsAtGate(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf),
    );
    if (ending) {
      return (
        `${ending.name} is at its gate, not ${name}: ${ending.name} ends the run in the repository's own checkout, nothing of it has run, and the send-back from that gate goes to ${name}, the work it would act on. ` +
        `A try with no words tells its session nothing to change, so it would sign off as it did. ${say} — or approve the ending, which is what files it: wf approve ${run.id} ${ending.name}.`
      );
    }
    const given = approvalOf(run, name);
    return `${name} ${gateWords(run, name)}: a try of it sends it back from its gate, and one with no words tells its session nothing to change, so it would sign off as it did. ${say} — or ${given ? 'leave it approved, and the next tick files what waits on it' : `approve it: wf approve ${run.id} ${name}`}.`;
  }
  if (raise && how.mode !== 'recheck' && how.budget === undefined) {
    const withTry = `${command} --budget <amount>${how.mode === 'fresh' ? ` ${modeWord(how)}` : ''}`;
    if (status === 'failed (check)' && modes.includes('recheck')) {
      return `${name}'s check did not finish, and ${name} ${raiseWords(status, raise)}. Run its check again, which needs no --budget: ${command} --recheck — or raise the cap for a new session, above ${aboveWord(raise)}: ${withTry}.`;
    }
    return `${name} ${raiseWords(status, raise)}, and the run spends nothing more on it until a person raises the cap. Raise it with the try, above ${aboveWord(raise)}: ${withTry}.`;
  }
  if (raise && how.budget !== undefined && how.budget <= raise.above) {
    const what =
      raise.above > raise.spent.usd
        ? `the ${budgetWord(raise.cap)} budget ${name}'s session was ended at`
        : `what ${name}'s tries have cost`;
    return `--budget ${how.budget} is not above ${aboveWord(raise)}, ${what}: a try under it would read ${status === 'budget exhausted' ? status : 'over budget'} again as soon as it ended. Give more than ${aboveWord(raise)}: ${command} --budget <amount>.`;
  }
  if (!raise && how.budget !== undefined) {
    const cap = budgetOf(step, run.steps[name]);
    const spent =
      cap === undefined
        ? `, and has no \`budget:\` to raise`
        : `: its tries have cost ${spentWord(stepSpend(run, name, spendOf))} of its ${budgetWord(cap)} budget, which is not what stops it`;
    return `--budget raises the cap of a step over its budget, or ended at it, and ${name} is ${status}${spent}. Try it without --budget: ${command}.`;
  }
  const itself = retriesDue(steps, run, phaseOf, closeoutOf, askedCloseout, verdictOf, [], () => false, spendOf).find(
    (r) => r.step === name,
  );
  if (itself?.by === 'signoff') {
    return `the run nudges ${name} itself: its session ended without the closeout it was asked for, and the run continues it once a round, told to sign off, before it waits on you — the next tick files try ${next}. Wait for it: wf ls ${run.id}.`;
  }
  if (itself) {
    const left = (step.retries ?? 0) - retriesSpent(run.steps[name]);
    return `the run tries ${name} again itself: its check refused, and \`retries: ${step.retries}\` has ${left} left, so the next tick files try ${next}. Wait for it: wf ls ${run.id}.`;
  }
  return null;
}

/**
 * How a step's record reached the try it is on, for `wf ls` and `wf decide`: `try 2, by retries: 2` — and for a step of a loop past its
 * first round, the round, before any try within it: `round 2 of 3`, `round 2 of 3, try 3, by retries: 1`. Empty on a first try.
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
  const how =
    last.then === 'retries'
      ? `by retries: ${step.retries ?? 0}`
      : last.then === 'signoff'
        ? 'nudged to sign off by the run'
        : last.then === 'recheck'
          ? 'rechecked on your word'
          : last.then === 'fresh'
            ? `fresh${last.model ? ` on ${last.model}` : ''}, on your word`
            : last.then === 'back'
              ? 'sent back with the work, on your word'
              : 'nudged on your word';
  return [inRound, `try ${record!.tries!.length + 1}, ${how}`, raised, answered ? 'answered' : ''].filter(Boolean).join(', ');
}

/**
 * What `wf decide` offers for each step a person may try again: the command, and what it does. Pure.
 *
 * A check that did not finish is said so, with `--recheck` first: the run spent no retry on it, and the work
 * may pass as it stands. For anything else, `wf retry` continues the step's session, told what happened.
 *
 * The board reads these lines too: `apps/api` cuts the command out of each (`ONCE_MORE`), and its tests pin the shape
 * `<step>: …:  wf retry <run> <step>  (--fresh…`. The answer to a blocked step is `answerLines`', beside its question.
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
 */
export function retryLines(
  steps: readonly Workflow[],
  run: Run,
  d: Decision,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  spendOf: SpendOf = () => undefined,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): string[] {
  if (d.kind !== 'awaiting' || run.pruned || run.hold) return [];
  const lines: string[] = [];
  for (const step of steps) {
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
    const command = `wf retry ${run.id} ${step.name}`;
    if (back) {
      lines.push(
        `${step.name}: ${back.join(', ')} stopped on the base branch. Send the work back, when it does not hold on the base branch — ${step.name} is filed again with your objection and what ${back.join(', ')} said, may ask for a round, and ${back.join(', ')} waits at its gate for a new approval:  ${command} --message "<objection>"`,
      );
      continue;
    }
    if (!modes.length || sendsBack) continue;
    const shipAgain = endingStopped(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)
      ? ' Ship again, when what stopped it was not the work — a dirty checkout, a flaky test.'
      : '';
    const spent = step.retries ? `; retries: ${step.retries}, ${retriesSpent(run.steps[step.name])} spent` : '';
    const record = run.steps[step.name];
    if (landsOnCheck(step, run) && record?.landed && 'aborted' in record.landed) {
      const budget = raise ? ` --budget <amount>` : '';
      const session = raise
        ? `  (a new session needs --budget above ${aboveWord(raise)}: its tries have cost ${spentWord(raise.spent)} of ${budgetWord(raise.cap)})`
        : '';
      if (d.unfinishedCheck.includes(step.name)) {
        lines.push(
          `${step.name}: its check did not finish, so the run aborted the merge and nothing landed on ${run.branch}. Merge and check again:  ${command}${budget}${session}`,
        );
      } else {
        lines.push(
          `${step.name}: ${status} — ${landedWords(run, record.landed)}.${shipAgain} Continue its session, told what happened:  ${command}${budget}  (--fresh, or --model <m>, for a new session${session})`,
        );
      }
      continue;
    }
    if (d.unfinishedCheck.includes(step.name)) {
      const session = raise
        ? `  (a new session needs --budget above ${aboveWord(raise)}: its tries have cost ${spentWord(raise.spent)} of ${budgetWord(raise.cap)})`
        : '';
      lines.push(
        `${step.name}: its check did not finish, so no retry was spent on it. Run the check again, and nothing else:  ${command} --recheck${session}`,
      );
    } else if (raise) {
      const recheck = modes.includes('recheck') ? '; --recheck runs its check again, and needs no --budget' : '';
      const own = ownStatus(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
      const word = status === 'over budget' ? `over budget (${own === 'failed (check)' ? 'check refused' : own})` : status;
      lines.push(
        `${step.name}: ${word}, ${spentWord(raise.spent)} of ${budgetWord(raise.cap)}.${shipAgain} Raise its cap above ${aboveWord(raise)} and continue its session:  ${command} --budget <amount>  (--fresh, or --model <m>, for a new session${spent}${recheck})`,
      );
    } else if (status === 'denied') {
      lines.push(
        `${step.name}: ${deniedOffer(spendOf(run.steps[step.name].taskId!)?.denied ?? [], { disallowedTools: filedDenies(step, run) }, { cwd: run.steps[step.name].workspace, runId: run.id })}${shipAgain} A new session, told to do without it:  ${command} --fresh  (or continue its session: ${command})`,
      );
    } else if (isRemoteHarness(step.harness)) {
      lines.push(
        `${step.name}: ${status}. Send it again, as a new Task told what happened:  ${command}${spent ? `  (${spent.slice(2)})` : ''}`,
      );
    } else {
      lines.push(
        `${step.name}: ${status}.${shipAgain} Continue its session, told what happened:  ${command}  (--fresh, or --model <m>, for a new session${spent})`,
      );
    }
  }
  return lines;
}

/** The longest one rule `deniedOffer` prints: a rule clipped with `…` is not one a person can copy into `allowedTools:`, so a path goes whole but for a pathological one. */
const RULE_CAP = 240;

/**
 * Why a step that says `denials: fail` waits on you, and the way on that is not a try: the rules the folder's `allowedTools:` needs for a new run
 * (`allowRuleOf`), since this run's is frozen at `wf start` and nothing widens it — `Bash(pytest)` denied is `Bash(pytest:*)`, a file
 * written, by any tool, `Edit(…)`, and a path in the step's own directory written from it (`at`), since the next run's is another. A call
 * the step's own `disallowedTools:` may have denied (`disallowedBy`) is offered no rule: a deny beats every allow, so the rule would allow
 * nothing, and the offer says which of its rules is at work instead. Each rule one line (`oneLine`), since the harness's words are free
 * text; at most `DENIED_SHOWN`, then how many more, as `deniedWords` names the calls themselves. Pure.
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
  return `denied — its harness denied its try ${calls.length === 1 ? 'a call' : 'calls'}, and denials: fail passes none on.${add}${own} This run's allowedTools: is frozen at wf start, so a try of it is denied the same again.`;
}

/** Rules or calls as `deniedOffer` names them: each one line, the first `DENIED_SHOWN`, then how many more. Pure. */
function shownList(words: readonly string[]): string {
  const named = words.slice(0, DENIED_SHOWN).map((word) => oneLine(word, RULE_CAP));
  const more = words.length - named.length;
  return `${named.join(', ')}${more ? ` and ${more} more (wf logs)` : ''}`;
}

/**
 * `wf decide`'s OVER BUDGET line, saying for each step why it is held. A step whose own tries cost its budget or more gives the amounts:
 * `implement ($4.25 of $3)`. A looping step held because its round would file such a step again names that step, as `wf ls` does:
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
 * For each step that signed off blocked and may be tried again, the `wf retry` that answers its `needs`, as `wf decide` prints it under the
 * question. Pure. Not among `retryLines`' offers, whose shape the board reads. None for a blocked step whose session has not settled, which a
 * try would run beside, and none on a run that is not waiting on a person. None on a pruned run (`prunedRefusal`), whose question stays with
 * nothing to answer it, nor on a held one (`heldRefusal`), whose question is asked again once the hold lifts.
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
    if (status === 'blocked' && modes.length) lines[step.name] = `to answer it:  wf retry ${run.id} ${step.name} --message "<answer>"`;
    else if (raise && modes.length && closeoutOf(step.name)?.outcome === 'blocked') {
      lines[step.name] =
        `to answer it, its cap raised above ${aboveWord(raise)}:  wf retry ${run.id} ${step.name} --budget <amount> --message "<answer>"`;
    }
  }
  return lines;
}
