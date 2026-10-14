"use client";

import * as React from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  useLocale,
} from "react-aria-components";
import { cn, focusRing, tv } from "../utils";

/** Material's six layouts. */
export type CarouselLayout =
  | "multi-browse"
  | "uncontained"
  | "uncontained-multi-aspect-ratio"
  | "hero"
  | "center-aligned-hero"
  | "full-screen";

/** Material's measurements (specs, every layout's table), in pixels. */
const PADDING = 16;
const GAP = 8;
const SMALL_MIN = 40;
const SMALL_MAX = 56;
/** The kit's own: Material leaves the large item's width to the product. */
const DEFAULT_ITEM_WIDTH = 200;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const styles = tv({
  slots: {
    base: "relative w-full",
    scroller: "@container size-full overscroll-x-contain",
    frame: "",
    track: "flex h-full [grid-area:1/1]",
    spacer: "h-full shrink-0 snap-start",
    layer: "",
    item: "shrink-0",
    container: [
      focusRing(),
      "group/carousel-item relative block size-full overflow-hidden rounded-shape-extra-large bg-surface text-on-surface text-start transition-shadow duration-short-4",
      "data-hovered:shadow-elevation-1 data-disabled:cursor-default data-disabled:opacity-38",
    ],
    content: "size-full",
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-on-surface opacity-0 group-data-hovered/carousel-item:state-opacity-hover group-data-focus-visible/carousel-item:state-opacity-focus group-data-pressed/carousel-item:state-opacity-pressed",
    ],
  },
  variants: {
    // `row`: the fixed layouts, and the keyline ones before they are
    // measured or under reduced motion. `keyline`: items placed as the row
    // scrolls. `column`: full-screen.
    mode: {
      row: {
        base: "h-56",
        scroller: "overflow-x-auto overflow-y-hidden",
        frame: "h-full w-max min-w-full",
        layer: "flex h-full gap-2 px-4 py-2",
        item: "h-full w-(--carousel-item-width)",
      },
      keyline: {
        base: "h-56",
        scroller: "overflow-x-auto overflow-y-hidden snap-x snap-mandatory",
        frame: "grid h-full w-max",
        layer: "sticky start-0 h-full overflow-clip [grid-area:1/1]",
        item: "absolute start-0 top-2 bottom-2 will-change-transform",
        content:
          "absolute inset-y-0 left-1/2 w-(--carousel-large) max-w-none -translate-x-1/2",
      },
      column: {
        base: "h-full",
        scroller: "overflow-x-hidden overflow-y-auto snap-y snap-mandatory",
        frame: "h-full w-full",
        layer: "flex h-full flex-col gap-4",
        item: "h-full w-full snap-start snap-always",
        // Edge to edge, the scroller would cut a ring drawn outside.
        container: "rounded-none -outline-offset-3",
      },
    },
    snap: { true: { scroller: "snap-x snap-mandatory" }, false: {} },
    centered: { true: {}, false: {} },
    oneAtATime: { true: { spacer: "snap-always" }, false: {} },
    withOutline: {
      true: {
        container: "border border-outline data-focus-visible:border-on-surface",
      },
    },
  },
  compoundVariants: [
    // A row's snap points, and the padding that centres its first and last
    // items. The keyline track snaps at its own spacers, with no padding.
    { mode: "row", centered: false, class: { scroller: "scroll-ps-4" } },
    {
      mode: "row",
      centered: true,
      class: { layer: "px-[calc(50cqw-var(--carousel-item-width)/2)]" },
    },
    { mode: "row", snap: true, centered: false, class: { item: "snap-start" } },
    { mode: "row", snap: true, centered: true, class: { item: "snap-center" } },
    { mode: "row", oneAtATime: true, class: { item: "snap-always" } },
  ],
});

// ---------------------------------------------------------------------------
// The keyline arithmetic: pure, and the whole of what Material's dynamic
// widths are here.

type Size = "large" | "medium" | "small";

/** The widths a container's keylines take, and their order at rest. */
export type Arrangement = {
  large: number;
  medium: number;
  small: number;
  slots: Size[];
};

