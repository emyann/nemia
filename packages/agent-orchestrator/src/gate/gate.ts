/**
 * A gate, from a person's side: the words refused with an approval (`approvalWordsRefusal`), why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word on this pass (`holdsOpen`). Pure.
 */
import type { StepSpec } from '../step/step.ts';
import { andList, tryOf, type Approval, type Run, type StepStatus } from '../record/record.ts';
import { heard, modeWord, retryable } from '../retry/index.ts';
import {
  approvalOf,
  approvedFirst,
  takeBackOf,
  branchWord,
  gatesOf,
  hasGate,
  notHandedOn,
  resultOnBase,
  standing,
  sendBackTo,
} from '../status/status.ts';
import { heldRefusal, prunedRefusal } from '../forget/prune/prune.ts';
import { routeLine, runWords } from '../route/routed/index.ts';
import { firstPiece } from '../piece/piece.ts';
import type { ApprovalRefusal } from '../../contracts/gate.contract.ts';
import type { TakeBackStopOf } from '../../contracts/take-back.contract.ts';

export { holdsOpen } from './holds-open/holds-open.ts';

/**
 * Why the words given with an approval cannot ride on it — or null. Pure, and asked before anything about the run: words that are empty.
 */
export const approvalWordsRefusal = (message: string | undefined, command = 'nemia approve <runId> <step>'): string | null =>
  message !== undefined && !message.trim()
    ? `--message is empty, and an approval's words are handed to every step after the gate: empty, they tell them nothing. Say what you approve, or on what terms — ${command} --message "<words>" — or leave --message out.`
    : null;

/**
 * A second approval of the try a step is on: while it may still be sent back, the send-back (`sendsBack`, or `unfiledRefusal` for an
 * ending approved and not filed); else that it has handed on.
 */
function approvedRefusal(steps: readonly StepSpec[], step: StepSpec, run: Run, given: Approval, sendsBack: true | undefined): string {
  const { name } = step;
  const approved = `try ${tryOf(run, name)} of ${name} is already approved, at ${given.at}${given.message !== undefined ? ', with words' : ''}`;
  if (sendsBack)
    return `${approved}: what waits on it is filed on the next tick, once. To send it back instead, before that tick: nemia retry ${run.id} ${name} --message "<objection>".`;
  if (approvedFirst(step, run) && !run.steps[name]?.taskId) return unfiledRefusal(step, run, approved, given);
  return handedOnWords(steps, name, run, approved, 'so there is nothing to approve, nor to send back');
}

/**
 * The words of an approved step that has handed on: `approved`, what it said of the approval, then what waits on it — filed, or nothing
 * — then `so`, what that leaves a person, and where the run stands. Pure.
 */
function handedOnWords(steps: readonly StepSpec[], name: string, run: Run, approved: string, so: string): string {
  const after = steps.some((s) => s.after.includes(name));
  return `${approved}, and it has handed on: ${after ? 'what waits on it has been filed' : 'nothing waits on it, and its run goes on without it'}, ${so}. See where the run stands: nemia ls ${run.id}.`;
}

/**
 * A second approval of an ending approved and not filed: it waits for the checkout, or the pass that files it, and its work may still
 * be sent back, which spends the approval (`approvedUnfiled`) — the run is neither held nor pruned here, which `approvalRefusal` refused
 * first. An approval an older nemia wrote names no work, and no send-back spends it: taken back first (`takeBackOf`), the work may be
 * sent back.
 */
function unfiledRefusal(step: StepSpec, run: Run, approved: string, given: Approval): string {
  const back = sendBackTo(step, run).map((s) => `nemia retry ${run.id} ${s} --message "<objection>"`);
  const after =
    given.work === undefined
      ? ` ${takeBackOf(step, run, given)}`
      : back.length
        ? ` To send the work back instead, before it is filed: ${back.join(' or ')}.`
        : '';
  return `${approved}, and nothing of it has run: the run files it once it may — nemia ls ${run.id} says what it waits for.${after}`;
}

