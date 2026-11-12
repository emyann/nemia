/**
 * Going back to an older release (packages/agent-orchestrator, src/release/floor.ts): the store records the oldest release that can read
 * it (`$WF_ROOT/store.json`'s `readableFrom`), and `nemia upgrade <older>` is refused where the release asked for is older than that,
 * naming the oldest it may go to (the distribution intent's R2-10). Moving forward the store is read in place and never rewritten, so
 * only going back is ever refused.
 *
 * Each release declares in its code the oldest release that reads what it writes (`STORE_READABLE_FROM`); the daemon raises the record
 * to it as it takes the store (`floorAfter`), level-triggered, and never lowers it: a store once written by a newer release stays
 * unreadable to the releases before that one, whichever release runs it later.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A release's version, `v<major>.<minor>.<patch>` read as three whole numbers (tools/release's `releaseTag`). */
export type Version = { readonly major: number; readonly minor: number; readonly patch: number };

/** Whether `a` is an older release than `b`. */
const older = (a: Version, b: Version): boolean =>
  a.major < b.major || (a.major === b.major && (a.minor < b.minor || (a.minor === b.minor && a.patch < b.patch)));

/** Whether `a` and `b` are one release. */
const same = (a: Version, b: Version): boolean => a.major === b.major && a.minor === b.minor && a.patch === b.patch;

/** A version's three numbers are whole and not negative. */
const whole = (v: Version): boolean =>
  Number.isInteger(v.major) && Number.isInteger(v.minor) && Number.isInteger(v.patch) && v.major >= 0 && v.minor >= 0 && v.patch >= 0;

const goingBackSpec = spec<(target: Version, floor: Version | null) => boolean>({
  requires: ({ input: [target, floor] }) => whole(target) && (floor === null || whole(floor)),
  ensures: {
    olderThanTheFloorIsRefused: {
      description: 'A release older than the oldest that can read the store is refused',
      condition: ({ input: [target, floor], output }) => floor === null || !older(target, floor) || output,
    },
    theFloorAndAboveAreAllowed: {
      description: 'The oldest release that can read the store, and every release after it, is allowed',
      condition: ({ input: [target, floor], output }) => floor === null || older(target, floor) || !output,
    },
    aStoreWithNoRecordRefusesNothing: {
      description: 'A store that records no floor — written by no release that keeps one — refuses no release',
      condition: ({ input: [, floor], output }) => floor !== null || !output,
    },
  },
});

/** `goingBackRefused`'s type: whether `nemia upgrade <target>` is refused on a store whose floor is `floor`. */
export type GoingBackRefused = Implementation<typeof goingBackSpec>;

const floorAfterSpec = spec<(record: Version | null, own: Version) => Version>({
  requires: ({ input: [record, own] }) => whole(own) && (record === null || whole(record)),
  ensures: {
    neverLowered: {
      description: 'The floor a daemon leaves is never older than the one the store recorded',
      condition: ({ input: [record], output }) => record === null || !older(output, record),
    },
    raisedToItsOwn: {
      description: 'The floor a daemon leaves is never older than what its own release writes for',
      condition: ({ input: [, own], output }) => !older(output, own),
    },
    noHigherThanNeeded: {
      description: 'The floor left is the record or the release’s own, whichever is newer, and nothing beyond',
      condition: ({ input: [record, own], output }) => same(output, own) || (record !== null && same(output, record)),
    },
  },
});

/** `floorAfter`'s type: the floor a daemon whose release writes for `own` leaves on a store that recorded `record`. */
export type FloorAfter = Implementation<typeof floorAfterSpec>;