type KeylineLayout = "multi-browse" | "hero" | "center-aligned-hero";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The keylines that fill `content` (the container's width less its 16dp
 * padding) exactly, with 8dp between them.
 *
 * - Multi-browse: `[L×k, M, S]`, or `[S, M, L×k, M, S]` centred. Small is
 *   40–56, small ≤ medium ≤ large, large ≤ `preferred`. The large width
 *   closest to `preferred` wins, then the most large items.
 * - Hero: `[L×k, S]`, center-aligned hero `[S, L×k, S]`, small at 56 and
 *   the fewest large items that keep large ≤ `preferred` (unbounded by
 *   default: one large item fills the rest).
 *
 * A container too narrow for any of it is one large item.
 */
export function arrange(
  content: number,
  preferred: number,
  layout: KeylineLayout,
  centered: boolean,
): Arrangement {
  const repeat = (size: Size, n: number) => Array<Size>(n).fill(size);
  if (layout === "multi-browse") {
    const sides = centered ? 2 : 1;
    let best: { k: number; large: number } | null = null;
    for (let k = 1; k * SMALL_MIN <= content; k++) {
      const rest = content - (k + 2 * sides - 1) * GAP;
      // Each side's medium + small is between 80 (40 + 40) and large + 56.
      const lo = (rest - sides * SMALL_MAX) / (k + sides);
      const hi = (rest - sides * 2 * SMALL_MIN) / k;
      const large = Math.min(hi, preferred);
      if (large < lo || large < SMALL_MIN) continue;
      if (
        !best ||
        large > best.large + 0.5 ||
        Math.abs(large - best.large) <= 0.5
      )
        best = { k, large };
    }
    if (!best) return { large: content, medium: 0, small: 0, slots: ["large"] };
    const { k, large } = best;
    const side = (content - (k + 2 * sides - 1) * GAP - k * large) / sides;
    let small = clamp(side / 3, SMALL_MIN, SMALL_MAX);
    if (side - small > large) small = side - large;
    if (side - small < small) small = side / 2;
    const medium = side - small;
    const end: Size[] = ["medium", "small"];
    return {
      large,
      medium,
      small,
      slots: centered
        ? [...[...end].reverse(), ...repeat("large", k), ...end]
        : [...repeat("large", k), ...end],
    };
  }
  const smalls = layout === "center-aligned-hero" ? 2 : 1;
  const small = SMALL_MAX;
  for (let k = 1; ; k++) {
    const large = (content - smalls * small - (k + smalls - 1) * GAP) / k;
    if (large < SMALL_MIN && k > 1) break;
    if (large <= preferred || large < SMALL_MIN) {
      if (large < SMALL_MIN)
        return { large: content, medium: 0, small: 0, slots: ["large"] };
      const ls = repeat("large", k);
      return {
        large,
        medium: 0,
        small,
        slots: smalls === 2 ? ["small", ...ls, "small"] : [...ls, "small"],
      };
    }
  }
  return { large: content, medium: 0, small: 0, slots: ["large"] };
}

/** One snap: the keylines in order, and the item that stands in the first. */
export type SnapState = { slots: Size[]; first: number };

/**
 * Every snap of a row of `count` items, one per item that reaches a large
 * keyline: `count - k + 1` of them, the `j`th with item `j` first in the
 * large ones.
 *
 * Between the ends the arrangement stands as it is, and the row moves one
 * item per snap. Near an end, a keyline on the side that has no item left
 * moves to the other side, among the keylines there by size, so the row
 * stays full and its first and last items reach a large keyline:
 * start-aligned `[L, M, S]` → `[S, L, M]` → `[S, M, L]`, hero `[L, S]` →
 * `[S, L]`; centred `[L, M, M, S, S]` → `[M, L, M, S, S]` → `[S, M, L, M, S]`
 * and on to the mirror at the end.
 */
