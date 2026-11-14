/**
 * A step's file opened in the viewer's sheet, kept in the address (`?view=<step>/<file path>`), so the sheet is a place of its own: a
 * link opens it, and Back closes it, since it is opened by a push (`viewOpened`). Validated at the root beside `bar` (`viewSearch`). Pure.
 */

/** The file a sheet shows: the step that has it, and its path in that step's files. */
type ViewedAt = { readonly step: string; readonly path: string };

/** The file `value` names, `<step>/<path>`, split at its first `/` (the path keeps its own); none without a step or a path. */
export function viewOf(value: unknown): ViewedAt | undefined {
  if (typeof value !== 'string') return undefined;
  const slash = value.indexOf('/');
  const step = value.slice(0, slash);
  const path = value.slice(slash + 1);
  return slash > 0 && path ? { step, path } : undefined;
}

/** How `view` is written in the address, which `viewOf` reads back. */
export const viewValue = (view: ViewedAt): string => `${view.step}/${view.path}`;

/** The root route's `view`: a value that names a file, and nothing else. */
export const viewSearch = (search: Record<string, unknown>): { view?: string } =>
  viewOf(search.view) ? { view: search.view as string } : {};

/**
 * The search that opens `view` over the page whose search is `search`, every other key kept: navigated to as a new entry of the history
 * (a push, never `replace`), so Back closes the sheet; and the search that closes it, for a close that is no Back.
 */
export const viewOpened = <S extends object>(search: S, view: ViewedAt): S & { view: string } => ({ ...search, view: viewValue(view) });

export function viewClosed<S extends { view?: string }>(search: S): Omit<S, 'view'> {
  const { view: _view, ...rest } = search;
  return rest;
}
