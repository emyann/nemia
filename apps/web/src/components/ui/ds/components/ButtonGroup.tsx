"use client";

import * as React from "react";
import {
  Toolbar,
  type ToolbarProps,
  ToggleButtonGroup,
  type ToggleButtonGroupProps,
} from "react-aria-components";
import { tv } from "../utils";

/** Material's five button sizes, shared by `Button`, `IconButton`, the
 *  button group and the split button. */
export type ButtonSize = "xsmall" | "small" | "medium" | "large" | "xlarge";

export type ButtonGroupContextValue = {
  /** `split` is the `SplitButton`'s two halves. */
  variant: "standard" | "connected" | "split";
  size?: ButtonSize;
};

/** What a `ButtonGroup` (and a `SplitButton`) hands its buttons: the group's
 *  variant, and its size where it sets one. `null` outside a group. */
export const ButtonGroupContext =
  React.createContext<ButtonGroupContextValue | null>(null);

/**
 * A button's corners in a connected group, by size
 * (`md.comp.button-group.connected.<size>.*`): the outer corners full, the
 * inner ones 8/8/8/16/20dp, 4/4/4/12/16dp pressed, and full (Material's 50%)
 * selected. Inner and outer are read from the button's place among its
 * siblings (`:first-child`, `:last-child`), so a group's buttons are its
 * direct children. Connected buttons share the group's width, never under
 * 48dp. Written out per size: Tailwind sees only whole class names.
 */
export const connectedItemStyles: Record<ButtonSize, string> = {
  xsmall:
    "flex-1 min-w-12 rounded-shape-full not-first:rounded-s-shape-small not-last:rounded-e-shape-small not-first:data-pressed:rounded-s-shape-extra-small not-last:data-pressed:rounded-e-shape-extra-small not-first:data-selected:not-data-pressed:rounded-s-shape-full not-last:data-selected:not-data-pressed:rounded-e-shape-full",
  small:
    "flex-1 min-w-12 rounded-shape-full not-first:rounded-s-shape-small not-last:rounded-e-shape-small not-first:data-pressed:rounded-s-shape-extra-small not-last:data-pressed:rounded-e-shape-extra-small not-first:data-selected:not-data-pressed:rounded-s-shape-full not-last:data-selected:not-data-pressed:rounded-e-shape-full",
  medium:
    "flex-1 min-w-12 rounded-shape-full not-first:rounded-s-shape-small not-last:rounded-e-shape-small not-first:data-pressed:rounded-s-shape-extra-small not-last:data-pressed:rounded-e-shape-extra-small not-first:data-selected:not-data-pressed:rounded-s-shape-full not-last:data-selected:not-data-pressed:rounded-e-shape-full",
  large:
    "flex-1 min-w-12 rounded-shape-full not-first:rounded-s-shape-large not-last:rounded-e-shape-large not-first:data-pressed:rounded-s-shape-medium not-last:data-pressed:rounded-e-shape-medium not-first:data-selected:not-data-pressed:rounded-s-shape-full not-last:data-selected:not-data-pressed:rounded-e-shape-full",
  xlarge:
    "flex-1 min-w-12 rounded-shape-full not-first:rounded-s-shape-large-increased not-last:rounded-e-shape-large-increased not-first:data-pressed:rounded-s-shape-large not-last:data-pressed:rounded-e-shape-large not-first:data-selected:not-data-pressed:rounded-s-shape-full not-last:data-selected:not-data-pressed:rounded-e-shape-full",
};

/**
 * A split button's halves, by size (`md.comp.split-button.<size>.*`): outer
 * corners full, inner ones 4/4/4/8/12dp, and 8/12/12/20/20dp hovered,
 * focused and pressed. The trailing half's inner corner turns full while
 * its menu is open (`aria-expanded`). Leading and trailing are read from
 * `:first-child` and `:last-child`.
 */
