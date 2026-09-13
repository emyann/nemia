import { useEffect, useState } from 'react';

/**
 * The time, read again every `everyMs`.
 *
 * For a clock on the page that has to move between refetches: a refetch that brings back the same
 * run re-renders nothing, so a running step's elapsed time would otherwise stand still.
 */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
