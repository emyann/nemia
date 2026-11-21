/**
 * A page of a check's output (agent-orchestrator, src/check-output/check-output.ts): where `?from=`, `?limit=` and `?last=` cut the
 * `count` lines a read holds — every line of the stream asked, or only those `?match=` finds, in the order they were printed. It answers
 * the lines `[from, to)` and whether any is left after them (`more`), which the door answers as `next`, the line number to read on from.
 * `start` is where `?from=` puts the page: the index of the first held line at or after the line number asked (null where none was
 * asked). `limit` reads on from there, `last` reads the last lines, the end a person reads first when a check fails; asking `last`
 * together with `limit` or `from` is refused, as is a `limit` or a `last` that is no whole number from 1. Asked with neither count, a
 * read answers the default page (`bounds.byDefault`); no read answers more than the most (`bounds.most`), whatever it asks. How lines are
 * numbered and matched, and how `from` is read into `start`, are the door's: a test holds them.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { PageBounds } from 'objects';

/** A page cut from a check's output, or the refusal of what it was asked with. */
export type CheckOutputPage =
  | { readonly from: number; readonly to: number; readonly more: boolean }
  | { readonly refused: 'limit' | 'last' | 'both' };

/** A count: a whole number from 0, safe in a double, as an array's length and index are. */
const count = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Whether a `limit` or a `last` is one a read takes: none, or a whole number from 1. */
const taken = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1);

/** Bounds a read can keep: a default page of at least one line, no larger than the most. */
const boundsTaken = (bounds: PageBounds) =>
  Number.isSafeInteger(bounds.byDefault) && Number.isSafeInteger(bounds.most) && bounds.byDefault >= 1 && bounds.byDefault <= bounds.most;

/** Whether a read asked the last lines together with a place to start or a count from it, which read from two ends. */
const bothAsked = (start: number | null, limit: number | null, last: number | null) => last !== null && (limit !== null || start !== null);

/** The smaller of two counts. */
const least = (a: number, b: number) => (a < b ? a : b);

const checkOutputCutSpec = spec<
  (count: number, start: number | null, limit: number | null, last: number | null, bounds: PageBounds) => CheckOutputPage
>({
  requires: ({ input: [n, start, , , bounds] }) =>
    count(n) && boundsTaken(bounds) && (start === null || (Number.isSafeInteger(start) && start >= 0 && start <= n)),
  ensures: {
    refusedExactlyWhenAskedWrong: {
      description:
        'A read is refused exactly when it asks the last lines with a start or a limit, or a limit or a last that is no whole number from 1',
      condition: ({ input: [, start, limit, last], output }) =>
        'refused' in output === (bothAsked(start, limit, last) || !taken(limit) || !taken(last)),
    },
    refusedBothExactlyWhenBothAsked: {
      description: 'A read that asks the last lines together with a start or a limit is refused as both, and only such a read',
      condition: ({ input: [, start, limit, last], output }) =>
        ('refused' in output && output.refused === 'both') === bothAsked(start, limit, last),
    },
    refusedOnABadLimit: {
      description: 'A read that asks from one end only, with a limit that is no whole number from 1, is refused for its limit',
      condition: ({ input: [, start, limit, last], output }) =>
        bothAsked(start, limit, last) || taken(limit) || ('refused' in output && output.refused === 'limit'),
    },
    refusedOnABadLast: {
      description: 'A read that asks from one end only, with a last that is no whole number from 1, is refused for its last',
      condition: ({ input: [, start, limit, last], output }) =>
        bothAsked(start, limit, last) || taken(last) || ('refused' in output && output.refused === 'last'),
    },
    staysInTheOutput: {
      description: 'A page answers lines the read holds, none twice',
      condition: ({ input: [n], output }) => 'refused' in output || (0 <= output.from && output.from <= output.to && output.to <= n),
    },
    noMoreThanTheMost: {
      description: 'No page holds more lines than the most a read answers, whatever it was asked',
      condition: ({ input: [, , , , bounds], output }) => 'refused' in output || output.to - output.from <= bounds.most,
    },
    startsWhereAsked: {
      description: 'A read that does not ask for the last lines starts at the line its from points to, or at the first line where none',
      condition: ({ input: [, start, , last], output }) => 'refused' in output || last !== null || output.from === (start ?? 0),
    },
    fullUnlessTheEnd: {
      description:
        'A read from a start holds as many lines as it asked, or the default where it asked none, up to the most, unless it reaches the last line',
      condition: ({ input: [n, , limit, last, bounds], output }) =>
        'refused' in output ||
        last !== null ||
        output.to === n ||
        output.to - output.from === least(limit === null ? bounds.byDefault : limit, bounds.most),
    },
    lastLinesReachTheEnd: {
      description:
        'A read of the last lines ends at the last line held, and holds as many as it asked, up to the most and to what there is',
      condition: ({ input: [n, , , last, bounds], output }) =>
        'refused' in output || last === null || (output.to === n && output.to - output.from === least(least(last, bounds.most), n)),
    },
    moreExactlyWhenLinesAreLeft: {
      description: 'A page says more is to read exactly when lines are left after it',
      condition: ({ input: [n], output }) => 'refused' in output || output.more === output.to < n,
    },
  },
});

/** `checkOutputCut`'s type, which `src/check-output/check-output.ts` takes. */
export type CheckOutputCut = Implementation<typeof checkOutputCutSpec>;