export function snapStates(
  count: number,
  arrangement: Arrangement,
): SnapState[] {
  const { slots } = arrangement;
  const h = slots.indexOf("large");
  const k = slots.filter((s) => s === "large").length;
  const lead = slots.slice(0, h);
  const trail = slots.slice(h + k);
  const rank: Record<Size, number> = { small: 0, medium: 1, large: 2 };
  const ascending = (a: Size, b: Size) => rank[a] - rank[b];
  return Array.from({ length: Math.max(1, count - k + 1) }, (_, j) => {
    // The items there are before and after the large ones, at most the
    // keylines on that side; the outermost keylines go first.
    const before = Math.min(lead.length, j);
    const after = Math.min(trail.length, Math.max(0, count - k - j));
    const newLead = [
      ...trail.slice(after),
      ...lead.slice(lead.length - before),
    ].sort(ascending);
    const newTrail = [
      ...trail.slice(0, after),
      ...lead.slice(0, lead.length - before),
    ]
      .sort(ascending)
      .reverse();
    return {
      slots: [...newLead, ...slots.slice(h, h + k), ...newTrail],
      first: j - newLead.length,
    };
  });
}

/** Where item `index` stands at a snap, from the container's inline start. */
function place(
  state: SnapState,
  index: number,
  arrangement: Arrangement,
  width: number,
) {
  const anchor = arrangement.small || SMALL_MIN;
  const at = index - state.first;
  if (at < 0) return { x: -anchor, w: anchor };
  if (at >= state.slots.length) return { x: width, w: anchor };
  const widths = state.slots.map((size) => arrangement[size]);
  let x = PADDING;
  for (let s = 0; s < at; s++) x += widths[s]! + GAP;
  return { x, w: widths[at]! };
}

function sizeOf(w: number, a: Arrangement): Size {
  const mid = a.medium || a.small;
  if (w >= (a.large + mid) / 2 - 0.5) return "large";
  if (a.medium > a.small && w >= (a.medium + a.small) / 2) return "medium";
  return "small";
}

// ---------------------------------------------------------------------------

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Reduced motion, from the system; assumed on the server, so the server
    draws the same-size row. */
function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

const TABBABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The tabbable element just before (`forward` false) or after the root. */
function neighbour(root: HTMLElement, forward: boolean) {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(TABBABLE),
  ).filter(
    (el) =>
      !root.contains(el) &&
      !el.contains(root) &&
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest("[inert]") &&
      el.getClientRects().length > 0,
  );
  const side = forward
    ? Node.DOCUMENT_POSITION_FOLLOWING
    : Node.DOCUMENT_POSITION_PRECEDING;
  const found = all.filter((el) => root.compareDocumentPosition(el) & side);
  return forward ? found[0] : found[found.length - 1];
}

type CarouselContextValue = {
  count: number;
  layout: CarouselLayout;
  mode: "row" | "keyline" | "column";
  itemClass: string;
  itemLabel: (index: number, count: number) => string;
  register: (index: number, el: HTMLElement | null) => void;
  onItemFocus: (index: number, el: HTMLElement) => void;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);
const ItemIndexContext = React.createContext(0);

type Labelled =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-labelledby": string; "aria-label"?: string };

type LayoutProps =
  | {
      /** Default `multi-browse`. */
      layout?: "multi-browse";
      alignment?: "start" | "center";
      scrolling?: never;
    }
  | {
      layout: "uncontained";
      alignment?: "start" | "center";
      /** `default` (free, Material's recommendation here) or `snap`. */
      scrolling?: "default" | "snap";
    }
  | {
      layout: "uncontained-multi-aspect-ratio";
      alignment?: never;
      scrolling?: "default" | "snap";
    }
  | {
      layout: "hero" | "center-aligned-hero" | "full-screen";
      alignment?: never;
      scrolling?: never;
    };

export type CarouselProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "children" | "aria-label" | "aria-labelledby" | "aria-roledescription"
> &
  Labelled &
  LayoutProps & {
    /** `CarouselItem`s. */
    children?: React.ReactNode;
    /**
     * The large item's width, in pixels: the most it is in multi-browse
     * (default 200, the kit's own), the most in hero and center-aligned
     * hero (default: the rest of the row), every item's in uncontained
     * (default 200).
     */
    itemWidth?: number;
    /** Each item's name, its place and the total. Default `"3 of 8"`. */
    itemLabel?: (index: number, count: number) => string;
    /** Classes for the root (the region). */
    className?: string;
    /** Classes for the named parts. */
    classNames?: { scroller?: string };
    ref?: React.Ref<HTMLElement>;
  };