/**
 * Why `nemia approve` will not approve this step, in words that name the fix — or null, when it may: the step waits at its gate. Pure.
 *
 * Where it stands is the word the run's status reads (`runWords`): its standing with the routing laid over it, so a node the run says
 * waits at its gate is never refused as not filed — a gated table condition, never filed, whose table answered, is approved as a gated
 * step is, and the next tick files the node its route names. A filed step's gate is its session's: it waits where it stands there. A
 * table condition never filed is refused in a condition's words: while its producer has not signed off, when its table answers no route
 * (naming `nemia route`), and off the route taken.
 *
 * Refused: words that are empty (`approvalWordsRefusal`); a step the run does not have; a cancelled run, which files nothing; a step that
 * is not gated, naming the steps that are; the try it is on already approved — while it may still be sent back, or once it has handed on,
 * each said so; a send-back already asked for — the try after this one, which would spend an approval of this one at once — or one asked
 * with no words, which no tick files (`heard`), named with how to take it back; and a step that has not signed off, each status with why
 * and what to do instead.
 *
 * An ending approved before it is filed (`approvedFirst`) is judged on the work it would act on, not on its own closeout: refused while a
 * send-back of that work is asked for, which would change what is approved; while a step its gate waits on has not handed on
 * (`notHandedOn`, so the refusal and the gate agree, a looping step that asked for another round among them); and at its gate with its
 * result already on the base branch (`resultOnBase`), where nothing is left to merge.
 *
 * @param asks What people asked for with `nemia retry`, and the run has not consumed yet: a send-back already asked for.
 * @param standings Where each result branch stands against the base branch now (`branchStandings` in branches.store.ts). Left out, git is
 *   not asked, and the gate alone speaks.
 */
export const approvalRefusal: ApprovalRefusal = (
  steps,
  run,
  name,
  message,
  phaseOf,
  closeoutOf = () => undefined,
  askedCloseout = () => false,
  verdictOf = () => undefined,
  asks = [],
  spendOf = () => undefined,
  standings = [],
) => {
  const command = `nemia approve ${run.id} ${name}`;
  const words = approvalWordsRefusal(message, command);
  if (words) return words;
  const step = steps.find((s) => s.name === name);
  if (!step || !run.steps[name]) return `${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`;
  if (run.cancelledAt) {
    return `${run.id} was cancelled at ${run.cancelledAt}, and a cancelled run files nothing, so an approval would never be honoured. Start a new run for the work with nemia start.`;
  }
  const pruned = prunedRefusal(run, 'an approval');
  if (pruned) return pruned;
  const holding = heldRefusal(run, 'an approval');
  if (holding) return holding;
  if (!hasGate(step, run)) {
    const gates = gatesOf(steps, run);
    return (
      `${name} has no gate: what waits on it is filed once it has ${step.check ? 'passed its check' : 'signed off'}, with nobody's approval, so there is nothing to approve. ` +
      `${gates.length ? `${run.id} is gated at ${gates.join(', ')}.` : `${run.id} is gated at no step.`} A gate is set on a step, \`gate: true\`, or at start: nemia start --gate <step>.`
    );
  }
  const n = tryOf(run, name);
  const given = approvalOf(run, name);
  const { sendsBack } = retryable(step, run, phaseOf, closeoutOf, askedCloseout, steps, () => false, spendOf, verdictOf, undefined);
  if (given) return approvedRefusal(steps, step, run, given, sendsBack);
  const pending = asks.find((a) => a.step === name && a.try === n + 1);
  if (pending && !heard(pending, sendsBack)) {
    return `try ${n + 1} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) with no words, and ${name} is at its gate, so no tick honours it: a send-back says what to change. Delete that ask — retry-${name}-${n + 1}, in the run's .asks directory — then approve it, or send it back with words: nemia retry ${run.id} ${name} --message "<objection>".`;
  }
  if (pending) {
    return `try ${n + 1} of ${name} is already asked for (${modeWord(pending)}, at ${pending.at}): the next tick sends it back, and an approval of try ${n} would be spent by it at once. Approve try ${n + 1} once it has signed off — or, to approve this one, take that ask back first: retry-${name}-${n + 1}, in the run's .asks directory.`;
  }
  const filed = Boolean(run.steps[name].taskId);
  const status = gateWord(
    filed,
    runWords(steps, run, phaseOf, closeoutOf, askedCloseout, spendOf, verdictOf).get(name),
    () => standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status,
  );
  if (approvedFirst(step, run) && !run.steps[name].taskId) {
    const back = asks.find((a) => step.after.includes(a.step));
    if (back) {
      return (
        `try ${back.try} of ${back.step} is asked for (${modeWord(back)}, at ${back.at}), and ${name} acts on what it changes: approving now would take the result that ask objects to. ` +
        `Approve ${name} once ${back.step} has signed off again — or, to take the result as it stands, take that ask back first: retry-${back.step}-${back.try}, in the run's .asks directory.`
      );
    }
    if (status !== 'awaiting approval') {
      const unfinished = notHandedOn(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf);
      return (
        `${name} is not at its gate yet: it ends the run in the repository's own checkout, and its gate holds once ${andList(unfinished)} ${unfinished.length > 1 ? 'have' : 'has'} handed on — ` +
        `your approval is then what files it, and nothing of it runs before that. See where the run stands: nemia ls ${run.id}.`
      );
    }
    if (resultOnBase(standings)) {
      return (
        `${standings.map((s) => branchWord(run, s)).join(', ')}, so there is nothing left for ${name} to merge: approving would file it to merge what the base branch already has. ` +
        `The run has landed as git reads it — nemia decide ${run.id} says so, and a run started --after it goes on without ${name}. Nothing waits on you; if you want the record closed: nemia cancel ${run.id}.`
      );
    }
  }
  if (status === 'awaiting approval') return null;
  return notAtItsGate(step, run, filed, status);
};

