/**
 * A page of this board named by its whole address, as a message writes it (`/runs/<run>?step=<step>`), cut into what the router's link
 * takes: the path, the search and the hash (`routeOfHref`). A link given the whole address as its `to` takes the query for part of the
 * path, so its preload on hover reads a run whose id holds the `?`.
 */
import { defaultParseSearch } from '@tanstack/react-router';

/** An address cut as the router's link takes it: `to` the path alone, `search` read as the router reads a query, `hash` without its `#`. */
type RouteOfHref = { to: string; search: Record<string, unknown>; hash?: string };

/** Where the address is resolved from: a board address begins with one slash, so nothing of this base is kept. */
const BASE = 'http://board.invalid';

/**
 * `href`, an address of this board (one leading slash), as the router's link takes it: its path as `to`, its query parsed by the
 * router's own `defaultParseSearch` as `search`, and its hash, where it has one. Pure.
 */
export function routeOfHref(href: string): RouteOfHref {
  const url = new URL(href, BASE);
  const hash = url.hash.slice(1);
  return { to: url.pathname, search: defaultParseSearch(url.search), ...(hash ? { hash } : {}) };
}