/**
 * MD3 carousel: a row of items, mostly visual, in Material's six layouts
 * (`layout`):
 *
 * - `multi-browse`: large, medium and small items at once; snap-scrolling,
 *   many items per swipe.
 * - `uncontained`: items of one width that scroll past the edge; free
 *   scrolling by default, `scrolling="snap"` to snap.
 * - `uncontained-multi-aspect-ratio`: the same, each item as wide as its
 *   `aspectRatio` (9:16 to 16:9) makes it at the row's height.
 * - `hero`: one large item and a small one; one item per swipe.
 * - `center-aligned-hero`: a large item centred between two small ones.
 * - `full-screen`: one item edge to edge, scrolling vertically.
 *
 * `alignment="center"` centres multi-browse (`[S, M, L, M, S]`) and
 * uncontained (each item snaps to the centre).
 *
 * **Dynamic widths.** In multi-browse and both heroes items change size as
 * they move: the row is measured, its keylines arranged to fill it (small
 * 40–56, medium between, large at most `itemWidth`), and each item's place
 * and width interpolated between snaps as it scrolls. The item's content
 * keeps the large width, centred, so a narrowing item uncovers less of it:
 * Material's parallax. The scroll is the browser's own (touch, trackpad,
 * wheel, the scroll bar), over a track of hidden snap points.
 *
 * **Reduced motion**, before the row is measured and on the server, these
 * three are a row of same-size items at the large width that reaches the
 * edge, with hero's next item partly shown: Material's reduced-motion
 * carousel. The row still snaps as its layout does, the heroes one item at
 * a time.
 *
 * **Accessibility.** The root is a `section` named by `aria-label` or
 * `aria-labelledby` (a region, `aria-roledescription="carousel"`), never
 * itself a tab stop. Each item is a `group` named "3 of 8" (`itemLabel`)
 * around a React Aria `Button` or `Link`, named by its content. Tab and
 * Left/Right move between items (mirrored right to left), skipping disabled
 * ones; Up and Down leave for the tabbable element before or after the
 * carousel (full-screen: they move between items); Space and Enter
 * activate. Focus from the keyboard scrolls the item to its place.
 *
 * **Show all is the caller's.** On a page that scrolls vertically Material
 * requires a way to see every item without scrolling sideways: a Show all
 * `Button` 4dp below the carousel, or a 48dp arrow `IconButton` beside its
 * header. Not inside the carousel or beside it.
 *
 * Parts, each with its `data-slot`: on `Carousel`, the root (`carousel`,
 * with `data-layout`) and `scroller` (`carousel-scroller`); on
 * `CarouselItem`, the root (`carousel-item`, with `data-index` and
 * `data-size`: `large`, `medium` or `small`, which item text can follow
 * with `in-data-[size=small]:hidden`), `container`
 * (`carousel-item-container`, the button or link), `content`
 * (`carousel-item-content`) and `stateLayer` (`state-layer`).
 *
 * The kit's own, where Material gives no value: the row's height (224px,
 * `h-56` on the root; full-screen fills its parent), the large width's
 * default (200px), the small item at 56 in the heroes, and multi-browse's
 * pick of the large width closest to `itemWidth` before the most large
 * items. How the keylines move near the ends of the row is the kit's
 * reading of Material's videos, as the pages give no formula: a keyline on
 * the side with no item left moves to the other side, so the row stays full
 * and its first and last items reach a large keyline. A centred carousel
 * therefore starts with its first item large at the start, and centres
 * from the item whose neighbours fill both sides.
 *
 * Deviations, by name:
 * - **Pressed shape**: Material changes a tapped item's shape slightly.
 *   The state layer answers; the shape does not move.
 * - **Ripple**: the state layer, as every kit control.
 * - **Mouse drag**: Material says nothing of dragging with a mouse; the
 *   scroll bar, the wheel and the keyboard are the mouse's paths.
 * - **Full-screen corners**: none, edge to edge, and its focus ring drawn
 *   inside; Material's table gives no corner.
 * - **Uncontained trailing padding**: 16dp at the end too (Material gives
 *   leading padding only), so the last item's focus ring is not cut.
 * - **Disabled with outline**: the whole item at 38 %, its outline with
 *   it, where Material fades the outline to 12 %.
 *
 * Spec: https://m3.material.io/components/carousel/{overview,specs,guidelines,accessibility}
 */
