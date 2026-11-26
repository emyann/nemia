import type { ApproveStepOf } from '../../contracts/wait-action.contract.ts';

/**
 * The step a waiting card's approval button names: the step of a run's wait at an approval's gate, none for any other wait and for a run
 * that waits on nobody.
 * @param wait What the run waits on a person for (`waitOf`), null where it waits on nobody.
 */
export const approveStepOf: ApproveStepOf = (wait) => (wait !== null && wait.kind === 'approve' ? wait.step : null);