/**
 * The word the gate reads for a step: the run's (`word`, `runWords`: its standing with the routing laid over it), and for a filed step the
 * run reads at its gate, where it stands (`stood`) — its session is what waits for the word. A step the words do not name reads `pending`.
 * Pure.
 */
function gateWord(filed: boolean, word: StepStatus | undefined, stood: () => StepStatus): StepStatus {
  const said = word ?? 'pending';
  return filed && said === 'awaiting approval' ? stood() : said;
}

/**
 * Why a gated step that does not wait at its gate is not approved, by the word the run reads for it (`status`), in words that name what
 * to do instead. A table condition never filed (`filed` false) says it in a condition's words: its producer not signed off, its table
 * answering no route, off the route taken. Pure.
 */
function notAtItsGate(step: StepSpec, run: Run, filed: boolean, status: StepStatus): string {
  const { name } = step;
  if (step.route?.kind === 'table' && !filed) {
    const producer = firstPiece(step.route.from, '.');
    const said: Partial<Record<StepStatus, string>> = {
      pending: `${name} routes off what ${producer} says, and ${producer} has not signed off on it yet: its gate holds once its table answers a route. Approve it then (nemia ls ${run.id}).`,
      unsigned: `${name}'s table answers no route for what ${producer} said, so there is nothing to approve. Route it yourself: ${routeLine(run, step)}.`,
      skipped: `${name} is off the route the run took, so it is never filed and there is nothing to approve. See where the run stands: nemia ls ${run.id}.`,
    };
    const own = said[status];
    if (own) return own;
  }
  const then = `Its gate holds once it has signed off${step.check ? ' and passed its check' : ''}: approve it then (nemia ls ${run.id}).`;
  const why: Partial<Record<StepStatus, string>> = {
    pending: `${name} has not signed off yet: it has not been filed. ${then}`,
    running: `${name} has not signed off yet: it is still running. ${then}`,
    checking: `${name} has signed off, and its check is still due or running: a gated step is verified first, then held. Approve it once its check has passed (nemia ls ${run.id}).`,
    blocked: `${name} has not signed off its work: it signed off blocked, so there is nothing to approve. Answer it: nemia retry ${run.id} ${name} --message "<answer>".`,
    unsigned: `${name} has not signed off: it ended without its closeout, or with one the run does not accept — short of a field its output: declares, or naming a file the run does not have (nemia decide ${run.id}) — so there is nothing to approve. Try it again: nemia retry ${run.id} ${name}.`,
    'failed (check)': `${name} has not passed its check, so its work is not verified and there is nothing to approve. See what the check said: nemia decide ${run.id}.`,
    failed: `${name} has not signed off: its session failed first, so there is nothing to approve. Try it again: nemia retry ${run.id} ${name}.`,
    stopped: `${name} has not signed off: its session was stopped first, so there is nothing to approve. Try it again: nemia retry ${run.id} ${name}.`,
    denied: `${name} signed off, and its harness denied its try a call, which \`denials: fail\` does not pass on: there is nothing to approve. See what it was denied: nemia decide ${run.id}.`,
    exhausted: `${name} has handed nothing on: it asked for another round on the last one \`rounds:\` allows. Go round once more — nemia retry ${run.id} ${name} --round — and approve what a later round hands on, or take the work as it stands and approve that: nemia approve ${run.id} ${name} --message "<why>".`,
    verified: `${name} has handed nothing on: it asked for another round (\`again: true\`), which the run files itself. Its gate holds once a round of it hands on, \`again: false\`.`,
    unverified: `${name} has handed nothing on: it asked for another round (\`again: true\`), which the run files itself. Its gate holds once a round of it hands on, \`again: false\`.`,
  };
  return why[status] ?? `${name} is ${status}, not awaiting approval, so there is nothing to approve. See why: nemia decide ${run.id}.`;
}

