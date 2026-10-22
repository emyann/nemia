/**
 * Where one step of a run stands (`stepStatus`, `ownStatus`), and the facts it reads: a gate's (`hasGate`, `approvalOf`, `atGate`), an
 * ending's (`endsOnBase`, `landsOnCheck`, `resultOnBase`), what a step may spend (`taskSpend`, `overBudget`, `budgetRefusal`), and a
 * loop's (`roundOf`, `loopOf`, `owedFields`). And what a step consumed, in words (`sumUsage`, `readWords`, `usedLines`, `dollars`,
 * `durationWord`): `views.verb.ts` asks the engine (`consumption`). Pure, and read by nearly every other part of the run's judgement;
 * it reads the record alone.
 */
import type { Verdict } from '../check/check.ts';
import { DEFAULT_ROUNDS, LOOP_REPLIES, outputFields, type Workflow } from '../step/step.ts';
import { loopSpan } from '../workflow/index.ts';
import type { TaskClock } from '../timeline/index.ts';
import { declaredOutput, envelopeRefusals, isLoopTarget, type Closeout } from '../closeout/index.ts';
import type { Retry, RetryHow } from '../retry/index.ts';
import {
  lackedOf,
  refusedCheck,
  satisfiesAfter,
  SETTLED,
  TRIED_FROM,
  tryOf,
  type Acceptance,
  type Approval,
  type CloseoutAsked,
  type Run,
  type StepRecord,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { CheckoutHold } from '../cap/cap.ts';

/**
 * Whether a step's closeout waits for a person before anything after it is filed: its own `gate: true`, or a gate the run was started with.
 */
export const hasGate = (step: Pick<Workflow, 'name' | 'gate'>, run: Pick<Run, 'gates'>): boolean =>
  step.gate === true || Boolean(run.gates?.includes(step.name));

/** The steps a run is gated at, in the order they run: those its workflow gates, and those it was started with. Pure. */
export const gatesOf = (steps: readonly Workflow[], run: Pick<Run, 'gates'>): string[] =>
  steps.filter((s) => hasGate(s, run)).map((s) => s.name);

/**
 * The approval of the try a step is on, if a person gave one (`nemia approve`). One for an earlier try was spent by the try after it. Pure.
 */
export const approvalOf = (run: Run, step: string): Approval | undefined =>
  run.approvals?.find((a) => a.step === step && a.try === tryOf(run, step));

/**
 * Whether a step's sessions are filed held open (the runtime's `holdOpen`): a Claude Code job — `claude`, without `background: true`, the
 * one harness the runtime's held task is proven on (agent-runtime's open issue 28). A codex step, a `claude-detached` one and a
 * background session are filed to settle when they sign, and a person's word to them is a try of its own. Never a check.
 */
export const holdsOpenOn = (step: Pick<Workflow, 'harness' | 'background'>): boolean =>
  (step.harness ?? 'claude') === 'claude' && !step.background;

/**
 * The approvals a later try of their step has spent: each names a try the step is past. The tick consumes these, as it does a spent ask.
 * Pure.
 */
export const spentApprovals = (run: Run): Approval[] => (run.approvals ?? []).filter((a) => a.try < tryOf(run, a.step));

/**
 * What a person accepted of a loop on the try its looping step is on (`nemia accept`). One for an earlier try was spent by the try after
 * it. Pure.
 */
export const acceptanceOf = (run: Run, step: string): Acceptance | undefined =>
  run.acceptances?.find((a) => a.step === step && a.try === tryOf(run, step));

/**
 * The acceptances a later try of their looping step has spent: each names a try the step is past. The tick consumes these, as it does a
 * spent ask. Pure.
 */
export const spentAcceptances = (run: Run): Acceptance[] => (run.acceptances ?? []).filter((a) => a.try < tryOf(run, a.step));

/**
 * Whether a looping step's closeout asks for another round of its loop — `again: true` — with nobody having accepted the work as it stands.
 *
 * ONE reader, because `again: true` decides five things that have to agree: whether the step is `exhausted` at its cap (`ownStatus`),
 * whether it has handed on (`roundWanted`, and so `held` and every gate after the loop), whether its own gate holds (`atGate`), and whether
 * the next round is due (`roundsDue`, twice). A person's acceptance turns the word off for all five at once — read it in four places and
 * the fifth files a round nobody asked for, which is the paid round this exists to spare them.
 */
export const askedAgain = (step: Pick<Workflow, 'name' | 'loop'>, run: Run, closeoutOf: (step: string) => Closeout | undefined): boolean =>
  Boolean(step.loop) && closeoutOf(step.name)?.output?.again === true && !acceptanceOf(run, step.name);

/**
 * Where a step that may be sent back stands at its gate, in words: `is awaiting approval`, or
 * `is approved (try 1, at …), and nothing after it is filed yet`.
 */
export const gateWords = (run: Run, step: string): string => {
  const given = approvalOf(run, step);
  return given ? `is approved (try ${given.try}, at ${given.at}), and nothing after it is filed yet` : 'is awaiting approval';
};

/**
 * Whether a step waits at its gate: gated (`hasGate`), signed off on its own work — verified, or unverified with no check — and not
 * approved for the try it is on (`approvalOf`). A looping step that asked for another round (`again: true`) hands nothing on, so no gate
 * holds it: the round is its loop's, and the gate is on what comes after. A later try of an ending approved before it is filed
 * (`approvedFirst`) is that act again, with nothing to hand on, so no gate holds it, though its approval names a try it is past. Pure.
 */
function atGate(step: Workflow, run: Run, own: StepStatus, closeoutOf: (step: string) => Closeout | undefined): boolean {
  if (!satisfiesAfter(own) || !hasGate(step, run)) return false;
  if (approvedFirst(step, run) && run.steps[step.name]?.tries?.length) return false;
  if (askedAgain(step, run, closeoutOf)) return false;
  return !approvalOf(run, step.name);
}

/**
 * Whether a step acts on the base branch itself: it works in the repository's own checkout (`workspace: main`). Pure, and read of the
 * step alone — whoever files it, a person's approval (`approvedFirst`) or the workflow once a step that can send the work back has passed.
 *
 * It is what a run's ending is: the one step of a workflow that works where a person's own work is, on the branch everything lands on
 * (`validateMainWorkspace` refuses a second, and refuses anything waiting on it).
 */
export const endsOnBase = (step: Pick<Workflow, 'workspace'>): boolean => step.workspace === 'main';

/**
 * Whether a step's gate holds it BEFORE it is filed rather than after it signs off: it is gated (`hasGate`) and acts on the base branch
 * (`endsOnBase`). Pure.
 *
 * A gate holds what the approval decides. Where steps follow, that is the handoff, and the step runs first: a person reads what it
 * produced and says whether the work after it may start. An ending step in the repository's checkout produces nothing to read — it acts,
 * on the base branch, where nothing can be taken back — so the approval is of the act, and it is given before the step is filed.
 *
 * An ending with no gate is filed by its workflow instead, once the step before it — one that can send the work back (`loop:`) — passes:
 * `quick`'s land, which its review routes. Nothing of this holds such a step: there is no approval to wait for, and nothing for a person
 * to decide (`toDecide`, `endingSteps`).
 */
export const approvedFirst = (step: Pick<Workflow, 'name' | 'gate' | 'workspace'>, run: Pick<Run, 'gates'>): boolean =>
  endsOnBase(step) && hasGate(step, run);

/**
 * Whether the run waits at that step's gate now, with nothing of the step filed: it is approved first (`approvedFirst`), it has not been
 * filed, nobody has approved the try it would be filed on, and every step it waits on has satisfied it. Pure.
 *
 * Level-triggered like the rest: a step of the work sent back un-holds it on the next pass, and finishing again holds it anew. False on a
 * cancelled run, which files nothing, so that its unfiled steps read as waiting.
 */
export function waitsAtGate(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined,
): boolean {
  if (run.cancelledAt || !approvedFirst(step, run) || run.steps[step.name]?.taskId || approvalOf(run, step.name)) return false;
  return notHandedOn(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).length === 0;
}

/**
 * The steps an ending step waits on that have not handed their work on, in the workflow's order: one that has not satisfied `after`, and
 * a looping step that asked for another round (`roundWanted`), whose work the run will file again. Pure.
 *
 * The round is the case a status alone does not tell: a looping step that says `again: true` below its cap reads `unverified` on its own
 * work, since it signed off — and `assess` only calls it `running` when it sets the round due. An ending read off that word would hold its
 * gate in the very pass that sends the work round again: `nemia ls` would offer the merge while the reviewer was asking for a change, and
 * an approval taken then names a try nothing spends, so the round's work would merge unread. `atGate` keeps the same rule for a gated step
 * of its own loop; this is that rule for the step after one.
 *
 * A predecessor approved first itself is read on its own work (`ownStatus`): `validate` refuses one that anything waits on, and reading
 * it so keeps this from asking itself where it stands.
 */
export function notHandedOn(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined,
): string[] {
  return step.after.filter((name) => {
    const dep = steps.find((s) => s.name === name);
    if (!dep) return true;
    if (dep.loop && roundWanted(dep, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)) return true;
    return !satisfiesAfter(
      approvedFirst(dep, run)
        ? ownStatus(dep, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)
        : standing(dep, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status,
    );
  });
}

/**
 * The ending steps a pass is about to un-hold: those held at their gate, unfiled (`waitsAtGate`), that wait on a step this pass files
 * again — a try due, or a step a round re-files (`roundSpans`). Pure.
 *
 * A person's `nemia retry` of the work is the send-back at an ending's gate, and between the ask and the pass that files it the record
 * alone still reads the work as handed on. Read off the record, such an ending would offer its merge in the very moment somebody objected
 * to the work it would merge; so `assess` and `listing` take these steps as waiting, which is what the next pass will say anyway.
 *
 * Also an ending that stopped on the base branch whose work a try due sends back (`Retry.back`), or a merge of the base due (`Round.back`):
 * the pass that files it moves the ending's try behind (`sentBack`), and it waits for the work again.
 */
export function unheld(steps: readonly Workflow[], run: Run, retry: readonly Retry[], round: readonly Round[]): Set<string> {
  const filing = new Set([...retry.map((r) => r.step), ...roundSpans(steps, round)]);
  const held = steps.filter((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId && s.after.some((a) => filing.has(a)));
  return new Set([...held.map((s) => s.name), ...[...retry, ...round].flatMap((r) => r.back ?? [])]);
}

/**
 * Whether an ending step that acts on the base branch (`endsOnBase`) was filed — on an approval, or by its workflow — and stopped there
 * without doing it: its try settled and it signed off blocked, ended without its closeout, failed — its session or its check — was
 * stopped, or reached its budget. Pure.
 *
 * Such an ending has two ways on. Its own try (`nemia retry <run> <ending>`) does the act again, for what was not the work — a checkout
 * left dirty, a flaky test. And the send-back (`sendsBack` in `retryable`): the work does not hold on the base branch as it is now, so it
 * goes back through the folder's loop, and the ending returns to its gate once that settles (`sentBack`).
 */
export function endingStopped(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
): boolean {
  const taskId = run.steps[step.name]?.taskId;
  if (!endsOnBase(step) || !taskId || !SETTLED.has(phaseOf(taskId))) return false;
  const own = ownStatus(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
  return TRIED_FROM.has(own) || own === 'budget exhausted';
}

/**
 * The record of an ending sent back with its work (`Retry.back`): its try moved behind, `then: 'back'`, and nothing in its place — so it
 * waits for the work, then at its gate for an approval of the try it is now on: the one given for the try that stopped names a try it is
 * past, and is spent (`spentApprovals`). Pure.
 */
export function sentBack(record: StepRecord): StepRecord {
  const { check, tries = [], taskId, handedOff: _, landed: __, filesRead: ___, ...rest } = record;
  return { ...rest, taskId: null, tries: [...tries, { taskId: taskId!, ...(check ? { check } : {}), then: 'back' }] };
}

/**
 * The steps a send-back at a gate goes to: the gated step itself, once it has run — or, at a gate held before its step is filed, the steps
 * it waits on, whose work the objection is about. Pure.
 */
export const sendBackTo = (step: Workflow, run: Run): string[] => (run.steps[step.name]?.taskId ? [step.name] : [...step.after]);

/**
 * Whether an ending's merge is landed by the run on its check: it acts on the base branch (`endsOnBase`) and has a `check:` — which a
 * workflow takes beside `workspace: main` only with `gate: true`, so that a person's approval files it, or with a step before it that can
 * send the work back (`loop:`), so that its pass files it (`validateMainWorkspace`). Pure, and no reading of the gate: what the step is,
 * not who files it.
 *
 * Such a step stages the merge and signs off; the run executes its check on the merged tree, as it executes any step's, and commits the
 * merge onto the base branch on its word, with the message the step signed off, or aborts it (`landingDue`). An ending with no check runs
 * one itself, in its prose, and commits or aborts on what it found.
 *
 * It still takes the run, which it no longer reads, so that every caller reads a step beside the run it belongs to and a gate started with
 * cannot be made to change the answer by leaving it out.
 */
export const landsOnCheck = (step: Pick<Workflow, 'name' | 'gate' | 'workspace' | 'check'>, _run: Pick<Run, 'gates'>): boolean =>
  endsOnBase(step) && step.check !== undefined;

/**
 * Whether the checkout holds this step back on a pass: it works in the repository's own checkout (`workspace: main`), and another run's
 * step is in that one directory (`heldCheckouts`). Pure. Nothing of it is filed while that is so — a first session, or another try.
 */
export const heldByCheckout = (steps: readonly Workflow[], name: string, checkout: CheckoutHold | undefined): boolean =>
  Boolean(checkout) && steps.some((s) => s.name === name && s.workspace === 'main');

/**
 * Where a run's result branch stands against the base branch it was cut from, as git says it on a pass (`branchStandings` in
 * branches.store.ts): `on` it — merged, or with nothing committed past the run's base — `ahead` of it by N commits, `gone`, a branch git
 * no longer has and no recorded tip puts on the base, or `unread`: the place's `standing` was not read for it, and `why` says so.
 */
export type BranchStanding =
  | { branch: string; where: 'on' }
  | { branch: string; where: 'ahead'; commits: number }
  | { branch: string; where: 'gone' }
  | { branch: string; where: 'unread'; why: string };

/**
 * One branch's standing, for a person: `wf/r-1/implement is on main`, `… is ahead of main by 3 commits`, `… is gone: git no longer has it`,
 * `…: where it stands is not read (the place was not heard: …)`. Pure.
 */
export const branchWord = (run: Pick<Run, 'branch'>, s: BranchStanding): string =>
  s.where === 'on'
    ? `${s.branch} is on ${run.branch}`
    : s.where === 'ahead'
      ? `${s.branch} is ahead of ${run.branch} by ${s.commits} commit${s.commits === 1 ? '' : 's'}`
      : s.where === 'gone'
        ? `${s.branch} is gone: git no longer has it`
        : `${s.branch}: where it stands is not read (${s.why})`;

/**
 * Whether git has already taken a run's result: every result branch is on the base branch (`branchStandings`), so an ending step that
 * merges has nothing left to merge — a person merged it by hand, or the work committed nothing past the run's base. Pure.
 *
 * False with no standings read, which is every caller that has not asked git (the board's): there the gate alone speaks. False over a
 * branch whose standing is `unread`: a result not read is never called taken.
 */
export const resultOnBase = (standings: readonly BranchStanding[]): boolean =>
  standings.length > 0 && standings.every((b) => b.where === 'on');

/**
 * Where one step stands — see `StepStatus`. Pure, and the one place the words are decided.
 *
 * **`blocked` first.** A step that signed off `blocked` did not do the work, whatever became of its
 * session — it ended as cleanly as one that finished, which is why the engine cannot tell them apart.
 *
 * **`unsigned` before any check.** A step that was asked for a closeout and gave none has not said it
 * finished, so the run does not say it for it, and does not spend a suite on work nobody signed. The
 * runtime ends a session that goes quiet, or that its harness ends `done`, without it as its harness
 * ended it, and says so — `stated: false` — and settles the task `succeeded`; this layer judges it
 * (`closeoutAsked`) and nudges it once a round (`retriesDue`). A task the runtime ended `failed` with
 * reason `unsigned` is this word too: read as `failed`, the run would be called failed rather than
 * waiting on you, and a nudged try told its session broke rather than that it gave no closeout. Only
 * a `failed` task — one a person stopped is `stopped`. A task that settled `succeeded` with nothing
 * said is `unsigned` too. An unreadable closeout counts as none: the run cannot read that the work is
 * done. A task never asked for a closeout is not held to one.
 *
 * **A declared output is part of the closeout.** A step whose `output:` declares fields and whose
 * closeout lacks one did not say what it was asked to say, and a step that reads it would be handed
 * less than its file promised — so it is `unsigned` too, and nothing that waits on it is filed. Its
 * own file asked, so it is held to that whatever the engine recorded of the filing.
 *
 * **So are the files it names.** A closeout whose `artifacts` names a file the run did not have when the step signed off
 * (`StepRecord.filesRead`, read off the disk once by the tick, `filesDue`) is `unsigned` too, before any check: the step after would be
 * handed a name with no file behind it. Read off the record, never the disk: a file a check or a prune removes later unsigns nothing.
 *
 * **The check's own phase is the verdict.** The detached worker maps the command's exit code to
 * `done` or `failed`; the exit code its attempt recorded is the number shown to a person, and
 * is never what a follower waits on.
 *
 * **`again` is the loop's word, and only a yes or a no is one.** A looping step whose `again` is anything
 * else is `unsigned`. One that says `again: true` on the last round its `rounds:` allows is `exhausted`:
 * done by its check or its word, and final without letting what waits on it run — a person decides. Below
 * the cap it reads as signed, and `assess` files the next round (`roundsDue`). From its second round a
 * loop's target owes `replies` beside what it declares (`owedFields`), which is why `steps` is asked for.
 *
 * **A budget is spent once the engine says so.** A task whose harness ended its last attempt at its cap is `budget exhausted`, whatever
 * else its session left: the runtime reports the cut (`limit: 'budget'`) and judges nothing of it, so this is where it is judged. A step
 * whose ended tries have together cost the cap in force on it or more (`overBudget`), leaving nothing to spend, is `over budget` where
 * another session of it would be the way on (`held`): its try ended without letting what waits on it run — which `retries:` would try
 * again, or a person — or its loop asks for a round that would file it again. A check that did not finish is no such end: its way on is
 * the check again, which costs nothing, so the step reads `failed (check)`, and only a check that refused (`refusedCheck`, off
 * `verdictOf`) holds it. A step that did the work and is not asked for again keeps its word: nothing more is
 * filed for it anyway, and what waits on it runs. Only what the engine measured counts, so a `claude` session still running, whose cost
 * is written as its process exits, counts once it has ended — and a step can overrun by one try.
 *
 * **A gate holds a signed step for a person.** A gated step (`hasGate`) that reads verified or unverified on its own work reads `awaiting
 * approval` until the try it is on is approved (`approvalOf`), whatever its closeout says: it stops what follows as `blocked` does, and
 * only a person moves it — `nemia approve`, or a send-back with `nemia retry --message`. Its check comes first: a gated step still
 * `checking` is checking. A looping step that asked for another round is not held: the gate is on what comes after it, and a round is not
 * that.
 *
 * @param steps The run's steps: what says whether this one is a loop's target, and owes `replies`.
 * @param spendOf What each task's sessions cost (`taskSpend`). Left out, nothing is known spent: no step is over budget, nor ended at one.
 * @param verdictOf What each step's current check exited with (`refusedCheck`): only a check that refused holds a step over its budget.
 *   Left out, no check has refused, so a step whose check did not pass reads `failed (check)`, as `retriesDue` reads it: no try due.
 */
export function stepStatus(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  steps: readonly Workflow[] = [],
  spendOf: SpendOf = () => undefined,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): StepStatus {
  return standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status;
}

/**
 * Where a step stands (`stepStatus`), and where it would stand but for being over its budget or waiting at its gate (`own`): a try's ways
 * are its own status's. `awaiting approval` covers both gates: after a step signs off (`atGate`), and before an ending is filed
 * (`waitsAtGate`).
 */
export function standing(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): { status: StepStatus; own: StepStatus } {
  const own = ownStatus(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
  if (held(step, run, own, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf)) return { own, status: 'over budget' };
  if (atGate(step, run, own, closeoutOf)) return { own, status: 'awaiting approval' };
  if (own === 'waiting' && waitsAtGate(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf))
    return { own, status: 'awaiting approval' };
  return { own, status: own };
}

/**
 * How a step's last try ended, as a try's brief says it (`RetryBriefing.status`): on its own work (`ownStatus`) — and, for a gated step
 * that signed off, `awaiting approval`, since a try of it is a send-back from its gate (`retryable`), approved or not. Pure.
 */
export function triedFrom(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
): StepStatus {
  const own = ownStatus(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
  return satisfiesAfter(own) && hasGate(step, run) ? 'awaiting approval' : own;
}

/**
 * Whether a step reads `over budget`: over it (`overBudget`) with another session of it the way on — a try, from a status a try is taken
 * from (a step signed off blocked, once its session has settled; a check that refused, and not one that did not finish, whose way on is the
 * check again), or a round its loop asks for (`roundWanted`). A looping step that asked for a round is held by any step of its loop over
 * budget, itself included: the round would file each of them again.
 */
function held(
  step: Workflow,
  run: Run,
  own: StepStatus,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined,
): boolean {
  const record = run.steps[step.name];
  const taskId = record?.taskId;
  if (!taskId) return false;
  if (own === 'failed (check)' && !(record.check && refusedCheck(phaseOf(record.check.taskId), verdictOf(step.name)))) return false;
  if (TRIED_FROM.has(own)) return (own !== 'blocked' || SETTLED.has(phaseOf(taskId))) && Boolean(overBudget(step, run, spendOf));
  if (!satisfiesAfter(own)) return false;
  const looping = loopOf(steps, step.name);
  if (!looping || !roundWanted(looping, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)) return false;
  return looping.name === step.name ? loopOver(steps, looping, run, spendOf).length > 0 : Boolean(overBudget(step, run, spendOf));
}

/** Whether a looping step asked for a round its `rounds:` still allows — signed, and `again: true` — which the run files on its word. */
function roundWanted(
  looping: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
): boolean {
  return (
    satisfiesAfter(ownStatus(looping, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)) && askedAgain(looping, run, closeoutOf)
  );
}

/**
 * Where a step stands on its own work, its budget aside: `stepStatus`, but never `over budget` — `budget exhausted` is the harness's end of
 * the session, and its own. What a try's brief says the last try ended as (`retrySection`): being over budget is why nothing was filed, not
 * how the try ended.
 *
 * `budget exhausted` for a task its harness cut off at its cap, settled `failed` or `succeeded`: cut off, not concluded, and no attempt
 * follows (agent-runtime's README). `denied` for a signed step denied a call under `denials: fail`, before its check, which would judge
 * work done without the tool. An ending that lands on its check (`landsOnCheck`) stands where the run's landing of its merge left it
 * (`landingDue`), never on the check alone: `verified` once the run has committed the merge, and `checking` until it has committed or
 * aborted it, so nothing offers a try of it while its merge is staged in the checkout.
 */
export function ownStatus(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
): StepStatus {
  const st = run.steps[step.name];
  if (!st?.taskId) return 'waiting';
  const said = closeoutOf(step.name);
  if (said?.outcome === 'blocked') return 'blocked';

  const phase = phaseOf(st.taskId);
  if ((phase === 'failed' || phase === 'succeeded') && spendOf(st.taskId)?.budgetEnded) return 'budget exhausted';
  const asked = askedCloseout(st.taskId);
  if (phase === 'failed' && !said && asked === 'unsigned') return 'unsigned';
  if (phase === 'failed' || phase === 'stopped') return phase;
  if (phase !== 'succeeded') return 'running';
  if (!said && (asked || step.output)) return 'unsigned';
  if (said && unaccepted(step, run, steps, said)) return 'unsigned';
  if (step.denials === 'fail' && spendOf(st.taskId)?.denied?.length) return 'denied';
  const signed = (s: 'verified' | 'unverified'): StepStatus =>
    askedAgain(step, run, closeoutOf) && roundOf(run, step.name) >= capOf(step) ? 'exhausted' : s;
  if (!step.check) return signed('unverified');

  const check = st.check ? phaseOf(st.check.taskId) : undefined;
  if (landsOnCheck(step, run)) {
    const landed = st.landed;
    if (!landed) return 'checking';
    if ('commit' in landed) return signed('verified');
    return check === 'failed' || check === 'stopped' || check === 'unknown' ? 'failed (check)' : 'failed';
  }
  return check === 'succeeded' ? signed('verified') : check === 'failed' || check === 'stopped' ? 'failed (check)' : 'checking';
}

/**
 * Whether a closeout a step gave is one the run does not accept, which reads `unsigned`: short of a field the step owes (`owedFields`), a
 * looping step's with no yes or no for `again`, one that named a file the run did not have when it signed off, as the tick read it
 * (`lackedOf`), or one whose envelope the run refuses (`envelopeRefusals`: a `needs` on a `done` v1 closeout).
 */
const unaccepted = (step: Workflow, run: Run, steps: readonly Workflow[], said: Closeout): boolean =>
  declaredOutput(step, said, owedFields(step, run, steps)).missing.length > 0 ||
  (Boolean(step.loop) && typeof said.output?.again !== 'boolean') ||
  lackedOf(run.steps[step.name]).length > 0 ||
  envelopeRefusals(said).length > 0;

/**
 * What sessions cost, as the engine measured them: the dollars of the attempts that ended with a cost on them, how many did (`measured`),
 * and how many ended with none (`unmeasured`) — killed before its harness wrote one, or on a model it could not price. An attempt still
 * running is in neither: a `claude --bg` session writes its cost only as its process exits, and a job as it prints its result
 * (agent-runtime's open issue 18).
 */
export type Spend = { usd: number; measured: number; unmeasured: number };

/**
 * What one task's sessions cost (`Spend`), whether its harness ended its last attempt at its budget — the runtime's `limit: 'budget'` — and
 * what its sessions were denied, in the runtime's words (`deniedOf` in views.verb.ts, which `spendReader` fills it from: this file reads no
 * runtime). Not money, and here all the same: every reader of a step's standing is handed a `SpendOf` already, and a reader handed a
 * parameter of its own could leave it out and read no denial. Absent where nobody read them, as `taskSpend` alone leaves it.
 */
export type TaskSpend = Spend & { budgetEnded: boolean; denied?: readonly string[] };

/** What a task's sessions cost, off the engine's view of it (`taskSpend`); undefined for a task nobody read. */
export type SpendOf = (taskId: string) => TaskSpend | undefined;

const NOTHING_SPENT: Spend = { usd: 0, measured: 0, unmeasured: 0 };

/**
 * What one task cost, off the engine's view of it. Pure. An attempt counts once it is over — its end written, or its task settled with it
 * open, as a deadline leaves one — and one that never started (`unstartable`) ran no session. Undefined for no view.
 */
export function taskSpend(view: TaskClock | undefined): TaskSpend | undefined {
  if (!view) return undefined;
  const over = view.state.attempts.filter((a) => a.reason !== 'unstartable' && (a.endedAt != null || view.state.settled != null));
  const costs = over.map((a) => a.usage?.costUsd);
  return {
    usd: costs.reduce<number>((n, c) => n + (c ?? 0), 0),
    measured: costs.filter((c) => c !== undefined).length,
    unmeasured: costs.filter((c) => c === undefined).length,
    budgetEnded: view.state.attempts.at(-1)?.limit === 'budget',
  };
}

/** Several spends as one. */
export const addSpend = (spends: ReadonlyArray<Spend | undefined>): Spend =>
  spends.reduce<Spend>(
    (sum, s) => (s ? { usd: sum.usd + s.usd, measured: sum.measured + s.measured, unmeasured: sum.unmeasured + s.unmeasured } : sum),
    NOTHING_SPENT,
  );

/** The tasks a step's sessions ran as, every try's, each once: the try after a recheck has its session's task again (`EarlierTry`). */
export const sessionTasks = (record: StepRecord | undefined): string[] => [
  ...new Set([...(record?.tries ?? []).map((t) => t.taskId), ...(record?.taskId ? [record.taskId] : [])]),
];

/** What a step's tries have cost together: every try's session, once (`sessionTasks`). Pure. */
export const stepSpend = (run: Run, name: string, spendOf: SpendOf): Spend => addSpend(sessionTasks(run.steps[name]).map(spendOf));

/** What a run has cost: every step's tries. Its checks run on the run's own shell harness, which prices nothing. Pure. */
export const runSpend = (run: Run, spendOf: SpendOf): Spend =>
  addSpend(Object.keys(run.steps).map((name) => stepSpend(run, name, spendOf)));

/**
 * The cap in force on a step: the last a person raised it to (`EarlierTry.budget`: `nemia retry --budget`, `nemia round --budget`), else
 * its `budget:`.
 */
export const budgetOf = (step: Workflow, record: StepRecord | undefined): number | undefined =>
  [...(record?.tries ?? [])].reverse().find((t) => t.budget !== undefined)?.budget ?? step.budget;

/**
 * A step whose tries have together cost the cap in force on it or more — nothing left to spend, since any session spends something: what
 * they cost, and the cap. Undefined for any other. Pure. At the cap and not only past it, so a session filed for a step not held always has
 * something left, which `budgetUsdFor` hands a harness that keeps a cap.
 */
export function overBudget(step: Workflow, run: Run, spendOf: SpendOf): { spent: Spend; cap: number } | undefined {
  const cap = budgetOf(step, run.steps[step.name]);
  if (cap === undefined) return undefined;
  const spent = stepSpend(run, step.name, spendOf);
  return spent.usd >= cap ? { spent, cap } : undefined;
}

/** The steps of a looping step's loop (`loopSpan`) that are over budget, in its order: what holds its next round. */
export const loopOver = (
  steps: readonly Workflow[],
  looping: Workflow,
  run: Run,
  spendOf: SpendOf,
): Array<{ name: string; spent: Spend; cap: number }> =>
  loopSpan(steps, looping).flatMap((name) => {
    const step = steps.find((s) => s.name === name);
    const over = step && overBudget(step, run, spendOf);
    return over ? [{ name, ...over }] : [];
  });

/**
 * What sessions cost, for a person: `$4.20` — and `≥$4.20` when a session that ended has no cost on it, so a part never reads as the whole.
 */
export const spentWord = (s: Spend): string => `${s.unmeasured ? '≥' : ''}${dollars(s.usd)}`;

/**
 * The `budgetUsd` a step is filed with: what is left of the cap in force once its tries' cost is taken off, so the harness holds the tries
 * together to the cap, and not each session to a whole cap of its own. A resume is charged its own spend (agent-runtime's open issue 28,
 * M2), and a cap caps a resume's own spend (M5), so the remainder is what the next try may spend. Which harness keeps a cap is the
 * runtime's to judge: it refuses one on codex and on a background session, at `nemia start` and `nemia retry` (`configRefusal`).
 *
 * To the millionth of a dollar, rounded up, so the harness is handed digits and never `0`, which the engine refuses: a step with nothing
 * left is `over budget`, and filed nothing (`overBudget`). The engine starts no attempt again on its own, so each try is handed what is
 * left anew.
 */
export function budgetUsdFor(cap: number | undefined, spent: Spend = NOTHING_SPENT): number | undefined {
  if (cap === undefined) return undefined;
  return Math.max(Math.ceil((cap - spent.usd) * 1e6 - 1e-6) / 1e6, 1e-6);
}

/**
 * The momentum of every filing of a run after its first steps — a step after another, a try, a round, a check: the `priority` it is filed
 * with, which the runtime's admission reads to choose the waiting task a free slot goes to when a pool is at its ceiling, higher first and
 * filing order within. A run's next step is filed a check and a pass after its last ended, and in filing order alone any run's first step
 * filed in that gap would take the slot; above them, a run in flight keeps its momentum. Nothing running is stopped for it, and it is read
 * at admission and nowhere else: the cap on runs in flight and the queue are the tick's.
 */
export const MOMENTUM = 1;

/**
 * The momentum a step's own filing has, filed as its `priority` (`MOMENTUM`): none — 0 — for a run's first steps, which wait on nothing and
 * are filed as the run starts, so a newer run never goes before one in flight; `MOMENTUM` for a step after another. A try, a round and a
 * check are never a run's first filing, and carry `MOMENTUM` whatever step they are of.
 */
export const stepMomentum = (step: Pick<Workflow, 'after'>): number => (step.after.length ? MOMENTUM : 0);

/**
 * The floor of a `--budget` on a step with a cap, and what a person's try of a step over its budget, or ended at it, has to carry: a
 * `--budget` above `above` — what its tries have cost, or the cap in force, whichever is more — beside what they cost and the cap.
 */
export type Raise = { above: number; spent: Spend; cap: number };

export function raiseOf(step: Workflow, run: Run, spendOf: SpendOf): Raise | undefined {
  const cap = budgetOf(step, run.steps[step.name]);
  if (cap === undefined) return undefined;
  const spent = stepSpend(run, step.name, spendOf);
  return { above: Math.max(spent.usd, cap), spent, cap };
}

/**
 * What a raise has to pass, for a person: what the step's tries cost, `$4.20`, or the cap its session was ended at, as its author wrote it,
 * `$3`.
 */
export const aboveWord = (r: Raise): string => (r.above > r.spent.usd ? budgetWord(r.above) : dollars(r.above));

/** A step over its budget, or ended at it, in words: `is over budget: its tries have cost $4.20 of its $3 budget`. */
export const raiseWords = (status: StepStatus, r: Raise): string =>
  status === 'budget exhausted'
    ? `ended at its budget: its harness stopped its session at ${budgetWord(r.cap)}, and its tries have cost ${spentWord(r.spent)}`
    : `is over budget: its tries have cost ${spentWord(r.spent)} of its ${budgetWord(r.cap)} budget`;

/**
 * Why a `--budget` cannot ride on this ask, in words that say what to do instead — or null. Pure, and asked before anything about the run,
 * as `messageRefusal` is: an amount that is not dollars above zero, and `--budget` on `--recheck`, which files no session to spend it.
 */
export function budgetRefusal(how: RetryHow, command = 'nemia retry <runId> <step>'): string | null {
  if (how.budget === undefined) return null;
  if (!(typeof how.budget === 'number' && Number.isFinite(how.budget) && how.budget > 0)) {
    return `--budget ${String(how.budget)} is not an amount. It is the most the step's tries may cost together, in dollars, above what they have cost: ${command} --budget <amount>, like 5 or 2.50.`;
  }
  if (how.mode === 'recheck') {
    return `--budget raises a step's cap for the session a try files, and --recheck files none — it runs the check again, which costs nothing. Recheck without it (${command} --recheck), or give the cap to a session: ${command} --budget <amount>.`;
  }
  return null;
}

/**
 * A loop going round again: the looping step, the step its `loop:` runs again, the round to file, and on whose word — the looping step's
 * `again: true` with rounds left, a person's `nemia round` once they are spent, or a person's `nemia merge`, which files the loop again on
 * the round it is on (`mergeDue`).
 */
export type Round = {
  step: string;
  target: string;
  round: number;
  by: 'again' | 'ask' | 'merge';
  /**
   * On a person's round past a step of the loop's budget (`nemia round --budget`): the cap, and the steps of the loop it is raised for —
   * those over it.
   */
  budget?: number;
  raise?: string[];
  /** On a merge (`by: 'merge'`): the base branch, and the commit of it the target merges, which the run's base moves to. */
  merge?: MergeOf;
  /** On a merge: the endings that stopped on the base branch it sends the work back from, each moved behind (`sentBack`). */
  back?: string[];
};

/**
 * What a person's `nemia merge` asks: the step that merges (the loop's target), its try that does, the base branch, and its commit; and,
 * where the work merges cleanly onto that commit and the ending's check refused the merged tree there, that landing (`landing`): the
 * ending and its check's task, whose failing tests the target is told.
 */
export type MergeOf = { target: string; try: number; onto: string; sha: string; landing?: MergeLanding };

/** A landing refused on the commit a merge takes in: the ending step, and the task of its check that refused the merged tree. */
export type MergeLanding = { step: string; check: string };

/**
 * A person's `nemia round`, as its ask file says it: the looping step, the round it asks for, the cap `--budget` raises, and when. A
 * person's `nemia merge` is one too, with `merge`: the looping step, the round it is on, which the merge leaves as it is (`mergeAskIn`).
 */
export type RoundAsk = { step: string; round: number; budget?: number; at: string; merge?: MergeOf };

/** The rounds a looping step's loop runs on its own word: its `rounds:`, which the parser always sets. */
export const capOf = (looping: Workflow): number => looping.rounds ?? DEFAULT_ROUNDS;

/**
 * The round a step's record is on: the first, and one more for each round that moved a try behind it. A merge (`then: 'merge'`) is not one.
 */
export const roundIn = (record: StepRecord | undefined): number => 1 + (record?.tries?.filter((t) => t.then === 'round').length ?? 0);

/** The round a step of a run is on (`roundIn`). Every step of a loop moves on together, so the looping step's is the loop's. */
export const roundOf = (run: Run, step: string): number => roundIn(run.steps[step]);

/** The looping step whose loop `name` is in — as its target, a step between, or itself — if any. */
export const loopOf = (steps: readonly Workflow[], name: string): Workflow | undefined =>
  steps.find((s) => s.loop && loopSpan(steps, s).includes(name));

/** A round, as `nemia ls` says it: `round 2 of 3`, or past the cap, where only a person's word takes a loop. */
export const roundWord = (round: number, cap: number): string =>
  round <= cap ? `round ${round} of ${cap}` : `round ${round}, past rounds: ${cap}, on your word`;

/**
 * Whether a loop's target owes `replies` on the try it is on: every try from its second round, since it was handed findings to answer —
 * but a try after a merge (`merged`), which was handed a base to merge and no findings. Round 1's are asked for all the same
 * (`closeoutSchemaOf`), and owed nothing: an empty list, read by nobody.
 */
export const owesReplies = (steps: readonly Workflow[], run: Run, name: string): boolean =>
  isLoopTarget(steps, name) && roundOf(run, name) > 1 && !merged(run.steps[name]);

/**
 * Whether a step of a loop is on the tries a merge filed (`nemia merge`): the last try a round or a merge moved behind it was a merge's,
 * whatever tries came after it within the round.
 */
export const merged = (record: StepRecord | undefined): boolean =>
  [...(record?.tries ?? [])].reverse().find((t) => t.then === 'round' || t.then === 'merge')?.then === 'merge';

/**
 * The looping step, and its try that asked for the round a loop's target is on — or undefined when the target owes no `replies`.
 *
 * The looping step's own place is unfiled until the target is verified, so the closeout whose findings the target owes answers to is
 * behind it, on this try. `advance` reads it from there for a new session of the target within the round — a fresh try, or a nudge with
 * no session left to continue — which would otherwise be asked for replies to findings nobody handed it.
 */
export function askingTry(steps: readonly Workflow[], run: Run, name: string): { looping: Workflow; taskId: string } | undefined {
  const looping = steps.find((s) => s.loop === name);
  if (!looping || !owesReplies(steps, run, name)) return undefined;
  const taskId = [...(run.steps[looping.name]?.tries ?? [])].reverse().find((t) => t.then === 'round')?.taskId;
  return taskId ? { looping, taskId } : undefined;
}

/**
 * The fields a step's closeout must give on the try it is on: what its `output:` declares, and `replies` on a loop's target past round 1 —
 * where an empty list is no answer (`declaredOutput`).
 */
export const owedFields = (step: Workflow, run: Run, steps: readonly Workflow[]): string[] => [
  ...outputFields(step),
  ...(owesReplies(steps, run, step.name) ? [LOOP_REPLIES] : []),
];

/**
 * The steps the rounds due now file again: each looping step's loop (`loopSpan`), the looping step included. Pure. None of them reads `over
 * budget` on the pass before its round is filed — in `assess`, `nemia ls` or `nemia decide` — since a round held on a budget is due only
 * once a person raised the cap above what was spent (`nemia round --budget`), and held, the run read as waiting on that person for a tick
 * after they had answered.
 */
export const roundSpans = (steps: readonly Workflow[], rounds: readonly Round[]): Set<string> =>
  new Set(
    rounds.flatMap((r) => {
      const looping = steps.find((s) => s.name === r.step);
      return looping ? loopSpan(steps, looping) : [];
    }),
  );

/**
 * What a session consumed, as the engine's `Usage` carries it: a count nobody measured is absent, never 0. `costUsd` is the harness's own
 * figure, and `apiMs` and `toolMs` the time it counted waiting on the model and running tools — each read once a session has ended.
 */
export type Consumed = {
  turns?: number;
  toolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  apiMs?: number;
  toolMs?: number;
  /** The input in its three classes, which sum to `inputTokens` where the runner saw them: read from the cache, written to it, neither. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  uncachedTokens?: number;
  /** The largest context one response read. Of several attempts, the largest of theirs: a peak does not add up. */
  peakContextTokens?: number;
  /**
   * One attempt's first response: the context it read and what of it was written to the cache (`rebuiltCache`). Not summed: several
   * attempts have no one first response.
   */
  firstContextTokens?: number;
  firstCacheWriteTokens?: number;
  /** How many times its sessions compacted their conversation, which a session does short of its window. Absent where none was seen. */
  compactions?: number;
  /**
   * How many of its attempts were resumed and wrote their parent's conversation to the cache again (`rebuiltCache`) — a reading of the
   * counts above, not a count the engine made. Absent where none did.
   */
  rebuiltCaches?: number;
};

const FIELDS = [
  'turns',
  'toolCalls',
  'inputTokens',
  'outputTokens',
  'costUsd',
  'apiMs',
  'toolMs',
  'cacheReadTokens',
  'cacheWriteTokens',
  'uncachedTokens',
] as const;

/**
 * Several attempts' usage as one. A count is the sum only when every attempt measured it: a sum over
 * the attempts that happened to be counted would under-report, and read as the whole. The peak is the
 * largest, by the same rule: an attempt that measured none may have been the largest.
 */
export function sumUsage(usages: ReadonlyArray<Consumed | null | undefined>): Consumed | undefined {
  if (!usages.length) return undefined;
  const sum: Consumed = {};
  for (const field of FIELDS) {
    if (usages.every((u) => u?.[field] !== undefined)) sum[field] = usages.reduce((n, u) => n + u![field]!, 0);
  }
  if (usages.every((u) => u?.peakContextTokens !== undefined))
    sum.peakContextTokens = Math.max(...usages.map((u) => u!.peakContextTokens!));
  const rebuilt = usages.reduce((n, u) => n + (u?.rebuiltCaches ?? 0), 0);
  if (rebuilt) sum.rebuiltCaches = rebuilt;
  const compactions = usages.reduce((n, u) => n + (u?.compactions ?? 0), 0);
  if (compactions) sum.compactions = compactions;
  return Object.keys(sum).length ? sum : undefined;
}

/**
 * Whether a resumed attempt rebuilt its cache rather than read it: its first response wrote more than half the context it read to the
 * cache. A continuation's first response reads its parent's whole conversation, which a warm cache serves as reads; written again, it is
 * the same tokens at twenty times a read's price, and the one input count hides it. Judged on the first response alone, since the
 * attempt's writes in all grow with its work, warm or not. Never for an attempt that started cold, whose first writes are its cache, nor
 * one whose runner did not see its first response.
 */
export const rebuiltCache = (u: Consumed | null | undefined, resumed: boolean): boolean =>
  resumed &&
  u?.firstCacheWriteTokens !== undefined &&
  u.firstContextTokens !== undefined &&
  u.firstCacheWriteTokens > u.firstContextTokens / 2;

/** The peak context, in tokens, past which a step with no `context:` cap is marked `large` (`peakMark`). */
export const LARGE_CONTEXT = 200_000;

/**
 * Where a peak stands against a step's `context:` cap: `cap` once the session reached it — it compacted, which Claude Code does well short
 * of its window, or its peak got there — and `large` past `LARGE_CONTEXT` on a step with none. Null otherwise, and where nobody measured
 * either.
 */
export function peakMark(u: Consumed | null | undefined, cap: number | undefined): 'cap' | 'large' | null {
  const peak = u?.peakContextTokens;
  if (cap !== undefined) return u?.compactions || (peak !== undefined && peak >= cap) ? 'cap' : null;
  return peak !== undefined && peak > LARGE_CONTEXT ? 'large' : null;
}

/** How often a session compacted, in words: `compacted`, `compacted twice`, `compacted 3 times`. */
const compactedWords = (n: number): string => `compacted${n === 1 ? '' : n === 2 ? ' twice' : ` ${n} times`}`;

/**
 * What a session read, by price, for a person at a glance: `read 21.4M · wrote 412k · peak 167k` — the cache's reads and writes, which
 * are nearly all of an attempt's input and priced twenty-fold apart, and the largest context it carried. The peak says where it reached
 * a step's `context:` cap — compacting says it did — or passed 200k with none, and a resumed attempt that rebuilt its cache says so. Empty
 * where nothing measured any of it: a runner that counted none says nothing, rather than 0.
 */
export function readWords(u: Consumed | null | undefined, cap?: number): string {
  if (!u) return '';
  const mark = peakMark(u, cap);
  const where = [
    ...(u.compactions ? [compactedWords(u.compactions)] : []),
    ...(mark === 'large' ? [`past ${count(LARGE_CONTEXT)} with no cap`] : []),
  ].join(', ');
  const reached = mark === 'cap' ? `${u.compactions ? `${where} ` : ''}at its ${count(cap!)} cap` : where;
  const peak =
    u.peakContextTokens !== undefined ? `peak ${count(u.peakContextTokens)}${reached ? `, ${reached}` : ''}` : reached || undefined;
  const rebuilt = u.rebuiltCaches
    ? u.rebuiltCaches > 1
      ? `${u.rebuiltCaches} resumed sessions wrote their context to the cache again instead of reading it`
      : 'a resumed session wrote its context to the cache again instead of reading it'
    : undefined;
  return [
    ...(u.cacheReadTokens !== undefined ? [`read ${count(u.cacheReadTokens)}`] : []),
    ...(u.cacheWriteTokens !== undefined ? [`wrote ${count(u.cacheWriteTokens)}`] : []),
    ...(peak ? [peak] : []),
    ...(rebuilt ? [rebuilt] : []),
  ].join(' · ');
}

/**
 * Dollars for a person: to the cent, and to three figures under one — a session's $0.004 rounded to "$0.00" is the zero these lines
 * refuse.
 */
export const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A budget as its author writes one: `$3`, `$2.50`. */
export const budgetWord = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

/** A count for a person, to three figures: 112000 → 112k, 6350000 → 6.35M. */
export function count(n: number): string {
  for (const [of, unit] of [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ] as const) {
    if (n >= of * 0.9995) return `${Number((n / of).toPrecision(3))}${unit}`;
  }
  return String(n);
}

/** A duration for a person, as the operator measures one: `58s`, `19m42s`, `1h05m`, `2d03h`. */
export function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

/**
 * What a step consumed, beside its check: `used` and `cost`. Unmeasured says so, never `0` — a zero
 * that means "nobody counted" reads as "cost nothing". Cost prints a number only where the engine measured
 * one: the harness's own figure, read once a session has ended (agent-runtime's README, *What an attempt consumed*).
 * The api and tool time go beside the counts once either was measured, and each says not measured where the
 * other was — `claude-detached` counts api time and no tool time — and neither is said where nothing timed it. A measured time under a
 * second reads `<1s`, never `0s`.
 */
export function usedLines(u: Consumed | undefined): string[] {
  const read = readWords(u);
  const cost = `cost  ${u?.costUsd !== undefined ? dollars(u.costUsd) : 'not measured'}${read ? ` · ${read}` : ''}`;
  if (!u) return ['used  not measured', cost];
  const said = (n: number | undefined, what: string, unmeasured: string) =>
    n === undefined ? `${unmeasured} not measured` : `${count(n)} ${what}`;
  const took = (ms: number | undefined, what: string) =>
    ms === undefined ? `${what} not measured` : `${what} ${ms > 0 && ms < 1000 ? '<1s' : durationWord(ms)}`;
  const timed = u.apiMs !== undefined || u.toolMs !== undefined ? [took(u.apiMs, 'api'), took(u.toolMs, 'tools')] : [];
  return [
    `used  ${[
      said(u.turns, 'turns', 'turns'),
      said(u.toolCalls, 'tool calls', 'tool calls'),
      said(u.inputTokens, 'in', 'tokens in'),
      said(u.outputTokens, 'out', 'tokens out'),
      ...timed,
    ].join(' · ')}`,
    cost,
  ];
}
