/**
 * A list's page (agent-orchestrator, src/object/page.ts): where `?limit=` and `?continue=` cut a list of `total` objects in
 * its order, read from `start` — the first object after the one the `continue` token names, 0 where none is given. It answers the
 * objects `[from, to)`, how many are left after them (`remainingItemCount`), and whether a next page is there (`more`, which the door
 * answers as a `continue` token naming the object at `to - 1`). A `limit` that is no whole number from 1 is refused, the door's
 * `Invalid`. What a token carries, and where `start` is found when the object it names is gone, are the door's: a test holds them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A page cut from a list, or the refusal of its `limit`. Declared here until `src/object/page.ts` holds it. */
export type PageCut =
  | { readonly from: number; readonly to: number; readonly remainingItemCount: number; readonly more: boolean }
  | { readonly refused: 'limit' };

/** A count: a whole number from 0, safe in a double, as an array's length and index are. */
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/** Whether `?limit=` is one a list takes: none, or a whole number from 1. */
const limitTaken = (limit: number | null): boolean => limit === null || (Number.isInteger(limit) && limit >= 1);

const listPageSpec = spec<(total: number, start: number, limit: number | null) => PageCut>({
  requires: ({ input: [total, start] }) => count(total) && count(start) && start <= total,
  ensures: {
    refusedExactlyOnABadLimit: {
      description: 'A page is refused exactly when its limit is given and is no whole number from 1',
      condition: ({ input: [, , limit], output }) => 'refused' in output === !limitTaken(limit),
    },
    startsAfterTheContinue: {
      description: 'A page starts at the first object after the one its continue token names',
      condition: ({ input: [, start], output }) => 'refused' in output || output.from === start,
    },
    staysInTheList: {
      description: 'A page answers objects the list holds, none twice',
      condition: ({ input: [total], output }) => 'refused' in output || (output.from <= output.to && output.to <= total),
    },
    noMoreThanTheLimit: {
      description: 'A page holds at most its limit of objects',
      condition: ({ input: [, , limit], output }) => 'refused' in output || limit === null || output.to - output.from <= limit,
    },
    fullUnlessTheLast: {
      description: 'A page holds its whole limit unless it reaches the end of the list; with no limit, it is the rest of the list',
      condition: ({ input: [total, , limit], output }) =>
        'refused' in output || output.to === total || (limit !== null && output.to - output.from === limit),
    },
    remainingCounted: {
      description: 'remainingItemCount is the number of objects after the page',
      condition: ({ input: [total], output }) => 'refused' in output || output.remainingItemCount === total - output.to,
    },
    continuesExactlyWhenObjectsAreLeft: {
      description: 'A next page is offered exactly when objects are left after this one',
      condition: ({ input: [total], output }) => 'refused' in output || output.more === output.to < total,
    },
  },
});

/** `listPage`'s type, which `src/object/page.ts` takes. */
export type ListPage = Implementation<typeof listPageSpec>;