export function Carousel(props: CarouselProps) {
  const {
    children,
    layout = "multi-browse",
    alignment = "start",
    scrolling = "default",
    itemWidth,
    itemLabel = (index, count) => `${index + 1} of ${count}`,
    className,
    classNames,
    style,
    onKeyDown,
    ref,
    ...rest
  } = props;
  const { direction } = useLocale();
  const reduced = useReducedMotion();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const items = React.useRef<(HTMLElement | null)[]>([]);
  const frameRequest = React.useRef(0);

  const list = React.useMemo(
    () => React.Children.toArray(children),
    [children],
  );
  const count = list.length;
  const centered = alignment === "center" || layout === "center-aligned-hero";
  const keylineLayout =
    layout === "multi-browse" ||
    layout === "hero" ||
    layout === "center-aligned-hero";

  // The row's width and direction, measured in the browser.
  const [geometry, setGeometry] = React.useState<{
    width: number;
    rtl: boolean;
  } | null>(null);
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!keylineLayout || !el) return;
    const measure = () => {
      const width = el.clientWidth;
      const rtl = getComputedStyle(el).direction === "rtl";
      setGeometry((g) =>
        g?.width === width && g.rtl === rtl ? g : { width, rtl },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [keylineLayout]);

  const arrangement = React.useMemo(
    () =>
      keylineLayout && geometry
        ? arrange(
            geometry.width - 2 * PADDING,
            itemWidth ??
              (layout === "multi-browse" ? DEFAULT_ITEM_WIDTH : Infinity),
            layout,
            centered,
          )
        : null,
    [keylineLayout, geometry, itemWidth, layout, centered],
  );
  const states = React.useMemo(
    () => (arrangement ? snapStates(count, arrangement) : []),
    [arrangement, count],
  );
  const keyline = !!arrangement && !reduced && geometry!.width > 0;
  const mode =
    layout === "full-screen" ? "column" : keyline ? "keyline" : "row";
  const step = arrangement ? arrangement.large + GAP : 1;

  /** Writes every item's place and width for the scroll position. */
  const frame = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!keyline || !el || !arrangement || !geometry) return;
    const last = states.length - 1;
    const t = clamp(Math.abs(el.scrollLeft) / step, 0, last);
    const j = Math.min(Math.floor(t), last);
    const f = t - j;
    const sign = geometry.rtl ? -1 : 1;
    items.current.forEach((item, i) => {
      if (!item) return;
      const a = place(states[j]!, i, arrangement, geometry.width);
      const b = place(
        states[Math.min(j + 1, last)]!,
        i,
        arrangement,
        geometry.width,
      );
      const x = a.x + (b.x - a.x) * f;
      const w = a.w + (b.w - a.w) * f;
      item.style.transform = `translateX(${sign * x}px)`;
      item.style.width = `${w}px`;
      item.dataset.size = sizeOf(w, arrangement);
    });
  }, [keyline, arrangement, geometry, states, step]);

  React.useLayoutEffect(() => {
    if (!keyline) return;
    frame();
    const placed = items.current;
    return () => {
      cancelAnimationFrame(frameRequest.current);
      frameRequest.current = 0;
      placed.forEach((item) => {
        item?.style.removeProperty("transform");
        item?.style.removeProperty("width");
      });
    };
  }, [keyline, frame]);

  const onScroll = () => {
    if (!keyline || frameRequest.current) return;
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = 0;
      frame();
    });
  };

  /** Scrolls item `index` to its place: a large keyline, or the row's start
      (centre, top). The scroller alone: `scrollIntoView` would move the page. */
  const scrollToItem = React.useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const item = items.current[index];
      if (!scroller || !item) return;
      const behavior: ScrollBehavior = reduced ? "instant" : "smooth";
      const rtl = getComputedStyle(scroller).direction === "rtl";
      if (keyline && arrangement) {
        const now = Math.abs(scroller.scrollLeft) / step;
        let target = -1;
        states.forEach((state, s) => {
          if (state.slots[index - state.first] !== "large") return;
          if (target < 0 || Math.abs(s - now) < Math.abs(target - now))
            target = s;
        });
        if (target >= 0)
          scroller.scrollTo({ left: (rtl ? -1 : 1) * target * step, behavior });
        return;
      }
      const a = item.getBoundingClientRect();
      const b = scroller.getBoundingClientRect();
      if (layout === "full-screen") {
        scroller.scrollTo({
          top: scroller.scrollTop + a.top - b.top,
          behavior,
        });
        return;
      }
      const delta = centered
        ? a.left + a.width / 2 - (b.left + b.width / 2)
        : rtl
          ? a.right - (b.right - PADDING)
          : a.left - (b.left + PADDING);
      scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior });
    },
    [reduced, keyline, arrangement, states, step, layout, centered],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const root = e.currentTarget;
    const all = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-slot="carousel-item-container"]',
      ),
    );
    const at = all.indexOf(
      (e.target as Element).closest<HTMLElement>(
        '[data-slot="carousel-item-container"]',
      )!,
    );
    if (at < 0) return;
    const vertical = layout === "full-screen";
    const rtl = direction === "rtl";
    let by = 0;
    if (e.key === "ArrowRight" && !vertical) by = rtl ? -1 : 1;
    else if (e.key === "ArrowLeft" && !vertical) by = rtl ? 1 : -1;
    else if (e.key === "ArrowDown" && vertical) by = 1;
    else if (e.key === "ArrowUp" && vertical) by = -1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      neighbour(root, e.key === "ArrowDown")?.focus();
      return;
    } else return;
    e.preventDefault();
    for (let i = at + by; i >= 0 && i < all.length; i += by) {
      const next = all[i]!;
      if (next.hasAttribute("data-disabled")) continue;
      next.focus({ preventScroll: true });
      scrollToItem(i);
      return;
    }
  };

  // The keyline layouts snap in every mode: reduced motion, and the first
  // frame before the row is measured, take away the size change and the
  // parallax, not the snapping. The heroes move one item at a time.
  const snap = keylineLayout || scrolling === "snap";
  const oneAtATime = layout === "hero" || layout === "center-aligned-hero";

  const context = React.useMemo<CarouselContextValue>(
    () => ({
      count,
      layout,
      mode,
      itemClass: styles({ mode, snap, centered, oneAtATime }).item(),
      itemLabel,
      register: (index, el) => {
        items.current[index] = el;
      },
      onItemFocus: (index, el) => {
        // Keyboard focus only: a press that scrolled its item away would
        // be cancelled under the pointer.
        let visible = false;
        try {
          visible = el.matches(":focus-visible");
        } catch {
          // A browser without `:focus-visible` scrolls on every focus.
          visible = true;
        }
        if (visible) scrollToItem(index);
      },
    }),
    [count, layout, mode, snap, centered, oneAtATime, itemLabel, scrollToItem],
  );

  const s = styles({ mode, snap, centered, oneAtATime });

  const fallbackWidth =
    arrangement && !(layout !== "multi-browse" && itemWidth === undefined)
      ? `${arrangement.large}px`
      : layout === "hero"
        ? `calc(100cqw - ${2 * PADDING + GAP + SMALL_MAX}px)`
        : layout === "center-aligned-hero"
          ? `calc(100cqw - ${2 * PADDING + 2 * (GAP + SMALL_MAX)}px)`
          : `${itemWidth ?? DEFAULT_ITEM_WIDTH}px`;

  return (
    <section
      {...rest}
      ref={ref}
      aria-roledescription="carousel"
      data-slot="carousel"
      data-layout={layout}
      data-alignment={centered ? "center" : "start"}
      className={s.base({ className })}
      style={
        {
          ...style,
          "--carousel-item-width": fallbackWidth,
          "--carousel-large": arrangement
            ? `${arrangement.large}px`
            : undefined,
        } as React.CSSProperties
      }
      onKeyDown={handleKeyDown}
    >
      <div
        ref={scrollerRef}
        data-slot="carousel-scroller"
        className={s.scroller({ className: classNames?.scroller })}
        onScroll={onScroll}
      >
        <div className={s.frame()}>
          {keyline && geometry ? (
            <div aria-hidden className={s.track()}>
              {states.map((_, i) => (
                <div
                  key={i}
                  className={s.spacer()}
                  style={{
                    width: i === states.length - 1 ? geometry.width : step,
                  }}
                />
              ))}
            </div>
          ) : null}
          <div
            className={s.layer()}
            style={keyline && geometry ? { width: geometry.width } : undefined}
          >
            <CarouselContext.Provider value={context}>
              {list.map((child, index) => (
                <ItemIndexContext.Provider
                  key={
                    React.isValidElement(child) && child.key != null
                      ? child.key
                      : index
                  }
                  value={index}
                >
                  {child}
                </ItemIndexContext.Provider>
              ))}
            </CarouselContext.Provider>
          </div>
        </div>
      </div>
    </section>
  );
}

