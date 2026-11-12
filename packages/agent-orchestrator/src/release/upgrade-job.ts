/**
 * The two decisions of an upgrade started from the board or the MCP port (`upgrade-job.verb.ts`), pure and proved by
 * `contracts/upgrade-start.contract.ts`: whether a start is refused before anything is filed (`upgradeStartRefusal`), and the release going
 * back goes to (`previousRelease`).
 */
import type { NewestOlder, PreviousRelease, UpgradeStartRefused } from '../../contracts/upgrade-start.contract.ts';
import { goingBackRefused } from './floor.ts';

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

/**
 * The newest of the releases `installed` whose version is older than `running`, its tag and its version's numbers; `found` false where
 * none is, or `running` is null. One pass, keeping the newest older release seen so far, each comparison written number by number so
 * the verifier guesses the loop's invariants from the laws (a call in the loop's condition left them unguessed).
 */
export const newestOlder: NewestOlder = (installed, running) => {
  let best = { found: false, tag: '', major: 0, minor: 0, patch: 0 };
  for (const r of installed) {
    const v = r.version;
    if (
      running !== null &&
      v !== null &&
      (v.major < running.major ||
        (v.major === running.major && (v.minor < running.minor || (v.minor === running.minor && v.patch < running.patch)))) &&
      (!best.found ||
        v.major > best.major ||
        (v.major === best.major && (v.minor > best.minor || (v.minor === best.minor && v.patch >= best.patch))))
    )
      best = { found: true, tag: r.tag, major: v.major, minor: v.minor, patch: v.patch };
  }
  return best;
};

/**
 * The tag of the release going back goes to: the newest of the releases `installed` whose version is older than `running`, the one the
 * server runs (`newestOlder`); null where none is installed, or the server runs no versioned release (`running` null).
 */
export const previousRelease: PreviousRelease = (installed, running) => {
  const found = newestOlder(installed, running);
  return found.found ? found.tag : null;
};
