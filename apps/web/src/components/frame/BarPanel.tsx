/**
 * What the address's `?bar=` names, as the frame's side sheet holds it (`FrameSheet`), in place of Nemia's chat: a panel the sheet's whole
 * height, its title and buttons at its head and its body scrolling under them. Its Close button and Escape close it (`useBar`), and closing
 * it gives the focus back to what held it before, unless the focus had already left it for the page (`focusGoesBack`). Beside Close, its
 * Open button visits the page of what it shows, for everything that has one (`barOpens`), read in the place the page beside it is read
 * in, the address's `factory` and `repo`.
 */
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useSearch } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { barOpens, barValue, escapeDoes, focusGoesBack, type FocusPlace } from '@/lib/bar';
import { pagePlaceOf } from '@/lib/factories';
import { useBar } from '@/lib/useBar';
import { routeLink } from '../nav/routeLink';

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

/** Where the focus stands beside the bar `self`, as `focusGoesBack` reads it. */
const placeOf = (now: Element | null, self: HTMLElement | null): FocusPlace =>
  self?.contains(now) ? 'in' : now === null || now === document.body ? 'nothing' : 'out';

/**
 * Gives `bar` the focus as it opens, and as it closes gives it back to what held it last before it came into the bar — what opened the
 * bar, or what the focus left for the bar since, as a step switched to from its node — while that is still on the page and the bar
 * still holds the focus (`focusGoesBack`). Taking the focus scrolls nothing: the sheet stands sticky beside the page, and a focus that
 * scrolled to it would move the page under a person's eyes. The focus leaving the bar is read as it happens, not where it has landed by the close: a
 * press on the page leaves the focus on nothing, which is where the close must leave it, whenever the close itself lands.
 */
function useFocusReturn(bar: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    let opener = document.activeElement;
    let left = false;
    const self = bar.current;
    const enter = (event: FocusEvent) => {
      left = false;
      if (event.relatedTarget instanceof HTMLElement && !self?.contains(event.relatedTarget)) opener = event.relatedTarget;
    };
    const away = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !self?.contains(event.relatedTarget)) left = true;
    };
    self?.addEventListener('focusin', enter);
    self?.addEventListener('focusout', away);
    self?.focus({ preventScroll: true });
    return () => {
      self?.removeEventListener('focusin', enter);
      self?.removeEventListener('focusout', away);
      if (focusGoesBack({ left, now: placeOf(document.activeElement, self) }) && opener instanceof HTMLElement && opener.isConnected)
        opener.focus();
    };
  }, [bar]);
}

/**
 * The bar, titled `title`, with `description` under its title and `children` in a body that scrolls: an `aside` named by its title, which
 * takes the focus as it opens, so Tab reaches what it holds next, and gives it back as it closes (`useFocusReturn`). It carries the address
 * of what it shows (`data-bar`), and an Open button wherever that has a page (`barOpens`), so no bar can leave it out; `actions`, outside
 * its title so they are no part of its name, sit before Open. It draws no frame of its own: the sheet is its frame, and it fills it.
 */
export function BarPanel({
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
  const bar = useRef<HTMLElement>(null);
  const heading = useId();
  useEscape(bar, close);
  useFocusReturn(bar);

  return (
    <aside
      ref={bar}
      aria-labelledby={heading}
      tabIndex={-1}
      data-bar={open ? barValue(open) : undefined}
      className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col text-body-medium text-foreground outline-none"
    >
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
