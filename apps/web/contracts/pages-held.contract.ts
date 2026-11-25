/**
 * Whether the pages of a run of the e2e are held, and to what (apps/web, `test/e2e/timing.ts`, `pagesHeld`, read by `overBound` and
 * `pagesLine`, which `run.ts` and `pages-bound.ts` call): only a whole run, every page in the dark theme as a check runs it, is held,
 * and it is allowed the time a visit is held to once for each page it visited, so a page added is room added rather than a slowdown; it
 * is refused exactly when its visits cost more than that, summed. A run of some pages, a shard of a run or a run that pictures them is
 * held to nothing, however long it takes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a run of the e2e read of its pages: whether it is a whole run, how many page visits it made, and what they cost, summed. */
export type PagesRead = { readonly whole: boolean; readonly visits: number; readonly summedMs: number };

/**
 * Whether the pages are held: `unheld` for a run of some pages; for a whole run, `within` or `over` what it is allowed, `allowedMs`,
 * the bound a visit is held to once for each visit.
 */
export type PagesHeld =
  | { readonly kind: 'unheld' }
  | { readonly kind: 'within'; readonly allowedMs: number }
  | { readonly kind: 'over'; readonly allowedMs: number };

/** The most visits a run reads: far above the pages the e2e has, and low enough that a visit's bound times them is exact. */
const MOST_VISITS = 100_000;

/** The longest bound a visit may be held to: ten minutes, a step's whole tool. */
const LONGEST_VISIT_MS = 600_000;

/** What `read`'s visits are allowed at `visitBoundMs` each. */
const allowedOf = (read: PagesRead, visitBoundMs: number) => read.visits * visitBoundMs;

const pagesHeldSpec = spec<(read: PagesRead, visitBoundMs: number) => PagesHeld>({
  requires: ({ input: [read, visitBoundMs] }) =>
    Number.isInteger(read.visits) &&
    read.visits >= 0 &&
    read.visits <= MOST_VISITS &&
    Number.isFinite(read.summedMs) &&
    read.summedMs >= 0 &&
    (read.visits > 0 || read.summedMs === 0) &&
    Number.isInteger(visitBoundMs) &&
    visitBoundMs >= 1 &&
    visitBoundMs <= LONGEST_VISIT_MS,
  ensures: {
    onlyAWholeRunHeld: {
      description: 'A run of some pages, a shard or one that pictures them, is held to no bound, and a whole run always is',
      condition: ({ input: [read], output }) => (output.kind === 'unheld') === !read.whole,
    },
    allowedByItsVisits: {
      description: 'A whole run is allowed the bound a visit is held to once for each page it visited, so a page added is room added',
      condition: ({ input: [read, visitBoundMs], output }) =>
        output.kind === 'unheld' || output.allowedMs === allowedOf(read, visitBoundMs),
    },
    overExactlyPastAllowed: {
      description: 'A whole run is refused exactly when its visits cost more than it is allowed, summed: one at it passes',
      condition: ({ input: [read, visitBoundMs], output }) =>
        !read.whole || (output.kind === 'over') === read.summedMs > allowedOf(read, visitBoundMs),
    },
  },
});
export type PagesHeldOf = Implementation<typeof pagesHeldSpec>;
