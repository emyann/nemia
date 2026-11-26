/**
 * Where a watch of a list starts (apps/api, src/watch/watch.ts, `watchStartOf`), from the `resourceVersion` its query asks, Kubernetes'
 * spelling: none asked (absent, or empty) sends the list's state whole, each object ADDED and then a BOOKMARK; one asked starts there and
 * sends no state, so a reader that kept the `resourceVersion` of the last event, BOOKMARK or list it was sent resumes there and loses no
 * change across a restart. Of a list whose objects are the feed's own lines (`follows`, the Event lists, while the feed is a file of its
 * own) the version is a byte of the feed, and the watch follows the feed from it; of every other list it is a revision of the keyspace,
 * and the watch replays the rows written after it (`Keyspace.since`), then follows the head. A word that is no version is refused before
 * anything is read.
 *
 * The api reads the asked word as a version (`version`: a decimal with no sign and no leading zero, as every `resourceVersion` is
 * written, else none) before it asks. Whether the store can start there is asked after: of the feed, `feedCursorRefusal`; of the
 * keyspace, its `watchStart` (contracts/keyspace.contract.ts), a revision compacted away answered 410 Gone, Kubernetes' expired
 * `resourceVersion`, and one past the head 400, naming the list's own. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Why a watch's `resourceVersion` is refused before anything is read: it names no version (`not-a-version`, a 400). */
export type WatchStartRefusal = 'not-a-version';

/**
 * Where a watch starts: the list's state whole (`state`), the feed from a byte (`from`, its `cursor`), the keyspace after a revision
 * (`since`, its `revision`), or refused before anything is read (`refused`, a 400 naming what to send instead).
 */
export type WatchStart =
  | { readonly kind: 'state' }
  | { readonly kind: 'from'; readonly cursor: number }
  | { readonly kind: 'since'; readonly revision: number }
  | { readonly kind: 'refused'; readonly reason: WatchStartRefusal };

/** Whether the watch asked a `resourceVersion`: an empty one asks none, as Kubernetes reads it. */
const asks = (asked: string | undefined) => asked !== undefined && asked !== '';

const watchStartSpec = spec<(asked: string | undefined, follows: boolean, version: number | undefined) => WatchStart>({
  requires: ({ input: [asked, , version] }) =>
    version === undefined || (Number.isSafeInteger(version) && version >= 0 && asks(asked)),
  ensures: {
    noneAskedSendsTheState: {
      description: 'A watch that asks no resourceVersion is sent the list whole, whatever the list',
      condition: ({ input: [asked], output }) => asks(asked) || output.kind === 'state',
    },
    theFeedsListStartsAtTheByteAsked: {
      description: 'A watch of a list of the feed’s lines asked a version starts at that byte of the feed and sends no state',
      condition: ({ input: [asked, follows, version], output }) =>
        !asks(asked) || !follows || version === undefined || (output.kind === 'from' && output.cursor === version),
    },
    everyOtherListStartsAfterTheRevisionAsked: {
      description: 'A watch of any other list asked a version replays the keyspace after that revision and sends no state',
      condition: ({ input: [asked, follows, version], output }) =>
        !asks(asked) || follows || version === undefined || (output.kind === 'since' && output.revision === version),
    },
    aWordThatIsNoVersionIsRefused: {
      description: 'A resourceVersion that names no version is refused before anything is read, whatever the list',
      condition: ({ input: [asked, , version], output }) =>
        !asks(asked) || version !== undefined || (output.kind === 'refused' && output.reason === 'not-a-version'),
    },
  },
});

/** `watchStartOf`'s type, which `src/watch/watch.ts` takes. */
export type WatchStartOf = Implementation<typeof watchStartSpec>;
