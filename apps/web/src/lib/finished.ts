/**
 * The finished runs a page at a time, without React: the trail of tokens the address holds beside the factory (`older`), each the
 * `continue` of a page that led Older, what Newer and Older lead to, and what the pager says. The first page has no trail, so an
 * address never spells one for it. Pure.
 */

/** What joins the tokens of the trail in the address: no token of the api's holds it. */
const JOIN = '~';

/**
 * What the pager reads of a page of the finished runs: the trail that led to it, the token of the page after it (`next`, null on the
 * last), how many rows it holds, how many finished runs there are, and how many a page holds.
 */
export type PageAt = { trail: readonly string[]; next: string | null; count: number; total: number; size: number };

/** A token of the finished runs' list as the api writes one: `f.`, then base64url. Any other text is no place in that list. */
const TOKEN = /^f\.[A-Za-z0-9_-]+$/;

/**
 * `value` as a trail held in the address: tokens joined by `~`, each shaped as the finished list writes one (`TOKEN`); none for anything
 * else, so a trail that is no token reads as the first page, as a `?page=` that was no number did, and is never sent to be refused.
 */
function olderOf(value: unknown) {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.split(JOIN).every((token) => TOKEN.test(token)) ? value : undefined;
}

/**
 * What a page of the finished runs reads of its address: `?older=` where it holds a trail.
 * The first page is the address without one.
 * @param search The page's search, as the router parsed it.
 */
export function finishedSearch(search: Record<string, unknown>) {
  const older = olderOf(search.older);
  return (older === undefined ? {} : { older }) satisfies { older?: string } as { older?: string };
}

/**
 * The trail a search holds: its tokens in the order they were followed, none for the first page, nor for an `older` that is no trail
 * (`olderOf`): a route's search carries its parent's keys as the address wrote them, unread by `finishedSearch`.
 * @param search The search, by its `older`; absent on the first page.
 */
export const trailOf = (search: { older?: unknown }) => (olderOf(search.older)?.split(JOIN) ?? []) satisfies string[];

/**
 * `prev`, the address's search, at `trail`: every other key kept, `older` set for a trail and dropped for none.
 * @param prev The address's search.
 * @param trail The tokens of the trail to lead to, in the order they were followed; none for the first page.
 */
export function trailSearch<S extends Record<string, unknown>>(prev: S, trail: readonly string[]) {
  const { older: _was, ...rest } = prev;
  return (trail.length > 0 ? { ...rest, older: trail.join(JOIN) } : rest) satisfies Omit<S, 'older'> & { older?: string } as Omit<
    S,
    'older'
  > & { older?: string };
}

/** How many pages `total` rows make, `size` a page: at least one. */
const pagesOf = (at: Pick<PageAt, 'total' | 'size'>) => Math.max(1, Math.ceil(at.total / at.size));

/**
 * Whether the page is past the last: a trail followed to a page that holds no row.
 * @param at The page, by its trail and how many rows it holds.
 */
export const pastLast = (at: Pick<PageAt, 'trail' | 'count'>) => at.trail.length > 0 && at.count === 0;

/**
 * The trail Newer leads to: the trail with its last token taken off, and none from the first page.
 * @param at The page, by its trail.
 */
export const newerOf = (at: Pick<PageAt, 'trail'>) => (at.trail.length === 0 ? null : at.trail.slice(0, -1));

/**
 * The trail Older leads to: the page's own `continue` put on the trail, and none from the last page or past it.
 * @param at The page, by its trail, the token of the page after it (null on the last) and how many rows it holds.
 */
export const olderTrailOf = (at: Pick<PageAt, 'trail' | 'next' | 'count'>) =>
  at.next === null || pastLast(at) ? null : [...at.trail, at.next];

/**
 * The rows a page shows, in words: `Runs 19–27 of 634`; that there is none; or, past the last page, that it shows none of them.
 * @param at The page as the pager reads it.
 */
export function rowsSaid(at: PageAt) {
  if (at.total === 0 && at.count === 0) return 'No finished runs';
  if (pastLast(at)) return `No run on this page, of ${at.total}`;
  const first = at.trail.length * at.size + 1;
  return `Runs ${first}–${first + at.count - 1} of ${at.total}`;
}

/**
 * Where the pager stands, in words: `Page 3 / 71`, or, past the last page, `Page 80 is past the last, 71.`
 * @param at The page as the pager reads it.
 */
export function pageSaid(at: PageAt) {
  const page = at.trail.length + 1;
  return pastLast(at) ? `Page ${page} is past the last, ${pagesOf(at)}.` : `Page ${page} / ${Math.max(page, pagesOf(at))}`;
}
