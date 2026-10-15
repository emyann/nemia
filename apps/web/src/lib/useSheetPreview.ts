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

/** The room a step's card takes across: its frame's 416 pixels, the 12 its box keeps on each side, and the window's 12 at its edge. */
export const CARD_REACH = 452;

/** Where a step's card stands by its rail: beside it, after or before, so that it keeps the window's height. */
export type PreviewSide = 'end top' | 'bottom start';

/**
 * Where the card of a bar opens, clear of every bar of its rail: beside the rail where the window has room for the card on one side of
 * it, and under it, or over it where the window has no room under, where it has none on either.
 */
export const previewSide = (rail: { left: number; right: number }, width: number): PreviewSide =>
  rail.left >= CARD_REACH || width - rail.right >= CARD_REACH ? 'end top' : 'bottom start';

/** The bar whose card is open, by its id, or null when none is. */
let openBar: string | null = null;
const openListeners = new Set<() => void>();

/**
 * Says that the card of the bar `id` opened or closed: a card opened makes it the open one, and a close counts only from the open
 * one, since the card a pointer slid away from closes after the next one opened.
 */
export function cardOpened(id: string, open: boolean): void {
  const next = open ? id : openBar === id ? null : openBar;
  if (next === openBar) return;
  openBar = next;
  for (const listener of openListeners) listener();
}

function subscribeOpen(changed: () => void): () => void {
  openListeners.add(changed);
  return () => openListeners.delete(changed);
}

/** Whether a step's card is open now. */
export const aCardOpen = (): boolean => openBar !== null;

/** `aCardOpen`, read again when a card opens or closes; while one is, the card of another bar opens at once. */
export const useACardOpen = (): boolean => useSyncExternalStore(subscribeOpen, aCardOpen, () => false);
