import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/** Calls `onChange` on each change of the narrow-screen media query, and returns what stops it. */
const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
const isNarrow = () => window.innerWidth < MOBILE_BREAKPOINT;

/** Whether the window is narrower than a tablet, read as an outside store: the first render already has it, and a change re-renders. */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, isNarrow, () => false);
}
