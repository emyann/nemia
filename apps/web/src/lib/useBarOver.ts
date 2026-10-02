import { useLayoutEffect, useState, type RefObject } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { barOver } from './bar.ts';
import { useBar } from './useBar.ts';

/**
 * How many pixels of `frame`'s right side the frame's floating bar covers (`barOver`): none while it is closed or on a narrow screen. Read
 * before the first paint, and again as the bar opens, switches or closes, as the bar or the frame changes size, and as the window does.
 * `frame` is measured whole: what is drawn clear of the bar goes inside it, never `frame` itself, which would then be covered by less.
 */
export function useBarOver(frame: RefObject<HTMLElement | null>): number {
  const { open } = useBar();
  const narrow = useIsMobile();
  const [over, setOver] = useState(0);
  useLayoutEffect(() => {
    const el = frame.current;
    const bar = document.querySelector<HTMLElement>('[data-floating-bar]');
    const read = () =>
      setOver(barOver(el?.getBoundingClientRect().right ?? 0, open && bar ? bar.getBoundingClientRect().left : null, narrow));
    read();
    const observer = new ResizeObserver(read);
    if (el) observer.observe(el);
    if (bar) observer.observe(bar);
    window.addEventListener('resize', read);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [frame, open, narrow]);
  return over;
}
