import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the media query `query` matches this window, read as an outside store: the first render already has it, and a change of the
 * window, the pointer or the person's setting renders again. `fallback` where there is no browser to ask, as when a server renders.
 * @param query The CSS media query.
 * @param fallback The answer where there is no browser to ask.
 */
export function useMedia(query: string, fallback: boolean) {
  const subscribe = useCallback(
    (changed: () => void) => {
      if (typeof matchMedia !== 'function') return () => {};
      const list = matchMedia(query);
      list.addEventListener('change', changed);
      return () => list.removeEventListener('change', changed);
    },
    [query],
  );
  const now = useCallback(() => (typeof matchMedia === 'function' ? matchMedia(query).matches : fallback), [query, fallback]);
  return useSyncExternalStore(subscribe, now, now);
}
