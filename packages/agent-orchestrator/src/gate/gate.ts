/**
 * A gate, from a person's side: the words refused with an approval (`approvalWordsRefusal`), and whether a step's task, held open, waits
 * for a person's word on this pass (`holdsOpen`). Pure.
 */
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { CloseoutAsked, Run, TaskPhase } from '../record/record.ts';
import { hasGate, standing, type SpendOf } from '../status/status.ts';

/**
 * Whether a step's task, filed held open (`holdsOpenOn`) and waiting for a person's word — the runtime's `input-required` — stays open on this
 * pass. Pure. Open while a person's word is what moves the step, so that word reaches the session that signed as its next turn (`e.answer`)
 * rather than a new task: the step signed off `blocked`, or it is gated and the try it is on is not approved — checking, or at its gate.
 * Anything else closes it (`e.close`), which settles it as it signed: an ungated step that signed off, a gated one once approved, a check
 * that refused, a denial under `denials: fail`, a closeout short of a field. And every waiting task of a run called off or pruned, whose
 * steps nobody will answer. A try of a closed step is filed as its own task, `-try<n>`.
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

/** Why the words given with an approval cannot ride on it — or null. Pure, and asked before anything about the run: words that are empty. */
export const approvalWordsRefusal = (message: string | undefined, command = 'wf approve <runId> <step>'): string | null =>
  message !== undefined && !message.trim()
    ? `--message is empty, and an approval's words are handed to every step after the gate: empty, they tell them nothing. Say what you approve, or on what terms — ${command} --message "<words>" — or leave --message out.`
    : null;
