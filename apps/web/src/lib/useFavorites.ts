/**
 * The favourites this browser keeps, for every component of this page that reads or stars them: read from local storage, written to it,
 * and read again when this page or another of this browser changes them. Where storage is refused, nothing is starred, and a star pressed
 * lasts as long as the page does.
 */
import { useSyncExternalStore } from 'react';
import { FAVORITES_KEY, favoritesOf, isStarred, toggled, type Favorite } from './favorites.ts';

/** What this page last wrote, read before storage, which may have refused it; undefined once another page of this browser wrote since. */
let written: string | undefined;

/** Each component of this page that reads the favourites, told of a star pressed here, which no `storage` event tells. */
const readers = new Set<() => void>();

/**
 * Calls `onChange` each time a star is pressed on this page, or another page of this browser changes the favourites or clears what it
 * keeps, which drops what this page wrote; returns what stops it.
 */
export function subscribeFavorites(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== FAVORITES_KEY) return;
    written = undefined;
    onChange();
  };
  readers.add(onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    readers.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The favourites as text: what this page last wrote, else what this browser keeps; none where storage is refused, or where there is no
 * browser to keep anything, a server's render.
 */
export function favoritesText(): string | null {
  if (written !== undefined) return written;
  try {
    return localStorage.getItem(FAVORITES_KEY);
  } catch {
    return null;
  }
}

/**
 * Stars `favorite`, or takes it off when it is starred (`toggled`): kept by this browser, and by this page alone where storage is refused
 * or full; every reader of this page is told.
 */
export function toggleFavorite(favorite: Favorite): void {
  written = JSON.stringify(toggled(favoritesOf(favoritesText()), favorite));
  try {
    localStorage.setItem(FAVORITES_KEY, written);
  } catch {}
  for (const reader of readers) reader();
}

/** The favourites, in the order starred (`favoritesOf`); whether one is starred; and what stars it or takes it off. */
export function useFavorites(): { favorites: Favorite[]; starred: (favorite: Favorite) => boolean; toggle: (favorite: Favorite) => void } {
  const favorites = favoritesOf(useSyncExternalStore(subscribeFavorites, favoritesText, favoritesText));
  return { favorites, starred: (favorite) => isStarred(favorites, favorite), toggle: toggleFavorite };
}

/** Takes `favorite` off where it is starred, as a workflow removed is, and leaves the favourites as they are where it is not. */
export function forgetFavorite(favorite: Favorite): void {
  if (isStarred(favoritesOf(favoritesText()), favorite)) toggleFavorite(favorite);
}
