/**
 * The store's floor: the oldest release that can read the store, which `$WF_ROOT/store.json` records (`readableFrom`). A release says in
 * its code the oldest release that reads what it writes (`STORE_READABLE_FROM`); the daemon raises the record to it as it takes the
 * store (`floorAfter`) and never lowers it; and `nemia upgrade <older>` is refused where the release asked for is below it
 * (`goingBackRefused`). Moving forward the store is read in place, so only going back is ever refused: the one rewrite, v1.26.0's move
 * of each factory's file into one list of volumes (`volumesMovedAt`), is made by the daemon as it takes the store, before it raises this.
 * Pure: the
 * record is read and written by `archive.store.ts`, the refusal said by `upgrade.verb.ts`.
 */
import type { FloorAfter, GoingBackRefused, Version } from '../../contracts/store-floor.contract.ts';

export type { Version };

/**
 * The oldest release that reads what this release writes to the store. A release that changes what the store holds so that an older one
 * would misread it raises this to its own version: v1.26.0 did, as each factory's file holds one list of volumes, which a release before
 * it reads as a factory on no repository; and v1.36.0 has, as a factory's proposals are records of the keyspace (`<store>/db/state.db`)
 * and their files moved aside, which a release before it reads as none.
 */
export const STORE_READABLE_FROM: Version = { major: 1, minor: 36, patch: 0 };

/**
 * A release's version as its tag or `release.json` says it, `v1.2.3` or `1.2.3`, read as three whole numbers; null for anything else,
 * a space around it or a pre-release suffix included: a tag names its folder under `releases/`, so it is read exactly, as
 * `tools/release/install.sh` reads one.
 * @param text The version as a tag or `release.json` writes it.
 */
export function parseVersion(text: string) {
  const parts = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/.exec(text);
  if (parts === null) return null;
  const [, major, minor, patch] = parts;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/**
 * A version as its tag is written: `v1.2.3`.
 * @param v The version to write.
 */
export const versionTag = (v: Version) => `v${v.major}.${v.minor}.${v.patch}`;

/**
 * Whether `a` is an older release than `b`.
 * @param a The version asked of.
 * @param b The version it is compared with.
 */
export const olderThan = (a: Version, b: Version) =>
  a.major !== b.major ? a.major < b.major : a.minor !== b.minor ? a.minor < b.minor : a.patch < b.patch;

/**
 * Whether `nemia upgrade <target>` is refused on a store whose floor is `floor`: only below it, and never where the store records none.
 * @param target The version the upgrade names.
 * @param floor The store's floor, or null where the store records none.
 */
export const goingBackRefused: GoingBackRefused = (target, floor) => floor !== null && olderThan(target, floor);

/**
 * The floor a daemon whose release writes for `own` leaves on a store that recorded `record`: the newer of the two.
 * @param record The floor the store recorded, or null where it recorded none.
 * @param own The floor this daemon's release writes for.
 */
export const floorAfter: FloorAfter = (record, own) => (record !== null && olderThan(own, record) ? record : own);
