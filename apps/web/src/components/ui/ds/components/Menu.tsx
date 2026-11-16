"use client";

import React from "react";
import {
  MenuTrigger,
  Menu as AriaMenu,
  type Placement,
  Popover,
  MenuItem as AriaMenuItem,
  Separator,
  type Selection,
} from "react-aria-components";
import { CheckIcon } from "../icons";
import { tv } from "../utils";
import MenuItem, { type MenuItemProps } from "./MenuItem";

export const menuStyles = tv({
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
  /** Unavailable for now: drawn at 38%, skipped by the arrow keys, never
   *  pressed. Keep such an item in the menu when it tells the user the action
   *  exists; leave it out when it never applies. */
  isDisabled?: boolean;
  type?: never;
};

/** A 1dp line between two groups of items. It takes an `id` like any entry,
 *  and is neither focused nor announced as an item. */
export type MenuDividerType = {
  id: string;
  type: "divider";
};

type MenuProps = {
  /** The rows, in order: items, and dividers between groups of them. */
  items: (MenuItemType | MenuDividerType)[];
  /** Makes the items choices instead of actions: `"single"` keeps one
   *  selected (announced as radio items, and choosing closes the menu),
   *  `"multiple"` any number (checkbox items, and the menu stays open until
   *  it is dismissed, as Material asks). A selected row takes the selected
   *  container and a trailing check. Left out, items are actions. */
  selectionMode?: "single" | "multiple";
  /** The selected items' ids, controlled. */
  selectedKeys?: Iterable<string>;
  /** The selected items' ids at first, uncontrolled. The menu keeps the
   *  selection itself from then on, closed or open. */
  defaultSelectedKeys?: Iterable<string>;
  onSelectionChange?: (keys: Selection) => void;
  /** Keeps a selection from being emptied: pressing the selected item of a
   *  single choice then leaves it selected. For a choice that always has a
   *  value, such as a page size or a sort order. */
  disallowEmptySelection?: boolean;
  triggerButton: React.ReactNode;
  placement?: Placement;
  /** The space between the trigger and the menu, in pixels. Left out, React
   *  Aria's default. */
  offset?: number;
  onOpenChange?: (isOpen: boolean) => void;
  /** Static content above the items — an account line, a title. Not focusable. */
  header?: React.ReactNode;
  /** Extra classes on the popover surface (e.g. a width). */
  className?: string;
};

const headerStyles = tv({
  base: "border-b border-outline-variant px-3 pt-2 pb-3 mb-1 text-on-surface",
});

// Menus spec: divider 1dp, 8dp above and below, as wide as the container
// (the -mx-1 takes back the menu's own 4dp padding).
const dividerStyles = tv({
  base: "-mx-1 my-2 h-px border-0 bg-outline-variant",
});

/**
 * One entry of a menu, as a row or a divider: what `Menu` and `ContextMenu`
 * both draw inside React Aria's `Menu`. Not a component: a collection is
 * built from what its function returns.
 */
export function menuRow(
  item: MenuItemType | MenuDividerType,
  staysOpen: boolean,
) {
  return item.type === "divider" ? (
    <Separator
      data-slot="menu-divider"
      id={item.id}
      className={dividerStyles()}
    />
  ) : (
    <AriaMenuItem
      data-slot="menu-item"
      key={item.id}
      id={item.id}
      onAction={item.onAction}
      href={item.href}
      isDisabled={item.isDisabled}
      // Material: a multi-select menu stays open until the person dismisses
      // it. Left to itself, React Aria closes it on Enter.
      {...(staysOpen ? { shouldCloseOnSelect: false } : {})}
      // `group`: MenuItem's state layer reads this element's
      // `data-focus-visible` and `data-pressed`. Without it a row reached by
      // the arrow keys shows no focus at all.
      className="group outline-hidden"
    >
      {({ isDisabled, isSelected }) => (
        <MenuItem
          label={item.label}
          leadingIcon={item.leadingIcon}
          // The check is the second cue beside the container colour, as in
          // `SelectItem`.
          trailingIcon={
            isSelected ? <CheckIcon size={24} /> : item.trailingIcon
          }
          shortcut={item.shortcut}
          isDisabled={isDisabled}
          isSelected={isSelected}
        />
      )}
    </AriaMenuItem>
  );
}

/**
 * MD3 menu: a trigger and the popover list of `MenuItem`s it opens, on React
 * Aria `MenuTrigger`.
 *
 *   <Menu
 *     triggerButton={<IconButton aria-label="More" icon={MoreIcon} />}
 *     items={[
 *       { id: "edit", label: "Edit", onAction: edit },
 *       { id: "share", label: "Share", isDisabled: true },
 *       { id: "d1", type: "divider" },
 *       { id: "delete", label: "Delete", onAction: remove },
 *     ]}
 *   />
 *
 * `items` is data: an item is `id`, `label`, then `onAction` or `href`,
 * `leadingIcon`, `trailingIcon`, `shortcut`, `isDisabled`; a divider is
 * `{ id, type: "divider" }`. With `selectionMode` the items are choices
 * (`selectedKeys` / `defaultSelectedKeys`, `onSelectionChange`), as for a
 * sort order or a page size. `triggerButton` is any pressable kit component,
 * `header` static content above the items, `placement` and `offset` where
 * the popover sits, `className` extra classes on its surface.
 *
 * Material describes no destructive item, and the kit draws none: confirm a
 * destructive action in a dialog.
 *
 * Deviation: Material lets a disabled item take focus. React Aria's menu
 * passes it, and so does this one.
 *
 * Spec: https://m3.material.io/components/menus/{overview,specs,guidelines,accessibility}
 */
export function Menu(props: MenuProps) {
  const {
    items,
    triggerButton,
    placement = "bottom",
    offset,
    onOpenChange,
    header,
    className,
    selectionMode,
    selectedKeys,
    defaultSelectedKeys,
    onSelectionChange,
    disallowEmptySelection,
  } = props;
  // The list is unmounted while the menu is closed, so a selection React
  // Aria held inside it would be lost at every close. Uncontrolled, it is
  // held here.
  const [ownKeys, setOwnKeys] = React.useState<Selection>(
    () => new Set(defaultSelectedKeys ?? []),
  );

  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      {triggerButton}
      <Popover
        placement={placement}
        {...(offset !== undefined ? { offset } : {})}
        className={menuStyles({ className })}
      >
        {header && (
          <div data-slot="menu-header" className={headerStyles()}>
            {header}
          </div>
        )}
        <AriaMenu
          data-slot="menu"
          items={items}
          className="outline-hidden"
          {...(selectionMode
            ? {
                selectionMode,
                disallowEmptySelection,
                selectedKeys: selectedKeys ?? ownKeys,
                onSelectionChange: (keys: Selection) => {
                  setOwnKeys(keys);
                  onSelectionChange?.(keys);
                },
              }
            : {})}
        >
          {(item) => menuRow(item, selectionMode === "multiple")}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

export { MenuItem };
export type { MenuItemProps, MenuProps };
