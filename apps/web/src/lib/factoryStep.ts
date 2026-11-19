/**
 * What the welcome's factory step, `/welcome/factory`, shows (`factoryStepOf`, proved by `contracts/factory-step.contract.ts`), and the
 * order its three ways are offered in (`FACTORY_WAYS`). Pure, over the store's factory milestone as the api reads it now, the tile the
 * person chose and the write this page made that the api answered: no flag of this browser moves the step on.
 */
import type { FactoryStepOf, FactoryWay } from '../../contracts/factory-step.contract.ts';

export type { FactoryMade, FactoryScreen, FactoryWay } from '../../contracts/factory-step.contract.ts';

/** The three ways, in the order the step offers them: with Nemia first, then from a template, then from scratch. */
export const FACTORY_WAYS: readonly FactoryWay[] = ['nemia', 'template', 'scratch'];

/**
 * The screen the step shows: the guide after an empty factory made here, the made screen once the store holds a factory or a template was
 * applied here, else the chosen way's panel, or the three tiles for none.
 * @param facts Whether the store's factory milestone reads done, the way chosen, and the write this page made that the api answered.
 */
export const factoryStepOf: FactoryStepOf = ({ filed, way, made }) => {
  if (made === 'scratch') return 'guide';
  if (filed || made === 'template') return 'made';
  return way ?? 'choose';
};
