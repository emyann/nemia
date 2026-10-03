import { useEffect, useEffectEvent, useRef } from 'react';
import { secondClick } from './canvas.ts';

/**
 * Calls `open` with what a double click's first click pressed, from its second click wherever it lands (`secondClick`): taken before
 * anything under it takes it, and its double click kept from the pane. Returns what a node's first click calls with what it pressed.
 */
export function useSecondClick(open: (pressed: string) => void): (pressed: string) => void {
  const pressed = useRef<string | null>(null);
  const opens = useEffectEvent(open);
  useEffect(() => {
    let opened = false;
    const click = (event: MouseEvent) => {
      const second = secondClick(pressed.current, event.detail);
      pressed.current = null;
      opened = second !== null;
      if (!second) return;
      event.stopPropagation();
      event.preventDefault();
      opens(second);
    };
    const dblclick = (event: MouseEvent) => {
      if (!opened) return;
      opened = false;
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener('click', click, true);
    window.addEventListener('dblclick', dblclick, true);
    return () => {
      window.removeEventListener('click', click, true);
      window.removeEventListener('dblclick', dblclick, true);
    };
  }, []);
  return (one: string) => {
    pressed.current = one;
  };
}
