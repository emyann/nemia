/**
 * The permission mode a step's try runs in (`StepFiled.runsIn`), read off what the runtime measured of its session — its last
 * attempt's `ranIn` — beside the mode it was filed with: null where the runtime measured none, else the measured mode, `by` the filing
 * where they agree, `default` with none filed, and `harness` where its harness ran it in another. Typed by its contract.
 */
import type { RunsInOf } from '../../contracts/runs-in.contract.ts';

export const runsInOf: RunsInOf = (filed, ranIn) => {
  if (ranIn === undefined) return null;
  if (filed === undefined) return { mode: ranIn, by: 'default' };
  return { mode: ranIn, by: ranIn === filed ? 'filed' : 'harness' };
};
