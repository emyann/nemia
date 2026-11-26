/**
 * What an upgrade carries (`upgradeCarries`, typed by `contracts/harness-needs.contract.ts`): the harnesses installed at the new
 * release's pins before it switches. Pure; `carry.store.ts` reads the tools folder and the releases' trees and runs the installs.
 */
import type { UpgradeCarries } from '../../contracts/harness-needs.contract.ts';

/**
 * The harnesses `held` names, activated or bundled, that the new release pins (`pinned`), each once, in the order `pinned` gives.
 * @param held The harnesses the store holds, activated and bundled.
 * @param pinned The names of the harnesses the new release pins, in their order.
 */
export const upgradeCarries: UpgradeCarries = (held, pinned) => [
  ...new Set(pinned.filter((harness) => held.activated.includes(harness) || held.bundled.includes(harness))),
];
