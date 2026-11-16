"use client";

import {
  Dialog as AriaDialog,
  type DialogProps as AriaDialogProps,
  DialogTrigger,
  type DialogTriggerProps,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { cn } from "../utils";

export type PopoverTriggerProps = DialogTriggerProps;

/**
 * What opens a `Popover`: a pressable kit component (a `Button`, an
 * `IconButton`, a `Chip`) and the `Popover`, side by side. React Aria's
 * `DialogTrigger`: it opens on press and on Enter or Space, names the
 * trigger as having a popup, and gives the focus back to it on close. Open
 * state is its own, or yours with `isOpen` and `onOpenChange`.
 *
 * Material 3 does not describe this component; `Popover` says what it is
 * built from instead.
 */
export function PopoverTrigger(props: PopoverTriggerProps) {
  return <DialogTrigger {...props} />;
}

export type PopoverProps = Omit<AriaPopoverProps, "children" | "className"> &
  Pick<AriaDialogProps, "aria-label" | "aria-labelledby" | "children"> & {
    /** Classes for the surface: its width, its padding. */
    className?: string;
  };

/**
 * A surface that opens beside its trigger and holds anything: a filter's
 * controls, a list of notifications, a colour picker, a short form. On React
 * Aria `Popover` and `Dialog`, so it is a dialog that is not modal: the
 * focus moves into it and stays in it, Escape or a press outside closes it,
 * and the page behind it is still there.
 *
 *   <PopoverTrigger>
 *     <Button variant="outlined">Filters</Button>
 *     <Popover aria-label="Filters" placement="bottom start">
 *       <CheckboxGroup label="Status">…</CheckboxGroup>
 *     </Popover>
 *   </PopoverTrigger>
 *
 * It needs a name: `aria-label`, or `aria-labelledby` the id of a heading in
 * it. `children` is its content, or a function given `close` for a button
 * that closes it. `placement` (`"bottom"` by default), `offset` (8, the gap
 * to the trigger), `crossOffset` and `shouldFlip` are React Aria's.
 * `className` is the surface's: its width (it is as wide as its content, to
 * the screen's edge less 16dp at most), its padding (16dp).
 *
 * For a list of actions use `Menu`; for a word of help on hover, `Tooltip`;
 * for something that must be answered before going on, `ModalDialog`.
 *
 * Material 3 does not describe this component. It has menus and tooltips,
 * and no surface for any content beside a trigger. What this one borrows:
 *
 * - **The container**: https://m3.material.io/components/tooltips/specs —
 *   the rich tooltip's: `surface-container`, the medium corner, elevation
 *   level 2, and its 16dp at the sides, here on every side.
 * - **The content's colour and type**:
 *   https://m3.material.io/styles/color/roles — `on-surface`, in
 *   body-medium.
 */
export function Popover({
  className,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  offset = 8,
  ...props
}: PopoverProps) {
  return (
    <AriaPopover
      data-slot="popover"
      offset={offset}
      {...props}
      className={composeTailwindRenderProps(
        undefined,
        "max-w-[calc(100vw-2rem)] rounded-shape-medium bg-surface-container text-body-medium font-body-medium text-on-surface shadow-elevation-2",
      )}
    >
      <AriaDialog
        data-slot="popover-content"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cn("p-4 outline-hidden", className)}
      >
        {children}
      </AriaDialog>
    </AriaPopover>
  );
}
