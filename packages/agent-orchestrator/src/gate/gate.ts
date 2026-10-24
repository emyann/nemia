/**
 * A gate, from a person's side: the words refused with an approval (`approvalWordsRefusal`), why `nemia approve` will not approve a step
 * (`approvalRefusal`), and whether a step's task, held open, waits for a person's word on this pass (`holdsOpen`). Pure.
 */
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import type { Closeout } from '../closeout/index.ts';
import { andList, tryOf, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import { heard, modeWord, retryable, type RetryAsk } from '../retry/index.ts';
import {
  approvalOf,
  approvedFirst,
  branchWord,
  gatesOf,
  hasGate,
  notHandedOn,
  resultOnBase,
  standing,
  type BranchStanding,
  type SpendOf,
} from '../status/status.ts';
import { heldRefusal, prunedRefusal } from '../prune/prune.ts';

/**
 * Whether a step's task, filed held open (`holdsOpenOn`) and waiting for a person's word — the runtime's `input-required` — stays open on
 * this pass. Pure. Open while a person's word is what moves the step, so that word reaches the session that signed as its next turn
 * (`e.answer`) rather than a new task: the step signed off `blocked`, or it is gated and the try it is on is not approved — checking, or at
 * its gate. Anything else closes it (`e.close`), which settles it as it signed: an ungated step that signed off, a gated one once approved,
 * a check that refused, a denial under `denials: fail`, a closeout short of a field. And every waiting task of a run called off or pruned,
 * whose steps nobody will answer. A try of a closed step is filed as its own task, `-try<n>`.
 */
export function holdsOpen(
  step: Workflow,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  askedCloseout: (taskId: string) => CloseoutAsked,
  steps: readonly Workflow[],
  spendOf: SpendOf,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): boolean {
  if (run.cancelledAt || run.pruned) return false;
  const { status, own } = standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf);
  if (own === 'blocked') return true;
  return hasGate(step, run) && (own === 'checking' || status === 'awaiting approval');
}

/**
 * Why the words given with an approval cannot ride on it — or null. Pure, and asked before anything about the run: words that are empty.
 */
export const approvalWordsRefusal = (message: string | undefined, command = 'nemia approve <runId> <step>'): string | null =>
  message !== undefined && !message.trim()
    ? `--message is empty, and an approval's words are handed to every step after the gate: empty, they tell them nothing. Say what you approve, or on what terms — ${command} --message "<words>" — or leave --message out.`
    : null;

/**
 * Why `nemia approve` will not approve this step, in words that name the fix — or null, when it may: the step waits at its gate. Pure.
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
export function approvalRefusal(
  steps: readonly Workflow[],
  run: Run,
  name: string,
  message: string | undefined,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  spendOf: SpendOf = () => undefined,
  standings: readonly BranchStanding[] = [],
): string | null {
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
  const { sendsBack } = retryable(step, run, phaseOf, closeoutOf, askedCloseout, steps, () => false, spendOf, verdictOf);
  if (given) {
    const approved = `try ${n} of ${name} is already approved, at ${given.at}${given.message !== undefined ? ', with words' : ''}`;
    if (sendsBack)
      return `${approved}: what waits on it is filed on the next tick, once. To send it back instead, before that tick: nemia retry ${run.id} ${name} --message "<objection>".`;
    const after = steps.some((s) => s.after.includes(name));
    return `${approved}, and it has handed on: ${after ? 'what waits on it has been filed' : 'nothing waits on it, and its run goes on without it'}, so there is nothing to approve, nor to send back. See where the run stands: nemia ls ${run.id}.`;
  }
  const pending = asks.find((a) => a.step === name && a.try === n + 1);
  if (pending && !heard(pending, sendsBack)) {
    return `try ${n + 1} of ${name} is asked for (${modeWord(pending)}, at ${pending.at}) with no words, and ${name} is at its gate, so no tick honours it: a send-back says what to change. Delete that ask — retry-${name}-${n + 1}, in the run's .asks directory — then approve it, or send it back with words: nemia retry ${run.id} ${name} --message "<objection>".`;
  }
  if (pending) {
    return `try ${n + 1} of ${name} is already asked for (${modeWord(pending)}, at ${pending.at}): the next tick sends it back, and an approval of try ${n} would be spent by it at once. Approve try ${n + 1} once it has signed off — or, to approve this one, take that ask back first: retry-${name}-${n + 1}, in the run's .asks directory.`;
  }
  const { status } = standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf);
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
  const then = `Its gate holds once it has signed off${step.check ? ' and passed its check' : ''}: approve it then (nemia ls ${run.id}).`;
  const why: Partial<Record<StepStatus, string>> = {
    waiting: `${name} has not signed off yet: it has not been filed. ${then}`,
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
