"use client";

import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";
import { cn, tv } from "../utils";
import { ChevronDownIcon, XIcon } from "../icons";
import IconButton from "./IconButton";
import { Body, Title } from "../primitives/Typography";

const styles = tv({
  slots: {
    // Full window width up to 640dp; above a 640dp window, 56dp side margins.
    base: [
      "bg-surface-container-low shadow-elevation-1 rounded-t-shape-extra-large",
      "mx-auto flex w-full max-w-[640px] flex-col min-[641px]:w-[calc(100%-112px)]",
      "outline-hidden",
    ],
    // The top 48dp is the handle's: a 4dp pill with 22dp above and below.
    dragHandle: [
      "group/handle flex h-12 w-full shrink-0 cursor-grab touch-none items-center justify-center",
      "outline-none active:cursor-grabbing",
    ],
    dragHandlePill: [
      "bg-on-surface-variant/40 rounded-shape-full h-1 w-8",
      // `focusRing`'s outline, drawn on the pill the handle shows rather than
      // on the full-width hit area.
      "outline-ring outline-3 outline-offset-2 outline-none group-data-focus-visible/handle:outline-solid",
    ],
    header: "flex shrink-0 items-center justify-between gap-2 px-6 pb-2",
    content: "min-h-0 grow overflow-y-auto px-6 pb-6",
  },
  variants: {
    variant: {
      standard: {
        base: "absolute inset-x-0 bottom-0 z-10 transition-[transform,visibility] duration-medium-2 ease-emphasized motion-reduce:transition-none",
      },
      modal: {},
    },
    height: {
      partial: {},
      expanded: {},
    },
    hasHandle: {
      true: {},
      false: { base: "pt-6" },
    },
  },
  compoundVariants: [
    // A modal sheet opens at most half the screen high, and pulls up to the
    // top margin: 72dp, or 56dp above a 640dp window.
    {
      variant: "modal",
      height: "partial",
      class: { base: "max-h-[50dvh]" },
    },
    {
      variant: "modal",
      height: "expanded",
      class: {
        base: "h-[calc(100dvh-72px)] min-[641px]:h-[calc(100dvh-56px)]",
      },
    },
    // A standard sheet measures against the container it is anchored in.
    {
      variant: "standard",
      height: "partial",
      class: { base: "max-h-1/2" },
    },
    {
      variant: "standard",
      height: "expanded",
      class: { base: "h-[calc(100%-72px)] min-[641px]:h-[calc(100%-56px)]" },
    },
  ],
  defaultVariants: {
    variant: "standard",
    height: "partial",
    hasHandle: true,
  },
});

export type BottomSheetHeight = "partial" | "expanded";

/** How far, in px, the handle has to travel before a release counts as a drag
    to another height rather than a press. */
const DRAG_THRESHOLD = 48;
/** Movement under this is a press, and leaves the pointer to the button. */
const DRAG_SLOP = 4;

export type BottomSheetProps = {
  children: ReactNode;
  /** `standard` sits over the page without a scrim and leaves it usable;
      `modal` floats over a scrim and holds focus until dismissed. */
  variant?: "standard" | "modal";
  isOpen: boolean;
  /** Called when the sheet asks to close: the scrim, Escape, the close
      button, a drag below its lowest height, or the handle of a sheet with a
      single height. */
  onClose?: () => void;
  /** A header row above the content. A string also names the modal sheet. */
  title?: ReactNode;
  /**
   * Modal only: the dialog's accessible name when `title` is not the right
   * one, or there is no `title`. It wins over `title` when both are given.
   */
  "aria-label"?: string;
  modalProps?: {
    /** Whether a press on the scrim closes the sheet. Default true. */
    isDismissable?: boolean;
  };
  /** Show the drag handle. Default true. */
  showDragHandle?: boolean;
  /** The drag handle's accessible name. Default "Drag handle". */
  dragHandleLabel?: string;
  /** The preset heights the handle cycles through, lowest first. Default
      both; with one, the handle closes the sheet instead. */
  heights?: readonly BottomSheetHeight[];
  /** The current height, controlled. */
  height?: BottomSheetHeight;
  /** The height the sheet opens at, uncontrolled, each time it opens.
      Default the first of `heights`. */
  defaultHeight?: BottomSheetHeight;
  onHeightChange?: (height: BottomSheetHeight) => void;
  className?: string;
  /** Classes for the parts, keyed by slot. */
  classNames?: { dragHandle?: string; header?: string; content?: string };
};

