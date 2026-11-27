import type { WaitActionOf } from '../../contracts/wait-action.contract.ts';

/**
 * The button a waiting card holds: Approve for a run that waits at an approval's gate, Answer for one whose step waits on a person's
 * answer, each with the step it names; none for any other wait, a wait of no step, and a run that waits on nobody.
 * @param wait What the run waits on a person for (`waitOf`), null where it waits on nobody.
 */
export const waitActionOf: WaitActionOf = (wait) =>
  wait !== null && wait.step !== null && (wait.kind === 'approve' || wait.kind === 'answer') ? { verb: wait.kind, step: wait.step } : null;
