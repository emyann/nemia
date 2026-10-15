"use client";

import { type ReactNode, type RefObject } from "react";
import {
  Focusable as AriaFocusable,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  OverlayArrow,
  TooltipTriggerStateContext,
  type TooltipProps as AriaTooltipProps,
  type TooltipTriggerComponentProps as AriaTooltipTriggerProps,
} from "react-aria-components";
import { tv } from "../utils";
import { Body, Title } from "../primitives/Typography";

const styles = tv({
  slots: {
    // The side classes key on the placement React Aria reports, which is the
    // side the tooltip really landed on: a flipped tooltip slides in from the
    // right side too.
    base: [
      "relative outline-hidden transform-gpu",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95",
      "data-[placement=top]:data-entering:slide-in-from-bottom-2 data-[placement=top]:data-exiting:slide-out-to-bottom-2",
      "data-[placement=bottom]:data-entering:slide-in-from-top-2 data-[placement=bottom]:data-exiting:slide-out-to-top-2",
      "data-[placement=left]:data-entering:slide-in-from-right-2 data-[placement=left]:data-exiting:slide-out-to-right-2",
      "data-[placement=right]:data-entering:slide-in-from-left-2 data-[placement=right]:data-exiting:slide-out-to-left-2",
    ],
    content: "",
    headline: "block",
    supportingText: "",
    // React Aria places the arrow on the side facing the trigger and along
    // it; the kit only turns the drawing to point at the trigger.
    arrow: [
      "[&>svg]:block",
      "data-[placement=bottom]:[&>svg]:rotate-180 data-[placement=left]:[&>svg]:-rotate-90 data-[placement=right]:[&>svg]:rotate-90",
    ],
  },
  variants: {
    variant: {
      plain: {
        base: "rounded-shape-extra-small px-2 py-1 max-w-[150px] bg-inverse-surface text-inverse-on-surface",
        arrow: "fill-inverse-surface",
      },
      rich: {
        base: "rounded-shape-medium shadow-elevation-2 px-4 pt-3 pb-2 max-w-[280px] bg-surface-container text-on-surface-variant",
        content: "flex flex-col gap-1",
        arrow: "fill-surface-container",
      },
    },
  },
  defaultVariants: {
    variant: "plain",
  },
});

export type TooltipProps = {
  /**
   * `plain` labels its trigger in a few words; `rich` explains it. Left out,
   * a tooltip is rich when it is handed a `headline` or a `supportingText`,
   * and plain otherwise.
   */
  variant?: "plain" | "rich";
  /** Rich: the subhead, one line. */
  headline?: ReactNode;
  /** Rich: the supporting text. A plain tooltip draws it when it has no children. */
  supportingText?: ReactNode;
  /**
   * What the tooltip says. In a rich tooltip, any content that is only read,
   * drawn under the headline and the supporting text.
   */
  children?: ReactNode;
  /**
   * A side (`"top"`, `"bottom"`, `"left"`, `"right"`, `"start"`, `"end"`) or
   * a side and where along it (`"bottom start"`, `"top end"`, `"right top"`).
   * Material's defaults: `"top"` for a plain tooltip, `"bottom start"` for a
   * rich one. The tooltip flips to stay on screen.
   */
  placement?: AriaTooltipProps["placement"];
  /**
   * The distance to the trigger, in pixels. Material's defaults: 4 for a plain
   * tooltip, its distance to a trigger with a visible boundary such as a
   * button (pass 8 for one with none, such as text), and 8 for a rich one.
   */
  offset?: number;
  /** Draws an arrow pointing at the trigger. Material's tooltip has none. */
  showArrow?: boolean;
  /**
   * Standalone, with no `TooltipTrigger`: the element the tooltip is placed
   * against. Pass it with `isOpen`.
   */
  triggerRef?: RefObject<Element | null>;
  /** Standalone: whether the tooltip shows. The caller decides when. */
  isOpen?: boolean;
  /**
   * Standalone: what the tooltip itself asks for. Three things call it: the
   * pointer coming onto the tooltip (`true`, so it stays while it is read),
   * the pointer leaving it (`false`), and the page scrolling under it
   * (`false`). Nothing else does. Escape is the caller's to handle, as are
   * the pointer and the focus on the trigger: React Aria listens for those
   * in `TooltipTrigger`, and a standalone tooltip has none.
   */
  onOpenChange?: (isOpen: boolean) => void;
  /** Classes for the tooltip's container. */
  className?: string;
  /** Classes for the named parts. */
  classNames?: {
    content?: string;
    headline?: string;
    supportingText?: string;
    arrow?: string;
  };
};