type CarouselItemBaseProps = {
  /** The item's visual, and its optional brief text. */
  children?: React.ReactNode;
  isDisabled?: boolean;
  /** Material's item with outline: a 1dp `outline`, `on-surface` on focus. */
  withOutline?: boolean;
  /**
   * The item's width over its height, in the uncontained multi-aspect ratio
   * layout only; held between 9/16 and 16/9. Default 1.
   */
  aspectRatio?: number;
  /** The item's name, where its content does not give one. */
  "aria-label"?: string;
  /** Classes for the item's root (the group, which is placed and sized). */
  className?: string;
  /** Classes for the named parts. */
  classNames?: { container?: string; content?: string; stateLayer?: string };
};

export type CarouselItemProps = CarouselItemBaseProps &
  (
    | ({
        href?: never;
        onPress: NonNullable<AriaButtonProps["onPress"]>;
      } & Pick<AriaButtonProps, "onPressStart" | "onPressEnd" | "id">)
    | ({ onPress?: never; href: string } & Pick<
        AriaLinkProps,
        "target" | "rel" | "routerOptions" | "download" | "id"
      >)
  );

/** One item of a `Carousel`: a React Aria `Button` (`onPress`) or `Link`
    (`href`). See `Carousel` for its parts. */
export function CarouselItem(props: CarouselItemProps) {
  const {
    children,
    isDisabled,
    withOutline,
    aspectRatio,
    className,
    classNames,
    ...action
  } = props;
  const carousel = React.useContext(CarouselContext);
  const index = React.useContext(ItemIndexContext);
  if (!carousel) throw new Error("CarouselItem must be inside a Carousel.");
  const { count, layout, mode, itemClass, itemLabel, register, onItemFocus } =
    carousel;
  const s = styles({ mode, withOutline });
  const multiAspect = layout === "uncontained-multi-aspect-ratio";

  const inner = (
    <>
      <div
        data-slot="carousel-item-content"
        className={s.content({ className: classNames?.content })}
      >
        {children}
      </div>
      <div
        data-slot="state-layer"
        className={s.stateLayer({ className: classNames?.stateLayer })}
      />
    </>
  );
  const shared = {
    "data-slot": "carousel-item-container",
    isDisabled,
    className: s.container({ className: classNames?.container }),
    onFocus: (e: React.FocusEvent<Element>) =>
      onItemFocus(index, e.currentTarget as HTMLElement),
  };

  return (
    <div
      ref={(el) => register(index, el)}
      role="group"
      aria-roledescription="slide"
      aria-label={itemLabel(index, count)}
      data-slot="carousel-item"
      data-index={index}
      // Written as the row scrolls in the keyline layouts.
      data-size={mode === "keyline" ? undefined : "large"}
      className={cn(itemClass, multiAspect && "w-auto", className)}
      style={
        multiAspect
          ? { aspectRatio: clamp(aspectRatio ?? 1, 9 / 16, 16 / 9) }
          : undefined
      }
    >
      {"href" in action && action.href !== undefined ? (
        <AriaLink {...action} {...shared}>
          {inner}
        </AriaLink>
      ) : (
        <AriaButton {...action} {...shared}>
          {inner}
        </AriaButton>
      )}
    </div>
  );
}
