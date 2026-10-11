"use client";

import React from "react";
import {
  MenuTrigger,
  Menu as AriaMenu,
  type Placement,
  Popover,
  MenuItem as AriaMenuItem,
} from "react-aria-components";
import { tv } from "../utils";
import MenuItem, { type MenuItemProps } from "./MenuItem";

const menuStyles = tv({
  base: "bg-surface-container-high rounded-shape-extra-small shadow-elevation-2 p-1 min-w-[112px] max-w-[280px] outline-hidden",
});

export type MenuItemType = {
  id: string;
  label: string;
  onAction?: () => void;
  /** Navigate instead of acting: the item renders as a link (`<a>`). */
  href?: string;
  leadingIcon?: MenuItemProps["leadingIcon"];
  trailingIcon?: MenuItemProps["trailingIcon"];
  shortcut?: string;
};

type MenuProps = {
  items: MenuItemType[];
  triggerButton: React.ReactNode;
  placement?: Placement;
  onOpenChange?: (isOpen: boolean) => void;
  /** Static content above the items — an account line, a title. Not focusable. */
  header?: React.ReactNode;
  /** Extra classes on the popover surface (e.g. a width). */
  className?: string;
};

const headerStyles = tv({
  base: "border-b border-outline-variant px-3 pt-2 pb-3 mb-1 text-on-surface",
});

export function Menu(props: MenuProps) {
  const {
    items,
    triggerButton,
    placement = "bottom",
    onOpenChange,
    header,
    className,
  } = props;
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      {triggerButton}
      <Popover placement={placement} className={menuStyles({ className })}>
        {header && (
          <div data-slot="menu-header" className={headerStyles()}>
            {header}
          </div>
        )}
        <AriaMenu data-slot="menu" items={items} className="outline-hidden">
          {(item) => (
            <AriaMenuItem
              data-slot="menu-item"
              key={item.id}
              id={item.id}
              onAction={item.onAction}
              href={item.href}
              className="outline-hidden"
            >
              {({ isDisabled, isFocused, isPressed }) => (
                <MenuItem
                  label={item.label}
                  leadingIcon={item.leadingIcon}
                  trailingIcon={item.trailingIcon}
                  shortcut={item.shortcut}
                  isDisabled={isDisabled}
                  isFocused={isFocused}
                  isHovered={isFocused}
                  isPressed={isPressed}
                />
              )}
            </AriaMenuItem>
          )}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

export { MenuItem };
export type { MenuItemProps };