/**
 * MD3 tooltip: plain (a short label for its trigger) or rich (a headline,
 * supporting text, and any content that is only read). Wrap it and its trigger
 * in a `TooltipTrigger`. The trigger is a kit button, or anything focusable
 * wrapped in `Focusable`:
 *
 *     <TooltipTrigger>
 *       <Focusable>
 *         <span role="img" aria-label="1,284 visits" tabIndex={0}>1,284</span>
 *       </Focusable>
 *       <Tooltip variant="rich" headline="Visits">
 *         <dl>…</dl>
 *       </Tooltip>
 *     </TooltipTrigger>
 *
 * `Focusable`'s child must take focus (`tabIndex={0}` on an element that is
 * not focusable by itself) and carry a role a description is announced on.
 *
 * Standalone, with no `TooltipTrigger`, it takes `triggerRef`, `isOpen` and
 * `onOpenChange`: the caller says when it shows and against what, and nothing
 * is described to the trigger. `Table`'s cut cell shows its whole text so.
 *
 * **A rich tooltip takes any content that is only read**: text, rows of label
 * and value (a `<dl>`), a short list, an icon, a figure. It takes nothing that
 * is operated or takes focus (a link, a button, a field): a tooltip is
 * described to its trigger (`role="tooltip"`, `aria-describedby`), never
 * takes focus itself and closes when its trigger loses it, so a control
 * inside it could not be reached from the keyboard. Content the reader
 * operates goes in a `PreviewTrigger`.
 *
 * Parts, each with its `data-slot` and its key in `classNames`: `content`
 * (`tooltip-content`), `headline` (`tooltip-headline`), `supportingText`
 * (`tooltip-supporting-text`), `arrow` (`tooltip-arrow`). The root is
 * `data-slot="tooltip"` with `data-variant`, and takes `className`.
 *
 * Gaps against Material's pages, by name:
 * - **Rich tooltip buttons**: Material's rich tooltip can end with up to two
 *   text buttons, and hold a link. Not built, for the reason above.
 * - **Persistent rich tooltip**: one that opens on a press or at page load
 *   and stays until another element is used. Not built; every tooltip here is
 *   transient, and closes 1.5 seconds after its trigger is left.
 * - **Dynamic positioning in steps of 8dp**: the tooltip flips and shifts to
 *   stay on screen as React Aria computes it, not by Material's increments.
 *
 * Not Material's: `showArrow`, and the maximum widths (150 and 280 pixels;
 * Material's pages give none).
 *
 * Spec: https://m3.material.io/components/tooltips/{overview,specs,guidelines,accessibility}
 */
export function Tooltip({
  variant: variantProp,
  children,
  headline,
  supportingText,
  placement,
  offset,
  showArrow = false,
  triggerRef,
  isOpen,
  onOpenChange,
  className,
  classNames,
}: TooltipProps) {
  const variant = variantProp ?? (headline || supportingText ? "rich" : "plain");
  const isRich = variant === "rich";
  const s = styles({ variant });

  const tooltip = (
    <AriaTooltip
      data-slot="tooltip"
      data-variant={variant}
      className={s.base({ className })}
      placement={placement ?? (isRich ? "bottom start" : "top")}
      offset={offset ?? (isRich ? 8 : 4)}
      triggerRef={triggerRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      {showArrow && (
        <OverlayArrow
          data-slot="tooltip-arrow"
          className={s.arrow({ className: classNames?.arrow })}
        >
          {/* A square box with the triangle in its near half: turned about
              its centre, the triangle's base stays on the tooltip's edge on
              all four sides. */}
          <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true">
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        </OverlayArrow>
      )}
      <Body
        size={isRich ? "medium" : "small"}
        component="div"
        data-slot="tooltip-content"
        className={s.content({ className: classNames?.content })}
      >
        {isRich ? (
          <>
            {headline && (
              <Title
                size="small"
                component="span"
                data-slot="tooltip-headline"
                className={s.headline({ className: classNames?.headline })}
              >
                {headline}
              </Title>
            )}
            {supportingText && (
              <span
                data-slot="tooltip-supporting-text"
                className={s.supportingText({
                  className: classNames?.supportingText,
                })}
              >
                {supportingText}
              </span>
            )}
            {children}
          </>
        ) : (
          (children ?? supportingText)
        )}
      </Body>
    </AriaTooltip>
  );

  // React Aria's tooltip reads its state from the trigger around it. With
  // none, the kit hands it the caller's.
  if (isOpen === undefined) return tooltip;
  return (
    <TooltipTriggerStateContext.Provider
      value={{
        isOpen,
        open: () => onOpenChange?.(true),
        close: () => onOpenChange?.(false),
        shouldSkipAnimation: false,
      }}
    >
      {tooltip}
    </TooltipTriggerStateContext.Provider>
  );
}

export type TooltipTriggerProps = AriaTooltipTriggerProps;

export function TooltipTrigger(props: TooltipTriggerProps) {
  const {
    children,
    delay = 300,
    closeDelay = 1500,
    ...tooltipTriggerProps
  } = props;
  return (
    <AriaTooltipTrigger
      delay={delay}
      closeDelay={closeDelay}
      {...tooltipTriggerProps}
    >
      {children}
    </AriaTooltipTrigger>
  );
}

/**
 * React Aria's `Focusable`: makes its one child a tooltip trigger when that
 * child is no button. The child must take focus and carry a role.
 */
export const Focusable = AriaFocusable;
