/**
 * The frame's floating bar: a panel at the right of every page, below the header, over the page, so the page keeps its whole width. It is
 * as wide as this browser keeps it (`useBarWidth`), resized by dragging its left edge or with the arrow keys on it, and the whole width of
 * a narrow screen. Its Close button and Escape close it (`useBar`).
 */
import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { BAR_MIN, BAR_STEP, escapeDoes } from '@/lib/bar';
import { useBar, useBarWidth } from '@/lib/useBar';

/** The text of `target` when it is a field a person types in, else null. */
function fieldTextOf(target: EventTarget | null): string | null {
  if (target instanceof HTMLTextAreaElement) return target.value;
  if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type)) return target.value;
  return null;
}

/**
 * Closes the bar on Escape pressed anywhere on the page while it is open, unless a menu or a modal took the key (`escapeDoes`); in a field
 * that holds text the key leaves the field for `bar` instead, and a second Escape closes it.
 */
function useEscape(bar: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const does = escapeDoes({
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        fieldText: fieldTextOf(event.target),
      });
      if (does === 'leave') bar.current?.focus();
      if (does === 'close') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bar, close]);
}

/**
 * The bar's left edge, a separator a person drags, or moves with the arrow keys once focused, to set the bar's width `width` (`onWidth`):
 * the bar ends where the pointer is.
 */
function ResizeEdge({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) onWidth(window.innerWidth - event.clientX);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onWidth(width + BAR_STEP);
    else if (event.key === 'ArrowRight') onWidth(width - BAR_STEP);
    else return;
    event.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the bar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={BAR_MIN}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onKeyDown={key}
      className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:w-1 hover:after:bg-ring focus-visible:after:w-1 focus-visible:after:bg-ring"
    />
  );
}

/**
 * The bar, titled `title`, with `description` under its title and `children` in a body that scrolls: an `aside` named by its title, which
 * takes the focus as it opens, so Tab reaches what it holds next.
 */
export function FloatingBar({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const { close } = useBar();
  const [width, setWidth] = useBarWidth();
  const narrow = useIsMobile();
  const bar = useRef<HTMLElement>(null);
  const heading = useId();
  useEscape(bar, close);
  useEffect(() => {
    bar.current?.focus();
  }, []);

  return (
    <aside
      ref={bar}
      aria-labelledby={heading}
      tabIndex={-1}
      data-floating-bar
      style={narrow ? undefined : { width }}
      className={`fixed top-12 right-0 bottom-0 z-40 flex flex-col bg-popover text-sm text-popover-foreground shadow-lg outline-none ${narrow ? 'left-0' : 'border-l'}`}
    >
      {!narrow && <ResizeEdge width={width} onWidth={setWidth} />}
      <div className="flex items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id={heading} className="font-heading text-base font-medium text-foreground">
            {title}
          </h2>
          {description && <div className="text-muted-foreground">{description}</div>}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onPress={close} className="-mt-1 -mr-1 shrink-0">
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
