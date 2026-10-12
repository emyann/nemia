/**
 * The frame's floating bar: a panel at the right of every page, between the header and the bottom bar, over the page, so the page keeps its
 * whole width and the bottom bar stays in view. It is as wide as this browser keeps it (`useBarWidth`), resized by dragging its left edge
 * or with the arrow keys on it, and the whole width of a narrow screen. Its Close button and Escape close it (`useBar`), and closing it
 * gives the focus back to what held it before. Beside Close, its Open button visits the page of what it shows, for everything that has one
 * (`barOpens`), read in the place the page under it is read in, the address's `factory` and `repo`.
 */
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { useSearch } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { BAR_MIN, BAR_STEP, barOpens, barValue, escapeDoes } from '@/lib/bar';
import { pagePlaceOf } from '@/lib/factories';
import { useBar, useBarWidth } from '@/lib/useBar';
import { routeLink } from './routeLink';

const RouterLinkButton = routeLink(LinkButton);

/** The text of `target` when it is a field a person types in, else null. */
function fieldTextOf(target: EventTarget | null): string | null {
  if (target instanceof HTMLTextAreaElement) return target.value;
  if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type)) return target.value;
  return null;
}

/** Leaves `field`: for the bar `bar` when the field is in it, else for nothing, so the focus stays out of the bar. */
function leave(field: EventTarget | null, bar: HTMLElement | null): void {
  if (bar && field instanceof Node && bar.contains(field)) bar.focus();
  else if (field instanceof HTMLElement) field.blur();
}

/**
 * Closes the bar on Escape pressed anywhere on the page while it is open, unless a menu or a modal took the key (`escapeDoes`); in a field
 * that holds text the key leaves the field instead (`leave`), and a second Escape closes it.
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
      if (does === 'leave') leave(event.target, bar.current);
      if (does === 'close') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bar, close]);
}

/**
 * Gives `bar` the focus as it opens, and as it closes gives it back to what held it last before it came into the bar — what opened the
 * bar, or what the focus left for the bar since, as a step switched to from its node — while that is still on the page and the focus is
 * still in the bar or on nothing: not when a link to another page or a press on the page took it.
 */
function useFocusReturn(bar: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    let opener = document.activeElement;
    const self = bar.current;
    const enter = (event: FocusEvent) => {
      if (event.relatedTarget instanceof HTMLElement && !self?.contains(event.relatedTarget)) opener = event.relatedTarget;
    };
    self?.addEventListener('focusin', enter);
    self?.focus();
    return () => {
      self?.removeEventListener('focusin', enter);
      const now = document.activeElement;
      const held = now === null || now === document.body || (self?.contains(now) ?? false);
      if (held && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [bar]);
}

/**
 * The bar's left edge, a separator a person drags, or moves with the arrow keys once focused, to set the bar's width `width` (`onWidth`),
 * between `BAR_MIN` and `most`: the bar ends where the pointer is.
 */
function ResizeEdge({ width, most, onWidth }: { width: number; most: number; onWidth: (width: number) => void }) {
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
      aria-valuemax={Math.round(most)}
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
 * takes the focus as it opens, so Tab reaches what it holds next, and gives it back as it closes (`useFocusReturn`). It carries the address
 * of what it shows (`data-bar`), and an Open button wherever that has a page (`barOpens`), so no bar can leave it out; `actions`, outside
 * its title so they are no part of its name, sit before Open.
 */
export function FloatingBar({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { open, close } = useBar();
  const place = pagePlaceOf(useSearch({ strict: false }));
  const page = open ? barOpens(open, place) : null;
  const [width, setWidth, most] = useBarWidth();
  const narrow = useIsMobile();
  const bar = useRef<HTMLElement>(null);
  const heading = useId();
  useEscape(bar, close);
  useFocusReturn(bar);

  return (
    <aside
      ref={bar}
      aria-labelledby={heading}
      tabIndex={-1}
      data-floating-bar
      data-bar={open ? barValue(open) : undefined}
      style={narrow ? undefined : { width }}
      className={`fixed top-12 right-0 bottom-8 z-40 flex flex-col bg-popover text-body-medium text-popover-foreground shadow-lg outline-none ${narrow ? 'left-0' : 'border-l'}`}
    >
      {!narrow && <ResizeEdge width={width} most={most} onWidth={setWidth} />}
      <div className="flex items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id={heading} className="font-heading text-title-medium text-foreground">
            {title}
          </h2>
          {description && <div className="text-muted-foreground">{description}</div>}
        </div>
        {actions}
        {page && (
          <RouterLinkButton {...page} variant="outline" size="sm" className="-mt-0.5 shrink-0">
            Open
          </RouterLinkButton>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Close" onPress={close} className="-mt-1 -mr-1 shrink-0">
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
