/**
 * A step's file opened in the viewer's sheet, kept in the address (`?view=<step>/<file path>`), so the sheet is a place of its own: a
 * link opens it, and Back closes it, since it is opened by a push (`viewOpened`). Validated at the root beside `bar` (`viewSearch`). Pure.
 */

/** The file a sheet shows: the step that has it, and its path in that step's files. */
type ViewedAt = { readonly step: string; readonly path: string };

/**
 * The file `value` names, `<step>/<path>`, split at its first `/` (the path keeps its own); none without a step or a path.
 * @param value The address's `view` value, as the router hands it.
 */
export function viewOf(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const slash = value.indexOf('/');
  const step = value.slice(0, slash);
  const path = value.slice(slash + 1);
  return slash > 0 && path ? { step, path } : undefined;
}

/**
 * How `view` is written in the address, which `viewOf` reads back.
 * @param view The file the sheet shows.
 */
export const viewValue = (view: ViewedAt) => `${view.step}/${view.path}`;

/**
 * The root route's `view`: a value that names a file, and nothing else.
 * @param search The root route's search, as the router hands it.
 */
export const viewSearch = (search: Record<string, unknown>) =>
  (viewOf(search.view) ? { view: search.view as string } : {}) satisfies { view?: string } as { view?: string };

/**
 * The search that opens `view` over the page whose search is `search`, every other key kept: navigated to as a new entry of the history
 * (a push, never `replace`), so Back closes the sheet; and the search that closes it, for a close that is no Back.
 * @param search The page's search.
 * @param view The file to open.
 */
export const viewOpened = <S extends object>(search: S, view: ViewedAt) => ({ ...search, view: viewValue(view) });

/**
 * The search that closes the sheet, for a close that is no Back: `search` without its `view`, every other key kept.
 * @param search The page's search.
 */
export function viewClosed<S extends { view?: string }>(search: S) {
  const { view: _view, ...rest } = search;
  return rest;
}
