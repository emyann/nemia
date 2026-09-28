import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// The media query read as React reads an outside store, so the first render already has it and a change re-renders.
const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
const isNarrow = () => window.innerWidth < MOBILE_BREAKPOINT;

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, isNarrow, () => false);
}
