/**
 * An upgrade started from the board or the MCP port (packages/agent-orchestrator, src/release/upgrade-job.ts): `nemia upgrade <tag>`
 * run on the server as a job of the engine, which outlives the daemon it restarts.
 *
 * - `upgradeStartRefusal`: whether a start is refused before anything is filed — while an upgrade the store started is still at work
 *   (one at a time: two would race on `releases/current` and on the daemon's restart), and where the tag asked for goes back past the
 *   oldest release that can read the store (`store.json`'s floor, the rule `nemia upgrade` keeps: store-floor.contract.ts). A tag that
 *   is no version is no business of this decision: the floor reads none of it, as `floorRefusal` reads none, and `tagRefusal` judges
 *   its spelling beside it.
 * - `previousRelease`: the release going back goes to — the newest installed release older than the one the server runs; none on a
 *   server that runs no versioned release, or where none older is installed.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Version } from './store-floor.contract.ts';

/** Why an upgrade's start is refused: one is still at work (`in-flight`), or the tag is older than the store's floor (`below-floor`). */
export type UpgradeStartRefusal = 'in-flight' | 'below-floor';

/** A release installed under the store's `releases/`: its folder's name, and its version where that name reads as one. */
export type InstalledVersion = { readonly tag: string; readonly version: Version | null };

/** Whether `a` is an older release than `b`. */
const older = (a: Version, b: Version): boolean =>
  a.major < b.major || (a.major === b.major && (a.minor < b.minor || (a.minor === b.minor && a.patch < b.patch)));

/** A version's three numbers are whole and not negative. */
const whole = (v: Version): boolean =>
  Number.isInteger(v.major) && Number.isInteger(v.minor) && Number.isInteger(v.patch) && v.major >= 0 && v.minor >= 0 && v.patch >= 0;

/** Whether the tag asked for goes back past the store's floor: both are versions, and the tag's is older. */
const pastTheFloor = (target: Version | null, floor: Version | null): boolean =>
  target !== null && floor !== null && older(target, floor);

const upgradeStartSpec = spec<(target: Version | null, floor: Version | null, inFlight: boolean) => UpgradeStartRefusal | null>({
  requires: ({ input: [target, floor] }) => (target === null || whole(target)) && (floor === null || whole(floor)),
  ensures: {
    oneAtATime: {
      description: 'While an upgrade the store started is still at work, another is refused, whatever it asks for',
      condition: ({ input: [, , inFlight], output }) => !inFlight || output === 'in-flight',
    },
    pastTheFloorIsRefused: {
      description: 'With none at work, a release older than the oldest that can read the store is refused, as nemia upgrade refuses it',
      condition: ({ input: [target, floor, inFlight], output }) => inFlight || !pastTheFloor(target, floor) || output === 'below-floor',
    },
    otherwiseItStarts: {
      description: 'With none at work, the floor or a newer release, a tag that is no version, or a store with no floor is started',
      condition: ({ input: [target, floor, inFlight], output }) => inFlight || pastTheFloor(target, floor) || output === null,
    },
  },
});

/** `upgradeStartRefusal`'s type: why a start of an upgrade to `target` is refused on a store whose floor is `floor`, or null. */
export type UpgradeStartRefused = Implementation<typeof upgradeStartSpec>;

/** Whether the installed release `i` is older than the release the server runs. */
const olderThanRunning = (i: InstalledVersion, running: Version | null): boolean =>
  running !== null && i.version !== null && older(i.version, running);

/** Whether the installed release `i` is not older than `j`: both versions, `i`'s at least `j`'s. */
const atLeast = (i: InstalledVersion, j: InstalledVersion): boolean => i.version !== null && j.version !== null && !older(i.version, j.version);

const previousReleaseSpec = spec<(installed: readonly InstalledVersion[], running: Version | null) => string | null>({
  requires: ({ input: [installed, running] }) =>
    (running === null || whole(running)) && installed.every((i) => i.version === null || whole(i.version)),
  ensures: {
    anInstalledOlderRelease: {
      description: 'The release going back goes to is one installed under releases/, older than the one the server runs',
      condition: ({ input: [installed, running], output }) =>
        output === null || installed.some((i) => i.tag === output && olderThanRunning(i, running)),
    },
    theNewestOfThem: {
      description: 'It is the newest of the older releases installed: going back goes one release back, never further',
      condition: ({ input: [installed, running], output }) =>
        output === null ||
        installed.every(
          (j) => !olderThanRunning(j, running) || installed.some((i) => i.tag === output && olderThanRunning(i, running) && atLeast(i, j)),
        ),
    },
    oneWhereThereIsOne: {
      description: 'Where an older release is installed, there is a release to go back to; where none is, there is none',
      condition: ({ input: [installed, running], output }) => (output !== null) === installed.some((i) => olderThanRunning(i, running)),
    },
  },
});

/** `previousRelease`'s type: the tag of the release going back goes to, among `installed`, for a server that runs `running`; or null. */
export type PreviousRelease = Implementation<typeof previousReleaseSpec>;
