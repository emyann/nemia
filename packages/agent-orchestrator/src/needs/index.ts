/**
 * The face of `src/needs/`: the pure judgements of a machine's needs (`needs.ts`), and a harness's mark of a removal and its install as
 * it is run (`harness.ts`), which a file outside the folder imports from here.
 */
export { needsWaited, waitingOnNeedsWord, type NeedHeld, type NeedWaited } from './needs.ts';
export { DEACTIVATED, harnessInstallCommand } from './harness.ts';