const DEFAULT_HEIGHTS: readonly BottomSheetHeight[] = ["partial", "expanded"];

/**
 * MD3 bottom sheet, in Material's two variants:
 *  - `standard` co-exists with the page: no scrim, the page behind stays
 *    usable, and it is anchored `absolute inset-x-0 bottom-0` inside the
 *    caller's positioned container (pass `className="fixed"` to anchor it to
 *    the viewport instead). Closed, it slides below and is `inert`, so
 *    nothing in it stays reachable by Tab, as `SideSheet`'s standard form;
 *  - `modal` floats over a scrim on a React Aria `ModalOverlay` + `Modal` +
 *    `Dialog`, the three `SideSheet`'s modal form is built from. The dialog is
 *    the sheet: it gives it the `dialog` role and a name (a string `title`, or
 *    `aria-label`), moves focus in on open, contains Tab, closes on Escape and
 *    on a press on the scrim (unless `modalProps.isDismissable` is false), and
 *    returns focus to the trigger. It enters with `emphasized-decelerate`
 *    over `medium-2` and leaves with `emphasized-accelerate` over `short-4`;
 *    neither animates under reduced motion. No animation library.
 *
 *   <BottomSheet variant="modal" isOpen={open} onClose={close} title="Share">…</BottomSheet>
 *   <BottomSheet isOpen={playing} aria-label="Now playing">…</BottomSheet>
 *
 * Spec: https://m3.material.io/components/bottom-sheets/overview ·
 * .../specs · .../guidelines · .../accessibility (pages updated 2026-07-28,
 * token table revision 2026-05-27, read 2026-10-14).
 *
 * Tokens: the container is `surface-container-low`
 * (`md.comp.sheet.bottom.docked.container.color`) with the extra-large top
 * corners (`…container.shape` = `corner.extra-large.top`) at elevation 1 in
 * both variants (`…standard/modal.container.elevation`). The drag handle is a
 * 32×4dp `on-surface-variant` pill at 0.4 opacity (`…drag-handle.width`,
 * `.height`, `.color`, `.opacity`), centred with 22dp above and below, so the
 * sheet's top 48dp is its target. Its focus indicator is `secondary`, 3dp,
 * offset 2dp (`md.comp.sheet.bottom.focus.indicator.*`): `focusRing`'s values,
 * drawn around the pill. Measurements: full window width up to 640dp; above a
 * 640dp window, 56dp side and top margins; otherwise a 72dp top margin.
 *
 * Heights. `partial` is the sheet at its content's height, capped at half the
 * screen (Material: a modal sheet opens "capped at 50% of the screen
 * height"); `expanded` reaches the top margin, and the content scrolls inside
 * the sheet. Pressing the drag handle, or Space or Enter on it, cycles
 * `heights`, which is the single-pointer alternative to dragging Material
 * requires; with one height it closes the sheet. Dragging the handle moves
 * the sheet with the pointer and settles on the next height up or down once
 * it travelled 48px; dragged below the lowest, the sheet closes. Expanded,
 * a modal sheet shows a close button and a standard one a collapse button,
 * as Material asks of a full-screen sheet.
 *
 * Accessibility: the drag handle is a button named by `dragHandleLabel`
 * ("Drag handle" by default), the sheet's first tab stop.
 *
 * Deviations, each recorded:
 *
 * - **The modal sheet is a named dialog.** Material says to label only the
 *   drag handle; on the web a modal surface that takes focus is a dialog,
 *   and a dialog needs a name.
 * - **No `minimized` state.** Material's token table has
 *   `md.comp.sheet.bottom.docked.minimized.container.shape` (corner none),
 *   but no page describes the state or its behaviour, so the kit does not
 *   invent one.
 * - **No predictive back**: it is an Android system gesture.
 * - **The standard sheet is `absolute`** in the caller's container, so a
 *   page lays it out where it belongs; `className="fixed"` pins it to the
 *   window.
 * - **A drag is not tested** by the story tests, which have no captured
 *   pointer; the press and keyboard paths that replace it are.
 *
 * Parts, each reachable through `classNames` and by `data-slot`:
 * `dragHandle` (`bottom-sheet-drag-handle`), `header`
 * (`bottom-sheet-header`) and `content` (`bottom-sheet-content`). The root
 * carries `data-slot="bottom-sheet"`, `data-variant` and `data-height`.
 */
