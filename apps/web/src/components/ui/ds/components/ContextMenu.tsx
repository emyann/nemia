"use client";

import { useRef, useState, type ReactNode } from "react";
import { Menu as AriaMenu, Popover } from "react-aria-components";

import {
  menuRow,
  menuStyles,
  type MenuDividerType,
  type MenuItemType,
} from "./Menu";

type ContextMenuItems = (MenuItemType | MenuDividerType)[];

export type ContextMenuProps = {
  /** The menu's entries, as `Menu` takes them: items and dividers. Or a
   *  function of what the menu was asked for on, to give each row of a list
   *  its own entries from one area: `(target) => itemsFor(target.closest("[data-key]"))`.
   *  Returning an empty list leaves the browser's own menu. */
  items: ContextMenuItems | ((target: Element) => ContextMenuItems);
  /** The menu's name for a screen reader. */
  "aria-label": string;
  /** The area the menu is asked for on. */
  children: ReactNode;
  /** Classes for the area. It is a `div`: lay it out as what it wraps needs. */
  className?: string;
};

/**
 * A menu asked for on something itself, where it is: the actions of a file,
 * of a row, of a selection. It wraps an area and opens the kit's `Menu`
 * rows at the pointer on a right click, on a long press on Android, and
 * from the keyboard with the Menu key or Shift+F10, where it opens at the
 * focused element.
 *
 *   <ContextMenu
 *     aria-label="File actions"
 *     items={[
 *       { id: "rename", label: "Rename", onAction: rename },
 *       { id: "move", label: "Move to…", onAction: move },
 *       { id: "d", type: "divider" },
 *       { id: "delete", label: "Delete", onAction: remove },
 *     ]}
 *   >
 *     <FileCard file={file} />
 *   </ContextMenu>
 *
 * **It is never the only way to an action.** Nothing on screen says it is
 * there, iOS has no long press for it, and macOS has no key for it. Give
 * the same entries a place a person can see: a `Menu` on an icon button in
 * the row, a toolbar that follows the selection.
 *
 * `items` is `Menu`'s (`isDisabled`, `href`, icons, a `shortcut`, dividers).
 * As a function it is given the element the menu was asked for on, so one
 * area around a list serves every row. The arrow keys move through the
 * entries, Escape closes the menu, and the focus goes back to where it was.
 *
 * Material 3 does not describe this component. It describes the menu and
 * not the way of asking for it: the menu here is Material's
 * (https://m3.material.io/components/menus/specs), drawn as the kit's
 * `Menu` draws it, and its guidelines place a menu "in context", next to
 * what it acts on (https://m3.material.io/components/menus/guidelines).
 */
export function ContextMenu({
  items,
  "aria-label": ariaLabel,
  children,
  className,
}: ContextMenuProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState<{
    x: number;
    y: number;
    entries: ContextMenuItems;
  } | null>(null);

  return (
    <div
      data-slot="context-menu-area"
      className={className}
      onContextMenu={(e) => {
        const target = e.target as Element;
        const entries = typeof items === "function" ? items(target) : items;
        if (entries.length === 0) return;
        e.preventDefault();
        // From the keyboard (the Menu key, Shift+F10) the event has no
        // pointer: browsers report no button, and the middle of the focused
        // element or no place at all. The menu then opens under the start of
        // that element, where a menu opens under its trigger.
        const fromKeyboard =
          e.button === -1 || (e.clientX === 0 && e.clientY === 0);
        const box = target.getBoundingClientRect();
        setOpen({
          x: fromKeyboard ? box.left : e.clientX,
          y: fromKeyboard ? box.bottom : e.clientY,
          entries,
        });
      }}
    >
      {children}
      <span
        ref={anchor}
        aria-hidden
        style={{
          position: "fixed",
          left: open?.x ?? 0,
          top: open?.y ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <Popover
        triggerRef={anchor}
        isOpen={open !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(null);
        }}
        placement="bottom start"
        offset={0}
        className={menuStyles()}
      >
        <AriaMenu
          data-slot="menu"
          aria-label={ariaLabel}
          autoFocus="first"
          items={open?.entries ?? []}
          onClose={() => setOpen(null)}
          className="outline-hidden"
        >
          {(item) => menuRow(item, false)}
        </AriaMenu>
      </Popover>
    </div>
  );
}
