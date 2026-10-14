"use client";

import * as React from "react";
import {
  ToggleButton,
  type ToggleButtonProps,
  ToggleButtonGroup,
  type ToggleButtonGroupProps,
  composeRenderProps,
} from "react-aria-components";
import { focusRing, tv } from "../utils";
import { CheckIcon, type IconComponent } from "../icons";

const groupStyles = tv({
  base: "flex w-full items-stretch",
});

const segmentStyles = tv({
  slots: {
    base: [
      focusRing(),
      // Each segment draws its own outline; neighbours overlap theirs by one
      // pixel, so that one line divides them. The outer corners are full,
      // the inner ones square.
      "group/segment relative flex h-10 min-w-12 flex-1 basis-0 items-center justify-center px-3",
      "border border-outline text-on-surface rounded-none not-first:-ms-px first:rounded-s-shape-full last:rounded-e-shape-full",
      "transition-colors duration-short-4 ease-standard data-focus-visible:z-10",
      // A 40dp segment answers over Material's 48dp target.
      "before:absolute before:inset-x-0 before:top-1/2 before:h-12 before:-translate-y-1/2 before:content-['']",
    ],
    stateLayer: [
      "absolute inset-0 rounded-[inherit] pointer-events-none bg-on-surface opacity-0 transition-opacity",
      "group-hover/segment:state-opacity-hover group-data-focus-visible/segment:state-opacity-focus group-data-pressed/segment:state-opacity-pressed",
    ],
    content: "relative flex min-w-0 items-center gap-2",
    icon: "inline-flex shrink-0",
    label: "truncate text-label-large font-label-large",
  },
  variants: {
    isSelected: {
      true: {
        base: "bg-secondary-container text-on-secondary-container",
        stateLayer: "bg-on-secondary-container",
      },
      false: { base: "bg-transparent" },
    },
    isDisabled: {
      true: {
        base: "pointer-events-none text-on-surface/38 border-on-surface/12",
      },
    },
  },
});

export type SegmentedButtonProps = Omit<
  ToggleButtonGroupProps,
  "orientation" | "className" | "style"
> & {
  className?: string;
};

/**
 * MD3 segmented button: two to five options in one outlined row, single
 * (`selectionMode="single"`, the default) or multiple select.
 *
 * Material no longer recommends it: "Segmented buttons are no longer
 * recommended in the Material 3 expressive update. For those who have
 * updated, use the connected button group instead". The kit ships it because
 * it ships every component Material describes; for new work prefer
 * `<ButtonGroup variant="connected" selectionMode=…>`.
 *
 * Built on React Aria's `ToggleButtonGroup` and `ToggleButton`: `single` is a
 * `radiogroup` of radios, `multiple` a group of buttons with `aria-pressed`.
 * Tab lands on the first segment, whatever is selected, the arrow keys move
 * between segments, Space or Enter selects and unselects the focused one. Name the group with
 * `aria-label` (what it chooses, "Sort by") and each segment by its label,
 * or by `aria-label` where it shows an icon alone.
 *
 * Specs (`md.comp.outlined-segmented-button.*`): 40dp tall, a 1dp `outline`
 * outline, full outer corners, segments of equal width, `label-large`, 18dp
 * icons, at least 12dp side padding and 8dp between elements. Selected,
 * `secondary-container` with `on-secondary-container`; unselected
 * `on-surface`. Disabled, the content is `on-surface` at 38 % and the
 * outline `on-surface` at 12 %; a disabled selected segment keeps its
 * container. A selected segment shows a check: it
 * replaces the icon of a segment with an icon and a label, and comes before
 * the label of a segment with a label alone. Each segment answers over a
 * 48dp tall target.
 *
 * The root is `data-slot="segmented-button"`, each segment
 * `data-slot="segment"`; a segment's parts are `segment-icon` and
 * `segment-label`, reached with `classNames`.
 *
 * Deviations, by name:
 * - **Icon-only segments** keep their icon when selected: the container
 *   colour and the radio's or button's state say it.
 * - **Density** (each step 4dp shorter) is not built.
 * - **Two to five segments** is Material's rule, said here and not
 *   enforced.
 *
 * Spec: https://m3.material.io/components/segmented-buttons/{overview,specs,guidelines,accessibility}
 */
export function SegmentedButton(props: SegmentedButtonProps) {
  const { className, selectionMode = "single", ...groupProps } = props;
  return (
    <ToggleButtonGroup
      data-slot="segmented-button"
      {...groupProps}
      selectionMode={selectionMode}
      className={groupStyles({ className })}
    >
      {props.children}
    </ToggleButtonGroup>
  );
}

export type SegmentProps = Omit<ToggleButtonProps, "children" | "className"> & {
  /** The segment's key in the group's `selectedKeys`. */
  id: string;
  /** The label text. Left out, give the segment an `aria-label`. */
  children?: React.ReactNode;
  icon?: IconComponent;
  className?: ToggleButtonProps["className"];
  /** Classes for the named parts. */
  classNames?: { icon?: string; label?: string };
};

/** One option of a `SegmentedButton`. */
export function Segment(props: SegmentProps) {
  const { children, icon: Icon, className, classNames, ...segmentProps } = props;
  return (
    <ToggleButton
      data-slot="segment"
      {...segmentProps}
      className={composeRenderProps(className, (className, renderProps) =>
        segmentStyles({
          isSelected: renderProps.isSelected,
          isDisabled: renderProps.isDisabled,
        }).base({ className }),
      )}
    >
      {({ isSelected, isDisabled }) => {
        const { stateLayer, content, icon, label } = segmentStyles({
          isSelected,
          isDisabled,
        });
        const hasLabel = children !== undefined;
        // The check replaces the icon of a labelled segment and comes before
        // the label of a segment with no icon; an icon-only segment keeps
        // its icon.
        const ShownIcon =
          isSelected && (hasLabel || !Icon) ? CheckIcon : Icon;
        return (
          <>
            <span data-slot="state-layer" className={stateLayer()} />
            <span className={content()}>
              {ShownIcon && (
                <span
                  data-slot="segment-icon"
                  className={icon({ className: classNames?.icon })}
                >
                  <ShownIcon size={18} />
                </span>
              )}
              {hasLabel && (
                <span
                  data-slot="segment-label"
                  className={label({ className: classNames?.label })}
                >
                  {children}
                </span>
              )}
            </span>
          </>
        );
      }}
    </ToggleButton>
  );
}

export default SegmentedButton;
