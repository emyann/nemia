/**
 * The finished runs a page at a time, without React: the page the address names beside the factory, what Newer and Older lead to, and
 * what the pager says. Page 1 is the bare address, so an address never spells it. Pure.
 */
import { factorySearch } from './factories.ts';

/** What the pager reads of a page of the finished runs: where it stands, and how many rows and pages there are. */
export type PageAt = { page: number; pages: number; total: number; size: number };

/** `value` as a page number past the first: a whole number of 2 or more, given as a number or as digits; none for anything else. */
function pageOf(value: unknown): number | undefined {
  const page = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(page) && page >= 2 ? page : undefined;
}

/**
 * What a page of the finished runs reads of its address: `?factory=` as `factorySearch` reads it, and `?page=` where it names a page
 * past the first. The first page is the address without one.
 */
export function finishedSearch(search: Record<string, unknown>): { factory?: string; page?: number } {
  const page = pageOf(search.page);
  return { ...factorySearch(search), ...(page === undefined ? {} : { page }) };
}

/** The page a search read by `finishedSearch` shows: the one it names, else the first. */
export const pageAt = (search: { page?: number }): number => search.page ?? 1;

/** `prev`, the address's search, at `page`: every other key kept, `page` set past the first and dropped for the first. */
export function pageSearch<S extends Record<string, unknown>>(prev: S, page: number): Omit<S, 'page'> & { page?: number } {
  const { page: _was, ...rest } = prev;
  return page >= 2 ? { ...rest, page } : rest;
}

/** Whether the answer is of a page past the last: the api answers it with no row, and says the pages there are. */
export const pastLast = (at: Pick<PageAt, 'page' | 'pages'>): boolean => at.page > at.pages;

/** The page Newer leads to: the one before, the last from a page past it, and none from the first. */
export function newerOf(page: number, pages: number): number | null {
  if (page <= 1) return null;
  return page > pages ? pages : page - 1;
}

/** The page Older leads to: the one after, and none from the last or past it. */
export const olderOf = (page: number, pages: number): number | null => (page < pages ? page + 1 : null);

/** The rows a page shows, in words: `Runs 19–27 of 634`; that there is none; or, past the last page, that it shows none of them. */
export function rowsSaid(at: PageAt): string {
  if (at.total === 0) return 'No finished runs';
  if (pastLast(at)) return `No run on this page, of ${at.total}`;
  const first = (at.page - 1) * at.size + 1;
  return `Runs ${first}–${Math.min(at.page * at.size, at.total)} of ${at.total}`;
}

/** Where the pager stands, in words: `Page 3 / 71`, or, past the last page, `Page 80 is past the last, 71.` */
export const pageSaid = (at: Pick<PageAt, 'page' | 'pages'>): string =>
  pastLast(at) ? `Page ${at.page} is past the last, ${at.pages}.` : `Page ${at.page} / ${at.pages}`;