export const splitItemStyles: Record<ButtonSize, string> = {
  xsmall:
    "rounded-shape-full not-last:rounded-e-shape-extra-small not-first:rounded-s-shape-extra-small not-last:hover:rounded-e-shape-small not-last:data-focus-visible:rounded-e-shape-small not-last:data-pressed:rounded-e-shape-small not-first:not-aria-expanded:hover:rounded-s-shape-small not-first:not-aria-expanded:data-focus-visible:rounded-s-shape-small not-first:not-aria-expanded:data-pressed:rounded-s-shape-small not-first:aria-expanded:rounded-s-shape-full",
  small:
    "rounded-shape-full not-last:rounded-e-shape-extra-small not-first:rounded-s-shape-extra-small not-last:hover:rounded-e-shape-medium not-last:data-focus-visible:rounded-e-shape-medium not-last:data-pressed:rounded-e-shape-medium not-first:not-aria-expanded:hover:rounded-s-shape-medium not-first:not-aria-expanded:data-focus-visible:rounded-s-shape-medium not-first:not-aria-expanded:data-pressed:rounded-s-shape-medium not-first:aria-expanded:rounded-s-shape-full",
  medium:
    "rounded-shape-full not-last:rounded-e-shape-extra-small not-first:rounded-s-shape-extra-small not-last:hover:rounded-e-shape-medium not-last:data-focus-visible:rounded-e-shape-medium not-last:data-pressed:rounded-e-shape-medium not-first:not-aria-expanded:hover:rounded-s-shape-medium not-first:not-aria-expanded:data-focus-visible:rounded-s-shape-medium not-first:not-aria-expanded:data-pressed:rounded-s-shape-medium not-first:aria-expanded:rounded-s-shape-full",
  large:
    "rounded-shape-full not-last:rounded-e-shape-small not-first:rounded-s-shape-small not-last:hover:rounded-e-shape-large-increased not-last:data-focus-visible:rounded-e-shape-large-increased not-last:data-pressed:rounded-e-shape-large-increased not-first:not-aria-expanded:hover:rounded-s-shape-large-increased not-first:not-aria-expanded:data-focus-visible:rounded-s-shape-large-increased not-first:not-aria-expanded:data-pressed:rounded-s-shape-large-increased not-first:aria-expanded:rounded-s-shape-full",
  xlarge:
    "rounded-shape-full not-last:rounded-e-shape-medium not-first:rounded-s-shape-medium not-last:hover:rounded-e-shape-large-increased not-last:data-focus-visible:rounded-e-shape-large-increased not-last:data-pressed:rounded-e-shape-large-increased not-first:not-aria-expanded:hover:rounded-s-shape-large-increased not-first:not-aria-expanded:data-focus-visible:rounded-s-shape-large-increased not-first:not-aria-expanded:data-pressed:rounded-s-shape-large-increased not-first:aria-expanded:rounded-s-shape-full",
};

/**
 * A pressed button in a standard group widens by 15% of its height
 * (`md.comp.button-group.standard.<size>.pressed.item.width.multiplier`,
 * read against a square icon button's width), through its side padding, so
 * that its neighbours move.
 */
export const standardPressedButtonStyles: Record<ButtonSize, string> = {
  xsmall: "data-pressed:px-[14.4px]",
  small: "data-pressed:px-[19px]",
  medium: "data-pressed:px-[28.2px]",
  large: "data-pressed:px-[55.2px]",
  xlarge: "data-pressed:px-[74.2px]",
};

/** The same widening for an icon button, whose width is set. */
export const standardPressedIconButtonStyles: Record<ButtonSize, string> = {
  xsmall: "data-pressed:w-[36.8px]",
  small: "data-pressed:w-[46px]",
  medium: "data-pressed:w-[64.4px]",
  large: "data-pressed:w-[110.4px]",
  xlarge: "data-pressed:w-[156.4px]",
};

const styles = tv({
  base: "flex items-center",
  variants: {
    variant: {
      // The standard group hugs its buttons; the connected one spans the
      // surface it is placed on.
      standard: "inline-flex w-fit",
      connected: "w-full gap-0.5",
    },
    // `md.comp.button-group.standard.<size>.between-space`.
    size: {
      xsmall: "",
      small: "",
      medium: "",
      large: "",
      xlarge: "",
    },
  },
  compoundVariants: [
    { variant: "standard", size: "xsmall", class: "gap-[18px]" },
    { variant: "standard", size: "small", class: "gap-3" },
    { variant: "standard", size: "medium", class: "gap-2" },
    { variant: "standard", size: "large", class: "gap-2" },
    { variant: "standard", size: "xlarge", class: "gap-2" },
  ],
  defaultVariants: { variant: "standard", size: "small" },
});

type GroupBaseProps = {
  /** The buttons' size, handed to each `Button` and `IconButton` in the
   *  group that sets none. Default `small`, Material's. */
  size?: ButtonSize;
  className?: string;
  children?: React.ReactNode;
};

type SelectionProps = Pick<
  ToggleButtonGroupProps,
  | "selectedKeys"
  | "defaultSelectedKeys"
  | "onSelectionChange"
  | "disallowEmptySelection"
  | "isDisabled"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
