"use client";

import { type ReactNode } from "react";
import {
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  OverlayArrow,
  type TooltipProps as AriaTooltipProps,
  type TooltipTriggerComponentProps as AriaTooltipTriggerProps,
} from "react-aria-components";
import { tv, type VariantProps } from "../utils";
import { Body, Title } from "../primitives/Typography";

const styles = tv({
  slots: {
    base: "shadow-elevation-2 rounded-shape-extra-small outline-hidden transform-gpu relative data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95",
    content: "text-sm",
    arrow: "",
    overlayArrow: "absolute w-2 h-2",
  },
  variants: {
    placement: {
      top: {
        base: "mb-2 data-entering:slide-in-from-bottom-2 data-exiting:slide-out-to-bottom-2",
        overlayArrow: "bottom-[-8px] left-1/2 -translate-x-1/2",
        arrow: "",
      },
      bottom: {
        base: "mt-2 data-entering:slide-in-from-top-2 data-exiting:slide-out-to-top-2",
        overlayArrow: "top-[-8px] left-1/2 -translate-x-1/2",
        arrow: "rotate-180",
      },
      left: {
        base: "mr-2 data-entering:slide-in-from-right-2 data-exiting:slide-out-to-right-2",
        overlayArrow: "right-[-8px] top-1/2 -translate-y-1/2",
        arrow: "-rotate-90",
      },
      right: {
        base: "ml-2 data-entering:slide-in-from-left-2 data-exiting:slide-out-to-left-2",
        overlayArrow: "left-[-8px] top-1/2 -translate-y-1/2",
        arrow: "rotate-90",
      },
    },
    variant: {
      plain: {
        base: "px-2 py-1 max-w-[150px] bg-inverse-surface text-inverse-on-surface",
        arrow: "fill-inverse-surface",
      },
      rich: {
        base: "p-4 max-w-[280px] bg-surface-container text-on-surface",
        arrow: "fill-surface-container",
      },
    },
  },
  defaultVariants: {
    placement: "top",
    variant: "plain",
  },
});

type TooltipProps = VariantProps<typeof styles> & {
  children?: ReactNode;
  headline?: string;
  supportingText?: string;
  className?: string;
} & Pick<AriaTooltipProps, "placement">;

export function Tooltip({
  children,
  headline,
  supportingText,
  className,
  placement = "top",
}: TooltipProps) {
  const isRich = headline || supportingText;
  const variant = isRich ? "rich" : "plain";
  const s = styles({ placement, variant });

  const renderContent = () => {
    if (children !== undefined) {
      if (typeof children === "string") {
        return (
          <Body size="small" className="text-inherit">
            {children}
          </Body>
        );
      } else {
        return children;
      }
    } else if (isRich) {
      return (
        <>
          {headline && (
            <Title
              size="small"
              className="text-on-surface mb-1"
              component="span"
            >
              {headline}
            </Title>
          )}
          {supportingText && (
            <Body size="small" className="text-on-surface-variant">
              {supportingText}
            </Body>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <AriaTooltip
      data-slot="tooltip"
      className={s.base({ className })}
      placement={placement}
    >
      <OverlayArrow className={s.overlayArrow()}>
        <svg width={8} height={8} viewBox="0 0 8 8" className={s.arrow()}>
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      <div className={s.content()}>{renderContent()}</div>
    </AriaTooltip>
  );
}

export function TooltipTrigger(props: AriaTooltipTriggerProps) {
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
