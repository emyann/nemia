"use client";

import { type ReactNode } from "react";
import {
  Toolbar as AriaToolbar,
  type ToolbarProps as AriaToolbarProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

/**
 * Material 3 toolbar: a row (or a column) of the actions that belong to the
 * current page, docked to the bottom of the window or floating over the
 * content, optionally beside a FAB.
 *
 *   <Toolbar aria-label="Message">                       docked, standard
 *     <IconButton variant="standard" icon={Archive} aria-label="Archive" />
 *     …
 *   </Toolbar>
 *   <Toolbar variant="floating" color="vibrant"          floating, vibrant,
 *            fab={<Button variant="fab" icon={Plus} aria-label="New" />}>  FAB
 *     …
 *   </Toolbar>
 *
 * Spec: https://m3.material.io/components/toolbars/overview · .../specs ·
 * .../guidelines · .../accessibility
 *
 * **The two variants** (`md.comp.toolbar.{docked,floating}.*`):
 *
 * - **docked** (default) spans its container's width, 64dp high, square, on
 *   `surface-container`, with 16dp at each end. Its items are spaced evenly
 *   in a compact window and centred, 32dp apart, from a medium one (600dp)
 *   up, as the adaptive guidelines show. It replaces the baseline bottom app
 *   bar, which Material no longer recommends and the kit does not ship.
 * - **floating** is only as wide as its items, 64dp high (64dp wide when
 *   `orientation="vertical"`), fully rounded at elevation 3, with 8dp at
 *   each end and 4dp between items. Keep it 16dp from the window's edge
 *   (24dp when vertical); the margin is the layout's, not the toolbar's.
 *
 * **The two colours** (`color`): `standard` is `surface-container` with
 * `on-surface-variant` icons and a selected toggle on `secondary-container`;
 * `vibrant` is `primary-container` with `on-primary-container` icons and a
 * selected toggle on `surface-container` / `on-surface`. The toolbar paints
 * them onto the kit's own children by their slots: a `standard` `IconButton`
 * (its icon, its state layer, its selected container) and a `text` `Button`
 * (its label), so a child needs no colour props. Filled and tonal buttons
 * keep their own colours, which is how the guidelines emphasise one action.
 * A disabled child keeps the kit's `on-surface` at 38 %.
 *
 * **`fab`** sets a FAB 8dp after a floating toolbar
 * (`md.comp.toolbar.floating.fab.*`): pass the kit's `Button variant="fab"`,
 * and the toolbar draws it at Material's toolbar FAB, `secondary-container`
 * beside a standard toolbar and `tertiary-container` beside a vibrant one,
 * with large corners at elevation 1. It is outside the `toolbar` role, a tab
 * stop of its own.
 *
 * **Behaviour** is React Aria's `Toolbar`: the `toolbar` role (the
 * accessibility page's "on web, use the toolbar role"), `aria-orientation`,
 * and the arrow keys between its controls (Up and Down when vertical). Give
 * it an `aria-label` when a page has more than one.
 *
 * Deviations:
 * - **Tab.** Material's keyboard table reads "Tab or Arrows" between the
 *   controls. React Aria's toolbar is the WAI-ARIA toolbar: the arrows move
 *   between its controls and Tab leaves it, so the toolbar is one stop in the
 *   tab order, and Tab comes back to the control last focused.
 * - **Scrolling.** Hiding or collapsing on scroll needs a scroll container
 *   the kit does not own, as with `TopAppBar`.
 */
const styles = tv({
  slots: {
    base: "flex items-center",
    group: "inline-flex items-center gap-2",
    fab: [
      // `…floating.fab.{standard,vibrant}.container.color`, `…container.shape`
      // (large) and `…container.elevation` (level 1), over the kit's FAB.
      "contents",
      "[&_[data-slot=button]]:rounded-shape-large [&_[data-slot=button]]:shadow-elevation-1 [&_[data-slot=button]:hover]:shadow-elevation-2",
    ],
  },
  variants: {
    variant: {
      docked: {
        // `…docked.container.{height,leading-space,trailing-space,min-spacing,
        // max-spacing}`, square.
        base: "h-16 w-full justify-evenly gap-1 px-4 min-[600px]:justify-center min-[600px]:gap-8",
      },
      floating: {
        // `…floating.container.{height,shape,elevation,leading-space,
        // between-space}`.
        base: "inline-flex gap-1 rounded-shape-full shadow-elevation-3",
      },
    },
    orientation: {
      horizontal: {},
      vertical: { base: "flex-col", group: "flex-col" },
    },
    color: {
      standard: {
        base: [
          "bg-surface-container text-on-surface-variant",
          // A selected standard toggle: `…standard.selected.button.container
          // .color` and `…selected.icon.color`, and its state layer.
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]:not([data-disabled])]:bg-secondary-container",
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]:not([data-disabled])_[data-slot=icon-button-icon]]:text-on-secondary-container",
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]_[data-slot=state-layer]]:bg-on-secondary-container",
        ],
        fab: "[&_[data-slot=button]]:bg-secondary-container [&_[data-slot=button]]:text-on-secondary-container [&_[data-slot=button]_*]:text-on-secondary-container [&_[data-slot=button]_[data-slot=state-layer]]:bg-on-secondary-container",
      },
      vibrant: {
        base: [
          "bg-primary-container text-on-primary-container",
          // `…vibrant.icon.color` and its hover, focus and pressed layer.
          "[&_[data-slot=icon-button][data-variant=standard]:not([data-disabled])_[data-slot=icon-button-icon]]:text-on-primary-container",
          "[&_[data-slot=icon-button][data-variant=standard]_[data-slot=state-layer]]:bg-on-primary-container",
          // `…vibrant.selected.button.container.color`, `…selected.icon.color`.
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]:not([data-disabled])]:bg-surface-container",
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]:not([data-disabled])_[data-slot=icon-button-icon]]:text-on-surface",
          "[&_[data-slot=icon-button][data-variant=standard][data-selected]_[data-slot=state-layer]]:bg-on-surface",
          // `…vibrant.label-text.color` on a text button.
          "[&_[data-slot=button][data-variant=text]:not([data-disabled])]:text-on-primary-container [&_[data-slot=button][data-variant=text]:not([data-disabled])_*]:text-on-primary-container",
          "[&_[data-slot=button][data-variant=text]_[data-slot=state-layer]]:bg-on-primary-container",
        ],
        fab: "[&_[data-slot=button]]:bg-tertiary-container [&_[data-slot=button]]:text-on-tertiary-container [&_[data-slot=button]_*]:text-on-tertiary-container [&_[data-slot=button]_[data-slot=state-layer]]:bg-on-tertiary-container",
      },
    },
  },
  compoundVariants: [
    { variant: "floating", orientation: "horizontal", class: { base: "h-16 px-2" } },
    // `…floating.vertical.container.width`.
    { variant: "floating", orientation: "vertical", class: { base: "w-16 py-2" } },
  ],
  defaultVariants: {
    variant: "docked",
    orientation: "horizontal",
    color: "standard",
  },
});

export type ToolbarProps = AriaToolbarProps & {
  /** `docked` spans the bottom of the window; `floating` floats over it. */
  variant?: "docked" | "floating";
  /** `standard` (default) for low emphasis; `vibrant` draws attention. */
  color?: "standard" | "vibrant";
  /** A floating toolbar's FAB, set 8dp after it: the kit's `Button
      variant="fab"`. */
  fab?: ReactNode;
};

export function Toolbar({
  variant = "docked",
  color = "standard",
  orientation = "horizontal",
  fab,
  className,
  ...props
}: ToolbarProps) {
  const s = styles({ variant, color, orientation });

  const toolbar = (
    <AriaToolbar
      data-slot="toolbar"
      data-variant={variant}
      data-color={color}
      orientation={orientation}
      {...props}
      className={composeTailwindRenderProps(className, s.base())}
    />
  );

  if (fab === undefined || fab === null) return toolbar;

  // `…floating.fab.between-space`: 8dp between the toolbar and its FAB.
  return (
    <div data-slot="toolbar-group" className={s.group()}>
      {toolbar}
      <div data-slot="toolbar-fab" className={s.fab()}>
        {fab}
      </div>
    </div>
  );
}

export default Toolbar;
