/** The label selector the board's reads are filtered by: apps/api's `?selector=`, repeated for OR. */

/** The query keys a read sends for `selector`: one `selector=` each, the api reading repeats as OR; none for none. */
const selectorQuery = (selector: string | undefined) =>
  selector === undefined || selector.trim() === '' ? '' : `selector=${encodeURIComponent(selector.trim())}`;

/**
 * `path` with `selector`'s query keys added after its own.
 * @param path The path a read is sent to, its own query included.
 * @param selector A label selector; undefined or blank for none.
 */
export const withSelector = (path: string, selector: string | undefined) => {
  const query = selectorQuery(selector);
  return query === '' ? path : `${path}${path.includes('?') ? '&' : '?'}${query}`;
};

/**
 * A query key's tail for `selector`: an object, which no run's id nor a card's name can be.
 * @param selector A label selector; undefined or blank for none.
 */
export const selectorKey = (selector: string | undefined) =>
  selector === undefined || selector.trim() === '' ? [] : [{ selector: selector.trim() }];
