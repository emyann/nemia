/**
 * The two decisions of an upgrade started from the board or the MCP port (`upgrade-job.verb.ts`), pure and proved by
 * `contracts/upgrade-start.contract.ts`: whether a start is refused before anything is filed (`upgradeStartRefusal`), and the release going
 * back goes to (`previousRelease`).
 */
import type { PreviousRelease, UpgradeStartRefused } from '../../contracts/upgrade-start.contract.ts';
import { goingBackRefused, type Version } from './floor.ts';

export type { InstalledVersion, UpgradeStartRefusal } from '../../contracts/upgrade-start.contract.ts';

/**
 * Why a start of an upgrade to `target` on a store whose floor is `floor` is refused: one is still at work (`in-flight`), whatever it
 * asks for; else the tag goes back past the floor (`below-floor`, `goingBackRefused`); else null. A tag that is no version (`target`
 * null) passes here: `tagRefusal` judges its spelling, and `nemia upgrade` what it names.
 */
export const upgradeStartRefusal: UpgradeStartRefused = (target, floor, inFlight) => {
  if (inFlight) return 'in-flight';
  if (target !== null && goingBackRefused(target, floor)) return 'below-floor';
  return null;
};

/** Whether `a` is an older release than `b`, number by number: `olderThan`, written so the verifier reads it. */
const older = (a: Version, b: Version): boolean =>
  a.major < b.major || (a.major === b.major && (a.minor < b.minor || (a.minor === b.minor && a.patch < b.patch)));

/**
 * The tag of the release going back goes to: the newest of the releases `installed` whose version is older than `running`, the one the
 * server runs; null where none is installed, or the server runs no versioned release (`running` null).
 */
export const previousRelease: PreviousRelease = (installed, running) => {
  if (running === null) return null;
  const found = installed.find((i) => {
    const v = i.version;
    return (
      v !== null && older(v, running) && installed.every((j) => j.version === null || !older(j.version, running) || !older(v, j.version))
    );
  });
  return found === undefined ? null : found.tag;
};
