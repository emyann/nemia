/** Whether a step's task, held open, waits for a person's word on this pass (`holdsOpen`, `contracts/holds-open.contract.ts`). */
import { endedForGood } from '../../record/record.ts';
import { hasGate, standing } from '../../status/status.ts';
import type { HoldsOpen } from '../../../contracts/holds-open.contract.ts';

/**
 * Whether a step's task, filed held open (`holdsOpenOn`) and waiting for a person's word — the runtime's `input-required` — stays open on
 * this pass. Pure. Open while a person's word is what moves the step, so that word reaches the session that signed as its next turn
 * (`e.answer`) rather than a new task: the step signed off `blocked`, or it is gated and the try it is on is not approved — checking, or at
 * its gate. Anything else closes it (`e.close`), which settles it as it signed: an ungated step that signed off, a gated one once approved,
 * a check that refused, a denial under `denials: fail`, a closeout short of a field. And every waiting task of a run ended for good, called
 * off or pruned, whose steps nobody will answer (`endedForGood`) — but not of a held one: a hold lifts, and the word it waits for then
 * reaches the session that signed. A try of a closed step is filed as its own task, `-try<n>`.
 */
export const holdsOpen: HoldsOpen = (step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf = () => undefined) => {
  if (endedForGood(run)) return false;
  const { status, own } = standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf);
  if (own === 'blocked') return true;
  return hasGate(step, run) && (own === 'checking' || status === 'awaiting approval');
};
