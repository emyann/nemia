/**
 * Where a watch of a list starts (apps/api, src/watch/watch.ts, `watchStartOf`), from the `resourceVersion` its query asks, Kubernetes'
 * spelling: none asked (absent, or empty) sends the list's state whole, each object ADDED and then a BOOKMARK, as every watch does today;
 * one asked of a list whose objects are the feed's own lines (`follow`, the Event lists) starts at that byte of the feed and sends no
 * state, each line its selectors keep after it ADDED, so a reader that kept the `resourceVersion` of the last event or BOOKMARK it was
 * sent resumes there and loses no line across a restart. A list read again on each change (every other) keeps no old versions, so it
 * refuses one asked: its watch is sent the state whole. A word that is no byte of the feed is refused before anything is read.
 *
 * The api reads the asked word as a byte (`byte`: a decimal with no sign and no leading zero, as an event's `resourceVersion` is
 * written, else none) before it asks; whether the feed can be read from that byte (`feedCursorRefusal`: a cursor inside a line, or past
 * the end of a feed truncated or replaced since) is asked after, and answered 410, Kubernetes' expired `resourceVersion`. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Why a watch's `resourceVersion` is refused before anything is read: its list is not the feed's, or it names no byte. */
export type WatchStartRefusal = 'not-followed' | 'not-a-cursor';

/**
 * Where a watch starts: the list's state whole (`state`), the feed from a byte (`from`, its `cursor`), or refused before anything is
 * read (`refused`, a 400 naming what to send instead).
 */
export type WatchStart =
  | { readonly kind: 'state' }
  | { readonly kind: 'from'; readonly cursor: number }
  | { readonly kind: 'refused'; readonly reason: WatchStartRefusal };

/** Whether the watch asked a `resourceVersion`: an empty one asks none, as Kubernetes reads it. */
const asks = (asked: string | undefined): boolean => asked !== undefined && asked !== '';

const watchStartSpec = spec<(asked: string | undefined, follows: boolean, byte: number | undefined) => WatchStart>({
  requires: ({ input: [asked, , byte] }) => byte === undefined || ((byte ?? 0) >= 0 && asks(asked)),
  ensures: {
    noneAskedSendsTheState: {
      description: 'A watch that asks no resourceVersion is sent the list whole, whatever the list',
      condition: ({ input: [asked], output }) => asks(asked) || output.kind === 'state',
    },
    aListReadAgainRefusesOne: {
      description: 'A list that is read again on each change keeps no old versions, so a resourceVersion asked of its watch is refused',
      condition: ({ input: [asked, follows], output }) =>
        !asks(asked) || follows || (output.kind === 'refused' && output.reason === 'not-followed'),
    },
    theFeedsListStartsAtTheByteAsked: {
      description: 'A watch of a list of the feed’s lines asked a byte starts there and sends no state',
      condition: ({ input: [asked, follows, byte], output }) =>
        !asks(asked) || !follows || byte === undefined || (output.kind === 'from' && output.cursor === byte),
    },
    aWordThatIsNoByteIsRefused: {
      description: 'A resourceVersion that names no byte of the feed is refused before anything is read',
      condition: ({ input: [asked, follows, byte], output }) =>
        !asks(asked) || !follows || byte !== undefined || (output.kind === 'refused' && output.reason === 'not-a-cursor'),
    },
  },
});

/** `watchStartOf`'s type, which `src/watch/watch.ts` takes. */
export type WatchStartOf = Implementation<typeof watchStartSpec>;
