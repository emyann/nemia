import { useEffect, useState } from 'react';

/**
 * The time, read again every `everyMs`.
 *
 * For a clock on the page that has to move between refetches: a refetch that brings back the same
 * run re-renders nothing. It is read again at once when `everyMs` changes, so the first render at a new
 * pace shows no time older than that pace.
 */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the clock is read again at once when `everyMs` changes
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
