import { useSyncExternalStore } from 'react';

/** Where a step's preview opens as a sheet: no pointer that hovers, or a window narrower than Material's compact class ends (600). */
export const SHEET_QUERY = '(hover: none), (max-width: 599px)';

/** Whether a preview opens as a sheet now; false where there is no browser to ask, as when a server renders. */
function sheetNow(): boolean {
  return typeof matchMedia === 'function' ? matchMedia(SHEET_QUERY).matches : false;
}

function subscribe(changed: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia(SHEET_QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

/** `sheetNow`, read again when the window or the pointer changes, with the page open. */
export const useSheetPreview = (): boolean => useSyncExternalStore(subscribe, sheetNow, () => false);
