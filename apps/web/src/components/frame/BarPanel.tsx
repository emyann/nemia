/**
 * What the address's `?bar=` names, as the frame's side sheet holds it (`FrameSheet`), in place of Nemia's chat: a panel the sheet's whole
 * height, its title and buttons at its head and its body scrolling under them. Its Close button and Escape close it (`useBar`), and closing
 * it gives the focus back to what held it before, unless the focus had already left it for the page (`focusGoesBack`). Beside Close, its
 * Open visits the page of what it shows, for everything that has one (`barOpens`), read in the place the page beside it is read in, the
 * address's `factory` and `repo`: a button of its own, or the first item of the bar's ⋯ menu where the bar has one.
 */
import { usePagePlace } from '@/components/nav/useSeat';
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Ellipsis, XIcon } from 'lucide-react';
import { Button, IconButton, Menu } from '@/components/ui/ds';
import { CutFrame, type FrameHue } from '@/components/look';
import { barOpens, barValue, escapeDoes, focusGoesBack } from '@/lib/bar';
import { useBar } from '@/lib/useBar';
import { cn } from '@/lib/utils';
import { routeLink } from '../nav/routeLink';

const RouterLinkButton = routeLink(Button);

/** The text of `target` when it is a field a person types in, else null. */
function fieldTextOf(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) return target.value;
  if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type)) return target.value;
  return null;
}

/** Leaves `field`: for the bar `bar` when the field is in it, else for nothing, so the focus stays out of the bar. */
function leave(field: EventTarget | null, bar: HTMLElement | null) {
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
const placeOf = (now: Element | null, self: HTMLElement | null) =>
  self?.contains(now) ? 'in' : now === null || now === document.body ? 'nothing' : 'out';

/**
 * Gives `bar` the focus as it opens, and as it closes gives it back to what held it last before it came into the bar — what opened the bar,
 * or what the focus left for the bar since, as a step switched to from its node — while that is still on the page and the bar still holds
 * the focus (`focusGoesBack`). Taking the focus scrolls nothing: the sheet stands beside the page's column,
 * outside what scrolls, and a focus that scrolled to it
 * would move the page under a person's eyes. The focus leaving the bar is read as it happens, not where it has ended up by the close: a
 * press
 * on the page leaves the focus on nothing, which is where the close must leave it, whenever the close itself lands.
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

/** An item of a bar's ⋯ menu after its Open: its id, the words it says, and what pressing it does. */
type BarItem = { id: string; label: string; onAction: () => void };

/** Where the bar fills the sheet: over the sheet's own padding, its whole height. */
const FILLS = '-m-4 h-[calc(100%+2rem)]';

/**
 * The bar, titled `title`, with `description` under its title and `children` in a body that scrolls: an `aside` named by its title, which
 * takes the focus as it opens, so Tab reaches what it holds next, and gives it back as it closes (`useFocusReturn`). It carries the address
 * of what it shows (`data-bar`), and an Open wherever that has a page (`barOpens`), so no bar can leave it out; `actions`, outside its
 * title so they are no part of its name, sit before Open. With `more`, Open is the first item of a ⋯ menu and the items of `more` follow
 * it, in place of an Open button. It draws no frame of its own, the sheet being its frame, unless it is given `hue`: then the whole bar
 * is the look's cut frame, its grain the bar's ground and its edge in that hue.
 * @param props.title The bar's title, which names it.
 * @param props.description What is said under the title.
 * @param props.actions What sits before Open, outside the title.
 * @param props.more The items of the bar's ⋯ menu after its Open.
 * @param props.hue The hue of the bar's cut frame's edge; no frame where it is left out.
 * @param props.children The body, which scrolls.
 */
export function BarPanel({
  title,
  description,
  actions,
  more,
  hue,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  more?: readonly BarItem[];
  hue?: FrameHue;
  children: ReactNode;
}) {
  const { open, close } = useBar();
  const place = usePagePlace();
  const page = open ? barOpens(open, place) : null;
  const navigate = useNavigate();
  const bar = useRef<HTMLElement>(null);
  const heading = useId();
  useEscape(bar, close);
  useFocusReturn(bar);

  const items = more && [...(page ? [{ id: 'open', label: 'Open', onAction: () => void navigate(page) }] : []), ...more];
  const panel = (
    <aside
      ref={bar}
      aria-labelledby={heading}
      tabIndex={-1}
      data-bar={open ? barValue(open) : undefined}
      className={cn('flex min-w-0 flex-col text-body-medium text-on-surface outline-none', hue ? 'h-full' : FILLS)}
    >
      <div className="flex items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id={heading} className="font-heading text-title-medium text-on-surface">
            {title}
          </h2>
          {description && <div className="text-on-surface-variant">{description}</div>}
        </div>
        {actions}
        {items && items.length > 0 && (
          <Menu
            placement="bottom end"
            offset={6}
            items={items}
            triggerButton={
              <IconButton variant="standard" size="xsmall" icon={Ellipsis} aria-label="More actions" data-bar-menu className="shrink-0" />
            }
          />
        )}
        {page && !items && (
          <RouterLinkButton {...page} variant="outlined" size="xsmall" className="shrink-0">
            Open
          </RouterLinkButton>
        )}
        <IconButton variant="standard" size="xsmall" icon={XIcon} aria-label="Close" onPress={close} className="shrink-0" />
      </div>
      <div data-bar-body className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {children}
      </div>
    </aside>
  );
  if (!hue) return panel;
  return (
    <CutFrame hue={hue} size={24} fill className={FILLS}>
      {panel}
    </CutFrame>
  );
}
