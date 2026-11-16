"use client";

import { useId, type ReactNode } from "react";
import {
  composeRenderProps,
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
} from "react-aria-components";

import { CheckIcon, XIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

const styles = tv({
  slots: {
    base: [
      // min-h-12 = the 48dp touch target (spec); the state layer stays 40dp.
      "group/sw inline-flex min-h-12 items-center gap-3 text-body-medium font-body-medium text-on-surface",
      "data-disabled:text-on-surface/38 data-disabled:pointer-events-none",
    ],
    track: [
      "relative flex h-8 w-13 shrink-0 items-center rounded-shape-full border-2 transition-colors duration-short-4",
    ],
    // Handle wrapper = 40px state-layer target, slides across the track.
    target:
      "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-shape-full transition-[left] duration-short-4 ease-standard",
    stateLayer: [
      "absolute inset-0 rounded-shape-full opacity-0 transition-opacity",
      "group-hover/sw:state-opacity-hover group-data-focus-visible/sw:state-opacity-focus group-data-pressed/sw:state-opacity-pressed",
    ],
    handle:
      "relative flex items-center justify-center rounded-shape-full transition-all duration-short-4 ease-standard",
    icon: "",
  },
  variants: {
    isSelected: {
      false: {
        track:
          "border-outline bg-surface-container-highest group-data-disabled/sw:border-on-surface/12 group-data-disabled/sw:bg-surface-container-highest/12",
        target: "-left-1",
        stateLayer: "bg-on-surface",
        handle:
          "size-4 bg-outline group-hover/sw:bg-on-surface-variant group-data-focus-visible/sw:bg-on-surface-variant group-data-pressed/sw:size-7 group-data-pressed/sw:bg-on-surface-variant group-data-disabled/sw:bg-on-surface/38",
        icon: "text-surface-container-highest",
      },
      true: {
        track:
          "border-primary bg-primary group-data-disabled/sw:border-transparent group-data-disabled/sw:bg-on-surface/12",
        target: "left-4",
        stateLayer: "bg-primary",
        handle:
          "size-6 bg-on-primary group-hover/sw:bg-primary-container group-data-focus-visible/sw:bg-primary-container group-data-pressed/sw:size-7 group-data-pressed/sw:bg-primary-container group-data-disabled/sw:bg-surface",
        icon: "text-on-primary-container group-data-disabled/sw:text-on-surface/38",
      },
    },
    hasIcons: {
      true: {},
    },
  },
  compoundVariants: [
    // With icons the off handle is 24px too (with-icon-handle-width).
    { hasIcons: true, isSelected: false, class: { handle: "size-6" } },
  ],
  defaultVariants: { isSelected: false, hasIcons: false },
});

export type SwitchProps = Omit<AriaSwitchProps, "className" | "children"> & {
  children?: ReactNode;
  /** Show a check / cross on the handle; `"selected"` shows the check only. */
  icons?: boolean | "selected";
  /** A line under the label, in `on-surface-variant`: what the setting
   *  does. It is the switch's description for a screen reader. */
  supportingText?: ReactNode;
  /**
   * `"start"` is a settings row: the label and its supporting line first,
   * the switch at the far end, the row as wide as what holds it and pressed
   * anywhere.
   *
   * @default "end"
   */
  labelPosition?: "start" | "end";
  className?: string;
};

/**
 * MD3 switch: a 52×32dp track whose handle grows from 16dp (off) to 24dp
 * (on) and 28dp while pressed, with a 40dp state layer inside a 48dp touch
 * target. `icons` shows a check on the handle when on and a cross when off;
 * `icons="selected"` is the spec's "icon on selected switch" configuration.
 *
 *   <Switch labelPosition="start" supportingText="A sound for each message">
 *     Notification sounds
 *   </Switch>
 *
 * The label is its children. `supportingText` is a second line under it and
 * the switch's description; `labelPosition="start"` makes the whole a
 * settings row, the label first and the switch at the end: Material's
 * guidelines give switches for "standalone or more verbose options in a
 * list, like settings", and describe no row; this one is the kit's.
 *
 * Spec: https://m3.material.io/components/switch/{overview,specs,guidelines,accessibility}
 * Deviation: the spec lists Enter as a toggle key; React Aria's switch (a
 * native checkbox input) toggles with Space only.
 */
export function Switch({
  children,
  icons = false,
  supportingText,
  labelPosition = "end",
  className,
  ...props
}: SwitchProps) {
  const descriptionId = useId();
  // The switch is a label around all it holds: named by its first line
  // alone, so the supporting line is its description and not its name too.
  const titleId = useId();
  const describedBy =
    [props["aria-describedby"], supportingText ? descriptionId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  const atStart = labelPosition === "start";
  return (
    <AriaSwitch
      data-slot="switch"
      data-label-position={labelPosition}
      {...props}
      aria-describedby={describedBy}
      aria-labelledby={
        props["aria-labelledby"] ?? (supportingText ? titleId : undefined)
      }
      className={composeTailwindRenderProps(
        className,
        styles().base({
          className: atStart ? "flex w-full justify-between gap-4" : "",
        }),
      )}
    >
      {composeRenderProps(children, (children, { isSelected }) => {
        const s = styles({ isSelected, hasIcons: icons === true });
        return (
          <>
            <span data-slot="switch-track" className={s.track()}>
              <span data-slot="switch-target" className={s.target()}>
                <span data-slot="state-layer" className={s.stateLayer()} />
                <span data-slot="switch-handle" className={s.handle()}>
                  {icons && isSelected && (
                    <CheckIcon size={16} className={s.icon()} />
                  )}
                  {icons === true && !isSelected && (
                    <XIcon size={16} className={s.icon()} />
                  )}
                </span>
              </span>
            </span>
            {supportingText ? (
              <span
                data-slot="switch-text"
                className={`flex min-w-0 flex-col ${atStart ? "-order-1" : ""}`}
              >
                <span id={titleId}>{children}</span>
                <span
                  id={descriptionId}
                  data-slot="supporting-text"
                  className="text-on-surface-variant group-data-disabled/sw:text-on-surface/38"
                >
                  {supportingText}
                </span>
              </span>
            ) : atStart ? (
              <span data-slot="switch-text" className="-order-1 min-w-0">
                {children}
              </span>
            ) : (
              children
            )}
          </>
        );
      })}
    </AriaSwitch>
  );
}

export default Switch;