export default function BottomSheet(props: BottomSheetProps) {
  const {
    children,
    variant = "standard",
    isOpen,
    onClose,
    title,
    "aria-label": ariaLabel,
    modalProps,
    showDragHandle = true,
    dragHandleLabel = "Drag handle",
    heights = DEFAULT_HEIGHTS,
    height: controlledHeight,
    defaultHeight,
    onHeightChange,
    className,
    classNames,
  } = props;

  const openingHeight = defaultHeight ?? heights[0] ?? "partial";
  const [ownHeight, setOwnHeight] = useState<BottomSheetHeight>(openingHeight);
  // The sheet stays mounted while closed, so an uncontrolled height would
  // otherwise survive a close: each opening starts again at the opening
  // height (a modal sheet capped at half the screen). Reset on open rather
  // than on close, so the sheet leaves at the height it was seen at.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOwnHeight(openingHeight);
  }
  const height = controlledHeight ?? ownHeight;
  const setHeight = (next: BottomSheetHeight) => {
    if (controlledHeight === undefined) setOwnHeight(next);
    onHeightChange?.(next);
  };
  const index = Math.max(heights.indexOf(height), 0);

  /** A press on the handle: the next height, round to the first; with only
      one height, close. */
  const cycle = () => {
    if (heights.length < 2) onClose?.();
    else setHeight(heights[(index + 1) % heights.length]!);
  };

  /** A drag that travelled `dy` px: up or down one height, or close. */
  const settle = (dy: number) => {
    if (dy <= -DRAG_THRESHOLD && index < heights.length - 1)
      setHeight(heights[index + 1]!);
    else if (dy >= DRAG_THRESHOLD && index > 0) setHeight(heights[index - 1]!);
    else if (dy >= DRAG_THRESHOLD) onClose?.();
  };

  const sheetRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    id: number;
    startY: number;
    startHeight: number;
    moving: boolean;
    dy: number;
  } | null>(null);
  // Set when a drag ends, so the press that the same pointer completes on the
  // handle does not also cycle the height.
  const dragged = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !sheetRef.current) return;
    dragged.current = false;
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
      moving: false,
      dy: 0,
    };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (d?.id !== e.pointerId || !sheet) return;
    d.dy = e.clientY - d.startY;
    if (!d.moving) {
      if (Math.abs(d.dy) < DRAG_SLOP) return;
      // Only now take the pointer: a press that never moved stays the
      // button's, so a tap on the handle still cycles.
      d.moving = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // The sheet follows the pointer: taller as it rises, lower as it falls.
    const room =
      variant === "modal"
        ? window.innerHeight
        : (sheet.offsetParent?.getBoundingClientRect().height ??
          window.innerHeight);
    const next = Math.min(Math.max(d.startHeight - d.dy, 0), room);
    sheet.style.maxHeight = "none";
    sheet.style.height = `${next}px`;
    sheet.style.transition = "none";
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.id !== e.pointerId) return;
    if (sheetRef.current) {
      sheetRef.current.style.maxHeight = "";
      sheetRef.current.style.height = "";
      sheetRef.current.style.transition = "";
    }
    if (d.moving) {
      dragged.current = true;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (e.type === "pointerup") settle(d.dy);
    }
  };

  const s = styles({ variant, height, hasHandle: showDragHandle });
  const titleId = useId();
  // The modal stays mounted while it animates out; a caller that drops its
  // content on close leaves a nameless dialog for that long. Name that one
  // generically, as SideSheet does; an open sheet with no name still warns.
  const exitingLabel = !title && !isOpen ? "Bottom sheet" : undefined;
  const expanded = height === "expanded";
  const showClose = variant === "modal" && expanded;
  const showCollapse = variant === "standard" && expanded && heights.length > 1;

  const body = (
    <>
      {showDragHandle && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="shrink-0"
        >
          <AriaButton
            data-slot="bottom-sheet-drag-handle"
            aria-label={dragHandleLabel}
            onPress={(e) => {
              if (dragged.current && e.pointerType !== "keyboard") {
                dragged.current = false;
                return;
              }
              cycle();
            }}
            className={s.dragHandle({ className: classNames?.dragHandle })}
          >
            <span aria-hidden="true" className={s.dragHandlePill()} />
          </AriaButton>
        </div>
      )}
      {(title || showClose || showCollapse) && (
        <div
          data-slot="bottom-sheet-header"
          className={s.header({ className: classNames?.header })}
        >
          {typeof title === "string" ? (
            <Title id={titleId} component="h2">
              {title}
            </Title>
          ) : title ? (
            // `contents` keeps a caller's title markup a direct flex child;
            // the wrapper only carries the id the dialog is labelled by.
            <div id={titleId} className="contents">
              {title}
            </div>
          ) : (
            <span />
          )}
          {showClose && (
            <IconButton
              variant="standard"
              aria-label="Close"
              icon={XIcon}
              onPress={onClose}
            />
          )}
          {showCollapse && (
            <IconButton
              variant="standard"
              aria-label="Collapse"
              icon={ChevronDownIcon}
              onPress={() => setHeight(heights[0]!)}
            />
          )}
        </div>
      )}
      <Body
        data-slot="bottom-sheet-content"
        className={s.content({ className: classNames?.content })}
        component="div"
      >
        {children}
      </Body>
    </>
  );

  if (variant === "modal") {
    return (
      <ModalOverlay
        data-slot="bottom-sheet-overlay"
        isOpen={isOpen}
        isDismissable={modalProps?.isDismissable ?? true}
        onOpenChange={(open) => {
          if (!open) onClose?.();
        }}
        className={cn(
          "bg-scrim/50 fixed inset-0 z-50",
          "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2",
          "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4",
          "motion-reduce:animate-none",
        )}
      >
        <AriaModal
          className={cn(
            "fixed inset-x-0 bottom-0 flex flex-col",
            "data-entering:animate-in data-entering:slide-in-from-bottom data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
            "data-exiting:animate-out data-exiting:slide-out-to-bottom data-exiting:duration-short-4 data-exiting:ease-emphasized-accelerate",
            "motion-reduce:animate-none",
          )}
        >
          <AriaDialog
            ref={(el) => {
              sheetRef.current = el;
            }}
            data-slot="bottom-sheet"
            data-variant="modal"
            data-height={height}
            aria-label={ariaLabel ?? exitingLabel}
            aria-labelledby={!ariaLabel && title ? titleId : undefined}
            className={s.base({ className })}
          >
            {body}
          </AriaDialog>
        </AriaModal>
      </ModalOverlay>
    );
  }

  return (
    <div
      ref={(el) => {
        sheetRef.current = el;
      }}
      data-slot="bottom-sheet"
      data-variant="standard"
      data-height={height}
      aria-label={ariaLabel}
      role={ariaLabel ? "region" : undefined}
      aria-hidden={!isOpen}
      // Closed, the sheet is still in the DOM (it slides), so `aria-hidden`
      // alone would leave its controls in the tab order; `inert` takes the
      // subtree out of both.
      inert={!isOpen}
      className={s.base({
        className: cn(
          isOpen ? "visible" : "invisible translate-y-full",
          className,
        ),
      })}
    >
      {body}
    </div>
  );
}

export { BottomSheet };
