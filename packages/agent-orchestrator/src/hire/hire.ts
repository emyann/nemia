/**
 * A hire as the `Hire` object says it: who fills a factory's step (`fillOrigin`) and where each setting a session gets there came from
 * (`settingOrigin`), each proved by contracts/hire-origin.contract.ts, decided from what the resolved step already carries. Pure.
 */
import type { FillOriginOf, SettingOriginOf } from '../../contracts/hire-origin.contract.ts';

/** Who fills a step: its own file's `agent:` (`written`), the factory's hire (`hired`), neither, or both, which a start refuses. */
export const fillOrigin: FillOriginOf = (written, hired) => {
  if (written && hired) return 'refused';
  if (written) return 'step';
  return hired ? 'factory' : 'unfilled';
};

/** Where a setting came from: the step's own file where it writes it, else its agent's where it gives it, else the harness's default. */
export const settingOrigin: SettingOriginOf = (stepSets, agentGives) => {
  if (stepSets) return 'step';
  return agentGives ? 'agent' : 'default';
};
