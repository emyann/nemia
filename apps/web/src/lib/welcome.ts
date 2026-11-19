/**
 * Whether the board sends a person from `/` to the welcome page, `/welcome` (`welcomeAsked`, proved by `contracts/welcome.contract.ts`):
 * a fresh store — no harness activated and no factory filed — whose person has not skipped the harness in this browser. Pure, over the
 * readiness read as it is now, so a harness activated or a factory filed at a terminal takes the welcome away.
 */
import type { WelcomeAsked } from '../../contracts/welcome.contract.ts';

/**
 * Whether the welcome is asked: no harness's install piece met, no factory piece met, and no skip kept in this browser.
 * @param pieces The readiness read's pieces.
 * @param skipped Whether the person skipped the harness in this browser.
 */
export const welcomeAsked: WelcomeAsked = (pieces, skipped) =>
  !skipped &&
  !pieces.some((p) => p.harness !== undefined && p.harness.part === 'install' && p.state === 'met') &&
  !pieces.some((p) => p.area === 'factory' && p.state === 'met');
