/**
 * The store's floor: the oldest release that can read the store, which `$WF_ROOT/store.json` records (`readableFrom`). A release says in
 * its code the oldest release that reads what it writes (`STORE_READABLE_FROM`); the daemon raises the record to it as it takes the
 * store (`floorAfter`) and never lowers it; and `nemia upgrade <older>` is refused where the release asked for is below it
 * (`goingBackRefused`). Moving forward the store is read in place and never rewritten, so only going back is ever refused. Pure: the
 * record is read and written by `archive.store.ts`, the refusal said by `upgrade.verb.ts`.
 */
import type { FloorAfter, GoingBackRefused, Version } from '../../contracts/store-floor.contract.ts';

export type { Version };

/**
 * The oldest release that reads what this release writes to the store. A release that changes what the store holds so that an older one
 * would misread it raises this to its own version; none since v1.2.0 has.
 */
export const STORE_READABLE_FROM: Version = { major: 1, minor: 2, patch: 0 };

/**
 * A release's version as its tag or `release.json` says it, `v1.2.3` or `1.2.3`, read as three whole numbers; null for anything else,
 * a space around it or a pre-release suffix included: a tag names its folder under `releases/`, so it is read exactly, as
 * `tools/release/install.sh` reads one.
 */
export function parseVersion(text: string): Version | null {
  const parts = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/.exec(text);
  if (parts === null) return null;
  const [, major, minor, patch] = parts;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** A version as its tag is written: `v1.2.3`. */
export const versionTag = (v: Version): string => `v${v.major}.${v.minor}.${v.patch}`;

/** Whether `a` is an older release than `b`. */
export const olderThan = (a: Version, b: Version): boolean =>
  a.major !== b.major ? a.major < b.major : a.minor !== b.minor ? a.minor < b.minor : a.patch < b.patch;

/** Whether `nemia upgrade <target>` is refused on a store whose floor is `floor`: only below it, and never where the store records none. */
export const goingBackRefused: GoingBackRefused = (target, floor) => floor !== null && olderThan(target, floor);

/** The floor a daemon whose release writes for `own` leaves on a store that recorded `record`: the newer of the two. */
export const floorAfter: FloorAfter = (record, own) => (record !== null && olderThan(own, record) ? record : own);
