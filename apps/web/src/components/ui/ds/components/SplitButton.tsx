"use client";

import * as React from "react";
import { tv } from "../utils";
import { ChevronDownIcon, type IconComponent } from "../icons";
import Button from "./Button";
import { ButtonGroupContext, type ButtonSize } from "./ButtonGroup";
import { Menu, type MenuItemType } from "./Menu";

const styles = tv({
  slots: {
    base: "inline-flex items-stretch gap-0.5",
    // The trailing icon turns over while the menu is open.
    chevron:
      "transition-transform duration-short-4 ease-standard group-aria-expanded/button:rotate-180",
  },
});

/** The halves' side padding, `md.comp.split-button.<size>.leading-button.*`
 *  and `.trailing-button.*`. */
const leadingPadding: Record<ButtonSize, string> = {
  xsmall: "ps-3 pe-[10px]",
  small: "ps-4 pe-3",
  medium: "px-6",
  large: "px-12",
  xlarge: "px-16",
};
const trailingPadding: Record<ButtonSize, string> = {
  xsmall: "px-[13px]",
  small: "px-[13px]",
  medium: "px-[15px]",
  large: "px-[29px]",
  xlarge: "px-[43px]",
};

/** `md.comp.split-button.<size>.trailing-button.icon.size`. */
const chevronSizes: Record<ButtonSize, number> = {
  xsmall: 22,
  small: 22,
  medium: 26,
  large: 38,
  xlarge: 50,
};

export type SplitButtonProps = {
  /** Material's four styles for a split button; it has no text style.
   *  Default `filled`. */
  variant?: "elevated" | "filled" | "tonal" | "outlined";
  /** Material's five sizes, as `Button`'s. Default `small`. */
  size?: ButtonSize;
  /** The leading button's label. */
  children?: React.ReactNode;
  /** The leading button's icon. With no children, give `aria-label`. */
  icon?: IconComponent;
  /** The leading button's own name, where it shows an icon alone. */
  "aria-label"?: string;
  onPress?: () => void;
  isDisabled?: boolean;
  /** The trailing button's name: the options it opens ("More watch
   *  options"). Required: the trailing button shows an icon alone. */
  menuLabel: string;
  /** The menu's items, as `Menu`'s. */
  items: MenuItemType[];
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
  /** Classes for the named parts. */
  classNames?: { leading?: string; trailing?: string; menu?: string };
};

/**
 * MD3 split button: a leading button for the main action and a trailing
 * button that opens a menu of related ones, 2dp apart.
 *
 * Both halves are the kit's `Button`, in its elevated, filled (default),
 * tonal or outlined style and its five sizes; the trailing one is the
 * trigger of the kit's `Menu`, opened 4dp below it ("The menu should be 4dp
 * from the split button"). Tab reaches the leading button, then the trailing
 * one; Space or Enter activates either. The trailing button carries
 * `aria-haspopup` and `aria-expanded`, and its own name (`menuLabel`), as
 * Material's accessibility page asks; the menu is React Aria's (arrow keys,
 * Escape back to the trailing button).
 *
 * Specs (`md.comp.split-button.<size>.*`): outer corners full; inner corners
 * 4/4/4/8/12dp, 8/12/12/20/20dp hovered, focused and pressed; while the menu
 * is open the trailing button's inner corner is full and its icon turns
 * over. The trailing button's side padding is 13/13/15/29/43dp round a
 * 22/22/26/38/50dp icon; the leading one's is the button's, but 10 and 12dp
 * on the inner side at `xsmall` and `small`. Colours, states and the
 * disabled look are `Button`'s.
 *
 * The root is `data-slot="split-button"` with `data-variant` and
 * `data-size`. The halves are `data-slot="button"`, reached with
 * `classNames.leading` and `classNames.trailing`; the menu's surface with
 * `classNames.menu`.
 *
 * Deviations, by name:
 * - **Shape motion** eases with `ease-standard` over `duration-short-4`, not
 *   Material's spring.
 * - **Selected icon.** Material centres the trailing icon while the menu is
 *   open; here it stays centred throughout, its padding being even.
 *
 * Spec: https://m3.material.io/components/split-button/{overview,specs,guidelines,accessibility}
 */
export function SplitButton(props: SplitButtonProps) {
  const {
    variant = "filled",
    size = "small",
    children,
    icon,
    onPress,
    isDisabled,
    menuLabel,
    items,
    onOpenChange,
    className,
    classNames,
  } = props;
  const { base, chevron } = styles();
  const context = React.useMemo(
    () => ({ variant: "split" as const, size }),
    [size],
  );
  const Chevron = React.useMemo(() => {
    const iconSize = chevronSizes[size];
    function SplitChevron({ className }: { className?: string }) {
      return <ChevronDownIcon size={iconSize} className={className} />;
    }
    return SplitChevron;
  }, [size]);

  return (
    <div
      data-slot="split-button"
      data-variant={variant}
      data-size={size}
      className={base({ className })}
    >
      <ButtonGroupContext.Provider value={context}>
        <Button
          variant={variant}
          icon={icon}
          onPress={onPress}
          isDisabled={isDisabled}
          aria-label={props["aria-label"]}
          className={`${leadingPadding[size]} ${classNames?.leading ?? ""}`}
        >
          {children}
        </Button>
        <Menu
          items={items}
          placement="bottom end"
          offset={4}
          onOpenChange={onOpenChange}
          className={classNames?.menu}
          triggerButton={
            <Button
              variant={variant}
              icon={Chevron}
              isDisabled={isDisabled}
              aria-label={menuLabel}
              className={`${trailingPadding[size]} ${classNames?.trailing ?? ""}`}
              classNames={{ icon: chevron() }}
            />
          }
        />
      </ButtonGroupContext.Provider>
    </div>
  );
}

export default SplitButton;
