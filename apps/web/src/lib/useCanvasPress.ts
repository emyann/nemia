import type { KeyboardEvent, MouseEvent } from 'react';
import { inspects, type Bar } from './bar.ts';
import { useBar } from './useBar.ts';
import { useSecondClick } from './useSecondClick.ts';

/**
 * What a press on a canvas's nodes does, through the frame's bar (`useBar`), given the bar a node shows (`barFor`, by the node's id) and
 * what its double click opens (`open`). A click, a tap or Enter on a node shows its bar, or closes the bar for the thing it shows
 * (`toggle`); a click on a link or a button in a node does only what that does. A double click on a node calls `open` with it, its first
 * click having shown its bar and its second taken wherever it lands (`useSecondClick`). A click on the pane closes a bar a canvas opened
 * (`inspects`), never the start of a run. Returns what the bar shows (`shown`) and React Flow's handlers.
 */
export function useCanvasPress(barFor: (id: string) => Bar, open: (id: string) => void) {
  const { open: shown, toggle, close } = useBar();
  const pressed = useSecondClick(open);
  const inspect = (id: string) => toggle(barFor(id));
  return {
    shown,
    onNodeClick: (event: MouseEvent, node: { id: string }) => {
      if (event.detail > 1 || (event.target as Element).closest('a, button')) return;
      inspect(node.id);
      pressed(node.id);
    },
    onKeyDown: (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Enter' && target.classList.contains('react-flow__node') && target.dataset.id) inspect(target.dataset.id);
    },
    onPaneClick: () => {
      if (inspects(shown)) close();
    },
  };
}
