import { useLayoutEffect, useState, type RefObject } from 'react';
import { sizeOf, type Size } from './frame.ts';

/** No size: a frame not drawn yet, or not drawn. */
const NONE: Size = { width: 0, height: 0 };

/**
 * How big `frame` is drawn, across and down, read before the first paint and again each time it changes size, on either side. A new
 * answer only when the size moved, so a re-render costs nothing. `drawn` is whether the frame is on the page: it is watched again each
 * time that turns true.
 */
export function useFrameSize(frame: RefObject<HTMLElement | null>, drawn: boolean): Size {
  const [size, setSize] = useState(NONE);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () =>
      setSize((was) => {
        const now = sizeOf(el);
        return now.width === was.width && now.height === was.height ? was : now;
      });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame, drawn]);
  return size;
}
