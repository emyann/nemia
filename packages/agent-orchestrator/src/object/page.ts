/**
 * A list's page, as `?limit=` and `?continue=` cut it (`listPage`, proved by contracts/list-page.contract.ts), and what its laws leave to
 * the door: the `continue` token, the base64url of the last name a page answered (`continueToken`), read back to that name and refused
 * `Invalid` where it does not decode (`continuedAfter`); and where the next page starts, at the first name after the token's in the list's
 * order (`pageOf`), so an object dropped between two pages skips none after it. Pure.
 */
import { LIST_PAGE, type PageBounds } from 'objects';
import type { ListPage } from '../../contracts/list-page.contract.ts';
import { Invalid } from '../refusal/refusal.ts';

/** Whether `limit` is one a list takes: none, or a whole number from 1. */
const limitTaken = (limit: number | null): boolean => limit === null || (Number.isInteger(limit) && limit >= 1);

/**
 * The page of `total` objects read from `start` with at most `limit` of them — `bounds.byDefault` where no `limit` is asked, and never
 * more than `bounds.most` — or the refusal of a `limit` that is no whole number from 1. The size is compared with what is left before
 * it is added, so the sum is taken only below `total`, where it is exact.
 */
export const listPage: ListPage = (total, start, limit, bounds) => {
  if (!limitTaken(limit)) return { refused: 'limit' };
  const asked = limit === null ? bounds.byDefault : limit;
  const size = asked < bounds.most ? asked : bounds.most;
  const to = size >= total - start ? total : start + size;
  return { from: start, to, remainingItemCount: total - to, more: to < total };
};

/**
 * How many objects a page asked with `limit` holds where the list has more than that left — the limit or `bounds.byDefault`, never past
 * `bounds.most` — or undefined for a `limit` `listPage` refuses: the page `listPage` cuts of a list longer than any page, so a reader that
 * stops once it holds one object more than this knows whether a next page is there, and reads no further.
 */
export const pageSizeOf = (limit: number | null, bounds: PageBounds): number | undefined => {
  const cut = listPage(Number.MAX_SAFE_INTEGER, 0, limit, bounds);
  return 'refused' in cut ? undefined : cut.to;
};

/** The `continue` token that asks for the objects after `name`: its UTF-8 in base64url, with no padding. */
export const continueToken = (name: string): string => Buffer.from(name, 'utf8').toString('base64url');

/** The token's refusal: it names the fix. */
const badToken = (token: string): Invalid =>
  new Invalid({
    message: `continue ${JSON.stringify(token)} is no token of this list: pass the continue a page's metadata answered, as it is, or leave continue out to read from the first object`,
  });

/**
 * The name `token` was made of (`continueToken`), or `Invalid` where it is not one: a letter out of base64url, or bytes that are no
 * UTF-8.
 */
export const continuedAfter = (token: string): string | Invalid => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return badToken(token);
  const name = Buffer.from(token, 'base64url').toString('utf8');
  return name !== '' && continueToken(name) === token ? name : badToken(token);
};

/**
 * What `?limit=` and `?continue=` ask of a list: at most `limit` objects (null for the default page), after the name the token carries.
 */
export type PageAsked = { readonly limit: number | null; readonly continue?: string | undefined };

/** A page of a list: its objects, how many are after them, and the token of the next page, absent on the last. */
export type Paged<T> = { readonly items: readonly T[]; readonly remainingItemCount: number; readonly continue?: string };

/** The `limit`'s refusal: it names the fix. */
export const badLimit = (limit: number | null): Invalid =>
  new Invalid({
    message: `limit ${String(limit)} is no whole number from 1: pass ?limit=<n>, n from 1, or leave limit out for the default page`,
  });

/**
 * The page `asked` cuts of `sorted`, a list in its order by name (`nameOf`): it starts at the first object whose name is after the token's,
 * so the next page holds what followed the last one answered though that one is gone, and is cut by `listPage` within `bounds` (a list's,
 * `LIST_PAGE`, unless a test shortens them). `Invalid` for a limit `listPage` refuses or a token that does not decode.
 */
export const pageOf = <T>(
  sorted: readonly T[],
  nameOf: (item: T) => string,
  asked: PageAsked,
  bounds: PageBounds = LIST_PAGE,
): Paged<T> | Invalid => {
  const after = asked.continue === undefined ? undefined : continuedAfter(asked.continue);
  if (after instanceof Invalid) return after;
  const found = after === undefined ? 0 : sorted.findIndex((item) => nameOf(item) > after);
  const start = found === -1 ? sorted.length : found;
  const cut = listPage(sorted.length, start, asked.limit, bounds);
  if ('refused' in cut) return badLimit(asked.limit);
  const items = sorted.slice(cut.from, cut.to);
  const last = items.at(-1);
  return {
    items,
    remainingItemCount: cut.remainingItemCount,
    ...(cut.more && last !== undefined ? { continue: continueToken(nameOf(last)) } : {}),
  };
};
