import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether nothing may move: the person asked their system for reduced motion — or there is no browser to ask, as when a
 * server renders, where nothing is known and so nothing is set moving.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' ? matchMedia(QUERY).matches : true;
}

function subscribe(changed: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia(QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

/** `reducedMotion`, read again when the person changes the setting, with the page open. */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribe, reducedMotion, reducedMotion);
