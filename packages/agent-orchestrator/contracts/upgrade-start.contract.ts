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
const pastTheFloor = (target: Version | null, floor: Version | null): boolean => target !== null && floor !== null && older(target, floor);

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
const atLeast = (i: InstalledVersion, j: InstalledVersion): boolean =>
  i.version !== null && j.version !== null && !older(i.version, j.version);

/**
 * The newest installed release older than the one the server runs, as `newestOlder` keeps it while it reads the installed ones: whether
 * one was found, its tag, and its version's three numbers.
 */
export type Newest = {
  readonly found: boolean;
  readonly tag: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

/** Whether the installed release `i` carries the version of `n`: a version, number by number the same. */
const carries = (i: InstalledVersion, n: Newest): boolean =>
  i.version !== null && i.version.major === n.major && i.version.minor === n.minor && i.version.patch === n.patch;

/** Whether the installed release `j`, a version, is not newer than `n`. */
const noNewerThan = (j: InstalledVersion, n: Newest): boolean =>
  j.version !== null && !older({ major: n.major, minor: n.minor, patch: n.patch }, j.version);

/**
 * The helper `previousRelease` leans on, so its laws are proved from a loop's invariants rather than asked of a search (a newest older
 * release exists wherever an older one does takes induction): the newest installed release older than `running`.
 */
const newestOlderSpec = spec<(installed: readonly InstalledVersion[], running: Version | null) => Newest>({
  requires: ({ input: [installed, running] }) =>
    (running === null || whole(running)) && installed.every((i) => i.version === null || whole(i.version)),
  ensures: {
    anInstalledOlderOne: {
      description: 'The release found is one of those installed, by its tag and its version, older than the one the server runs',
      condition: ({ input: [installed, running], output }) =>
        !output.found || installed.some((i) => i.tag === output.tag && carries(i, output) && olderThanRunning(i, running)),
    },
    noOlderOneIsNewer: {
      description: 'No installed release older than the one the server runs is newer than the release found',
      condition: ({ input: [installed, running], output }) =>
        !output.found || installed.every((j) => !olderThanRunning(j, running) || noNewerThan(j, output)),
    },
    foundWhereThereIsOne: {
      description: 'A release is found exactly where an older one is installed',
      condition: ({ input: [installed, running], output }) => output.found === installed.some((i) => olderThanRunning(i, running)),
    },
  },
});

/** `newestOlder`'s type: the newest of `installed` older than `running`, `found` false where none is. */
export type NewestOlder = Implementation<typeof newestOlderSpec>;

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
