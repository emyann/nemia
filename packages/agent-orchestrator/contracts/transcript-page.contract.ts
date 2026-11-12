/**
 * A page of a step's conversation (agent-orchestrator, src/steps/transcript-page.ts, to be written): where `?limit=` or `?last=` cut
 * the `count` events a read holds after its cursor — those of the kinds asked (`?kinds=`), every one where none is — in the order they
 * were said. It answers the events `[from, to)` and whether any is left after them (`more`), which the door answers as the cursor to read
 * on from: the position after the event at `to - 1`, or the engine's own cursor where none is left. `limit` reads the first events after
 * the cursor, `last` the last ones, the one a person reads when a conversation is too long to read whole; asking both is refused, as is
 * either that is no whole number from 1. Asked with neither, a read answers the default page (`bounds.byDefault`); no read answers more
 * than the most (`bounds.most`), whatever it asks. What a cursor carries, and how the kinds are matched, are the door's: a test holds
 * them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A page cut from a conversation, or the refusal of what it was asked with. */
export type TranscriptPageCut =
  | { readonly from: number; readonly to: number; readonly more: boolean }
  | { readonly refused: 'limit' | 'last' | 'both' };

/**
 * What a conversation's page holds at most: `byDefault` events where neither `limit` nor `last` is asked, `most` whatever is asked.
 * Declared here until `objects` holds the api's bounds (`TRANSCRIPT_PAGE`) and the door takes them as this parameter.
 */
export type TranscriptBounds = { readonly byDefault: number; readonly most: number };

/** A count: a whole number from 0, safe in a double, as an array's length and index are. */
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/** Whether a `limit` or a `last` is one a read takes: none, or a whole number from 1. */
const taken = (n: number | null): boolean => n === null || (Number.isInteger(n) && n >= 1);

/** Bounds a read can keep: a default page of at least one event, no larger than the most. */
const boundsTaken = (bounds: TranscriptBounds): boolean =>
  Number.isSafeInteger(bounds.byDefault) && Number.isSafeInteger(bounds.most) && bounds.byDefault >= 1 && bounds.byDefault <= bounds.most;

/** The smaller of two counts. */
const least = (a: number, b: number): number => (a < b ? a : b);

const transcriptCutSpec = spec<
  (count: number, limit: number | null, last: number | null, bounds: TranscriptBounds) => TranscriptPageCut
>({
  requires: ({ input: [n, , , bounds] }) => count(n) && boundsTaken(bounds),
  ensures: {
    refusedBothExactlyWhenBothAsked: {
      description: 'A read asked both the first events (limit) and the last ones (last) is refused, and only such a read is refused so',
      condition: ({ input: [, limit, last], output }) =>
        ('refused' in output && output.refused === 'both') === (limit !== null && last !== null),
    },
    refusedOnABadLimit: {
      description: 'A read asked one limit alone is refused exactly when it is no whole number from 1',
      condition: ({ input: [, limit, last], output }) =>
        last !== null || ('refused' in output && output.refused === 'limit') === !taken(limit),
    },
    refusedOnABadLast: {
      description: 'A read asked one last alone is refused exactly when it is no whole number from 1',
      condition: ({ input: [, limit, last], output }) =>
        limit !== null || ('refused' in output && output.refused === 'last') === !taken(last),
    },
    staysInTheConversation: {
      description: 'A page answers events the read holds, none twice',
      condition: ({ input: [n], output }) => 'refused' in output || (0 <= output.from && output.from <= output.to && output.to <= n),
    },
    noMoreThanTheMost: {
      description: 'No page holds more than the most a read answers, whatever it was asked',
      condition: ({ input: [, , , bounds], output }) => 'refused' in output || output.to - output.from <= bounds.most,
    },
    firstEventsFromTheCursor: {
      description: 'A read that does not ask for the last events starts at the first event after its cursor',
      condition: ({ input: [, , last], output }) => 'refused' in output || last !== null || output.from === 0,
    },
    fullUnlessTheEnd: {
      description:
        'A read from the cursor holds as many events as it asked, or the default where it asked none, up to the most, unless it reaches the last event',
      condition: ({ input: [n, limit, last, bounds], output }) =>
        'refused' in output ||
        last !== null ||
        output.to === n ||
        output.to - output.from === least(limit === null ? bounds.byDefault : limit, bounds.most),
    },
    lastEventsReachTheEnd: {
      description: 'A read of the last events ends at the last event said, and holds as many as it asked, up to the most and to what there is',
      condition: ({ input: [n, , last, bounds], output }) =>
        'refused' in output || last === null || (output.to === n && output.to - output.from === least(least(last, bounds.most), n)),
    },
    moreExactlyWhenEventsAreLeft: {
      description: 'A page says more is to read exactly when events are left after it',
      condition: ({ input: [n], output }) => 'refused' in output || output.more === output.to < n,
    },
  },
});

/** `transcriptCut`'s type, which `src/steps/transcript-page.ts` takes. */
export type TranscriptCut = Implementation<typeof transcriptCutSpec>;
