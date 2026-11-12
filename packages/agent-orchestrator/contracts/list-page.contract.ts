/**
 * A list's page (agent-orchestrator, src/object/page.ts): where `?limit=` and `?continue=` cut a list of `total` objects in
 * its order, read from `start` — the first object after the one the `continue` token names, 0 where none is given. It answers the
 * objects `[from, to)`, how many are left after them (`remainingItemCount`), and whether a next page is there (`more`, which the door
 * answers as a `continue` token naming the object at `to - 1`). A `limit` that is no whole number from 1 is refused, the door's
 * `Invalid`. A list asked with no `limit` answers its default page (`bounds.byDefault`), and none answers more than its most
 * (`bounds.most`), whatever `limit` asks, as Kubernetes' server may answer fewer than a `limit` asks, with a `continue`. What a token
 * carries, and where `start` is found when the object it names is gone, are the door's: a test holds them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A page cut from a list, or the refusal of its `limit`. Declared here until `src/object/page.ts` holds it. */
export type PageCut =
  | { readonly from: number; readonly to: number; readonly remainingItemCount: number; readonly more: boolean }
  | { readonly refused: 'limit' };

/**
 * What a list answers at most: `byDefault` objects where no `limit` is asked, and `most` whatever is asked. Declared here until
 * `objects` holds the api's bounds (`LIST_PAGE`) and `src/object/page.ts` takes them as this parameter, so a test shortens them.
 */
export type PageBounds = { readonly byDefault: number; readonly most: number };

/** A count: a whole number from 0, safe in a double, as an array's length and index are. */
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/** Whether `?limit=` is one a list takes: none, or a whole number from 1. */
const limitTaken = (limit: number | null): boolean => limit === null || (Number.isInteger(limit) && limit >= 1);

/** Bounds a list can keep: a default page of at least one object, no larger than the most. */
const boundsTaken = (bounds: PageBounds): boolean =>
  Number.isSafeInteger(bounds.byDefault) && Number.isSafeInteger(bounds.most) && bounds.byDefault >= 1 && bounds.byDefault <= bounds.most;

/** How many objects a page asked with `limit` holds when the list has that many left: the limit or the default, never past the most. */
const pageSize = (limit: number | null, bounds: PageBounds): number => {
  const asked = limit === null ? bounds.byDefault : limit;
  return asked < bounds.most ? asked : bounds.most;
};

const listPageSpec = spec<(total: number, start: number, limit: number | null, bounds: PageBounds) => PageCut>({
  requires: ({ input: [total, start, , bounds] }) => count(total) && count(start) && start <= total && boundsTaken(bounds),
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
    noMoreThanTheMost: {
      description: 'No page holds more than the most a list answers, whatever limit it was asked with',
      condition: ({ input: [, , , bounds], output }) => 'refused' in output || output.to - output.from <= bounds.most,
    },
    theDefaultPageWhenNoLimit: {
      description: 'A page asked with no limit holds at most the default page of objects',
      condition: ({ input: [, , limit, bounds], output }) =>
        'refused' in output || limit !== null || output.to - output.from <= bounds.byDefault,
    },
    fullUnlessTheLast: {
      description:
        'A page holds as many objects as it was asked, or the default where none was asked, up to the most, unless it reaches the end of the list',
      condition: ({ input: [total, , limit, bounds], output }) =>
        'refused' in output || output.to === total || output.to - output.from === pageSize(limit, bounds),
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