> & {
  id?: string;
  /** One button selected at a time (`radiogroup`), or several
   *  (`aria-pressed` per button). Each button is a toggle with an `id`. */
  selectionMode: "single" | "multiple";
};

type StandardGroupProps = GroupBaseProps & {
  variant?: "standard";
  selectionMode?: undefined;
} & Pick<
    ToolbarProps,
    "aria-label" | "aria-labelledby" | "aria-describedby"
  > & { id?: string };

export type ButtonGroupProps =
  | StandardGroupProps
  | (GroupBaseProps & SelectionProps & { variant?: "standard" })
  | (GroupBaseProps & SelectionProps & { variant: "connected" });

/**
 * MD3 button group: buttons and icon buttons that answer to each other, in
 * Material's two variants.
 *
 * - **`standard`** (default): the group hugs its buttons, with Material's
 *   space between them (18/12/8/8/8dp from `xsmall` to `xlarge`), and a
 *   pressed button widens so that its neighbours move.
 * - **`connected`**: the buttons sit 2dp apart and span the group's width,
 *   which spans its surface. Outer corners are full, inner ones follow the
 *   size, and a pressed or selected button changes only its own corners.
 *   Material files connected groups under selection: it takes
 *   `selectionMode`.
 *
 * Without `selectionMode` the group is React Aria's `Toolbar`
 * (`role="toolbar"`): the container takes no focus, Tab lands on its first
 * button, the arrow keys move between buttons, Space or Enter activates one
 * and the next Tab leaves the group, as Material's accessibility page asks.
 * With `selectionMode` it is a `ToggleButtonGroup`: `single` is a
 * `radiogroup` of radios, `multiple` a group of buttons with `aria-pressed`.
 * Its children are then `Button`s or `IconButton`s with `isToggle` and an
 * `id`. The group needs no label of its own (Material: label each button);
 * `aria-label` is taken where a page wants one.
 *
 * The group hands its `size` and its variant to each button through
 * `ButtonGroupContext`; a button's own `size` wins. The root is
 * `data-slot="button-group"` with `data-variant` and `data-size`.
 *
 * Deviations, by name:
 * - **Corners by position.** Inner and outer corners are read from
 *   `:first-child` and `:last-child`: a button wrapped in another element
 *   (a tooltip trigger's span, say) loses its place, so keep the buttons the
 *   group's direct children.
 * - **XS inner corner.** The specs page's caption gives 4dp; the token table
 *   (`md.comp.button-group.connected.xsmall.inner-corner.corner-size`) gives
 *   8dp, which is what is drawn.
 * - **Pressed width.** Material widens a pressed button by 15% of its width,
 *   on a spring (stiffness 1400, damping 0.9). Here it widens by 15% of its
 *   height (a square icon button's width) through its padding, eased with
 *   the theme's `ease-standard` over `duration-short-4`.
 * - **Overflow menu.** Material's trailing buttons "can be customized" to
 *   collapse into an overflow menu at small widths. Not built: put a `Menu`
 *   behind the group's last icon button where a page needs one.
 * - **Density.** Not built: every size is Material's default density.
 *
 * Spec: https://m3.material.io/components/button-groups/{overview,specs,guidelines,accessibility}
 */
export function ButtonGroup(props: ButtonGroupProps) {
  const { variant = "standard", size, className, children } = props;
  const context = React.useMemo(() => ({ variant, size }), [variant, size]);
  const common = {
    "data-slot": "button-group",
    "data-variant": variant,
    "data-size": size ?? "small",
    className: styles({ variant, size, className }),
  };

  const labelling = {
    id: props.id,
    "aria-label": props["aria-label"],
    "aria-labelledby": props["aria-labelledby"],
    "aria-describedby": props["aria-describedby"],
  };
  const group =
    props.selectionMode !== undefined ? (
      <ToggleButtonGroup
        {...labelling}
        {...common}
        selectionMode={props.selectionMode}
        selectedKeys={props.selectedKeys}
        defaultSelectedKeys={props.defaultSelectedKeys}
        onSelectionChange={props.onSelectionChange}
        disallowEmptySelection={props.disallowEmptySelection}
        isDisabled={props.isDisabled}
      >
        {children}
      </ToggleButtonGroup>
    ) : (
      <Toolbar {...labelling} {...common}>
        {children}
      </Toolbar>
    );

  return (
    <ButtonGroupContext.Provider value={context}>{group}</ButtonGroupContext.Provider>
  );
}

export default ButtonGroup;