/** The yes an approval gives: at a step's gate, or to a loop out of rounds. */
export type ApproveForm = 'gate' | 'loop';

/**
 * The yes `nemia approve` gives on `name` of `run`, given whether that step waits at its gate now (`atGate`, read only where it decides):
 * to a loop where no step is named — a step at its gate is always named — or where the step closes a loop and is gated at no step; at its
 * gate where it is gated and closes no loop, and where it is not there, which the gate's own refusal names. A step both gated and closing
 * a loop is approved at its gate while it waits there, and its loop ended otherwise. Pure.
 */
export function approveFormOf(
  steps: readonly StepSpec[],
  run: Pick<Run, 'gates'>,
  name: string | undefined,
  atGate: () => boolean,
): ApproveForm {
  if (name === undefined) return 'loop';
  const step = steps.find((s) => s.name === name);
  if (step === undefined || !step.loop) return 'gate';
  if (!hasGate(step, run)) return 'loop';
  return atGate() ? 'gate' : 'loop';
}

/**
 * What of a step refuses `nemia approve <run> <step> --off` (`takeBackJudged`, which words it), or null: a step the run does not have,
 * then one not approved, then one approved whose session or check has a task — what it approved has run. Pure.
 */
export const takeBackStop: TakeBackStopOf = ({ known, approved, filed }) =>
  !known ? 'unknown' : !approved ? 'unapproved' : filed ? 'handed-on' : null;

/**
 * Whether `nemia approve <run> <name> --off` may take back the approval of step `name`: the approval it takes back, where the step stands
 * approved (`approvalOf`) — whether the approval names the work it approved or an older nemia wrote it with none — and nothing of it has
 * been filed, neither its session nor its check (an ending waiting on the checkout, held, or not yet ticked); else why not, in words that
 * name the fix (`refused`). The stop is `takeBackStop`'s; the words of a step that has handed on are a second approval's
 * (`handedOnWords`). Pure.
 */
export function takeBackJudged(steps: readonly StepSpec[], run: Run, name: string): { approval: Approval } | { refused: string } {
  const step = steps.find((s) => s.name === name);
  const record = run.steps[name];
  const given = approvalOf(run, name);
  const stop = takeBackStop({
    known: step !== undefined && record !== undefined,
    approved: given !== undefined,
    filed: Boolean(record?.taskId || record?.check),
  });
  if (stop === 'unknown') return { refused: `${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.` };
  if (stop === 'unapproved' || !given)
    return {
      refused: `try ${tryOf(run, name)} of ${name} is not approved, so there is nothing to take back. To approve it once it waits at its gate: nemia approve ${run.id} ${name}. See where it stands: nemia ls ${run.id}.`,
    };
  if (stop === null) return { approval: given };
  const approved = `try ${given.try} of ${name} was approved at ${given.at}${given.message !== undefined ? ', with words' : ''}`;
  return { refused: handedOnWords(steps, name, run, approved, 'and its approval cannot be taken back') };
}
