"use client";

import * as React from "react";
import { Button as AriaButton } from "react-aria-components";
import { focusRing, tv } from "../utils";
import { type IconComponent, XIcon } from "../icons";

const styles = tv({
  slots: {
    // DOM order is the focus order Material gives (the FAB, then the items
    // from the top); the column is reversed so the items stand above it.
    base: "relative inline-flex flex-col-reverse items-end gap-2",
    fab: [
      focusRing(),
      "group/fab relative inline-flex shrink-0 items-center justify-center rounded-shape-full shadow-elevation-3 transition-all duration-short-4 ease-standard hover:shadow-elevation-4",
    ],
    list: "flex flex-col items-end gap-1",
    item: [
      focusRing(),
      "group/item relative inline-flex h-14 items-center gap-2 rounded-shape-full px-6 shadow-none transition-shadow duration-short-4 ease-standard",
      "text-title-medium font-title-medium",
      "hover:shadow-elevation-4 data-focus-visible:shadow-elevation-3 data-pressed:shadow-elevation-3",
    ],
    stateLayer:
      "absolute inset-0 rounded-[inherit] pointer-events-none opacity-0 transition-opacity",
    icon: "relative inline-flex shrink-0",
    label: "relative whitespace-nowrap",
  },
  variants: {
    color: {
      primary: {
        fab: "bg-primary text-on-primary",
        item: "bg-primary-container text-on-primary-container",
      },
      secondary: {
        fab: "bg-secondary text-on-secondary",
        item: "bg-secondary-container text-on-secondary-container",
      },
      tertiary: {
        fab: "bg-tertiary text-on-tertiary",
        item: "bg-tertiary-container text-on-tertiary-container",
      },
    },
    // The FAB it opens from; open, it is the 56dp close button.
    fabSize: {
      small: { fab: "w-10 h-10" },
      medium: { fab: "w-14 h-14" },
      large: { fab: "w-24 h-24" },
    },
    isOpen: {
      true: { fab: "w-14 h-14" },
    },
  },
  defaultVariants: { color: "primary", fabSize: "medium" },
});

// The layers, by colour and part: whole class names, for Tailwind.
const fabLayer = {
  primary: "bg-on-primary",
  secondary: "bg-on-secondary",
  tertiary: "bg-on-tertiary",
} as const;
const itemLayer = {
  primary: "bg-on-primary-container",
  secondary: "bg-on-secondary-container",
  tertiary: "bg-on-tertiary-container",
} as const;
const fabStates =
  "group-hover/fab:state-opacity-hover group-data-focus-visible/fab:state-opacity-focus group-data-pressed/fab:state-opacity-pressed";
const itemStates =
  "group-hover/item:state-opacity-hover group-data-focus-visible/item:state-opacity-focus group-data-pressed/item:state-opacity-pressed";

/** The FAB's icon by size; the close button's is 20dp. */
const fabIconSizes = { small: 24, medium: 24, large: 36 } as const;

export type FabMenuItem = {
  id: string;
  label: string;
  icon?: IconComponent;
  onAction?: () => void;
};

export type FabMenuProps = {
  /** The FAB's name, describing the menu it opens ("Create"). */
  "aria-label": string;
  /** The FAB's icon; open, it is a close icon. */
  icon: IconComponent;
  /** Two to six related actions, each with a label (Material). */
  items: FabMenuItem[];
  /** Material's three colour sets; match the FAB's colour style. Default
   *  `primary`. */
  color?: "primary" | "secondary" | "tertiary";
  /** The size of the FAB it opens from. Default `medium` (56dp). */
  fabSize?: "small" | "medium" | "large";
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
  /** Classes for the named parts. */
  classNames?: { fab?: string; list?: string; item?: string };
};

/**
 * MD3 FAB menu: a FAB that opens two to six related actions above it, and
 * turns into their close button.
 *
 * Built as a disclosure of buttons, as Material's accessibility page
 * describes it: the FAB is a React Aria `Button` with `aria-expanded` and
 * `aria-controls`, named for the menu it opens. Opening keeps focus on it
 * ("initial focus remains on the close button, which takes the place of the
 * original FAB"); Tab then moves through the items from the top, each a
 * button named by its label. Space or Enter activates the focused button: an
 * item fires its action and closes the menu, focus going back to the FAB.
 *
 * Specs (`md.comp.fab-menu.*`): the close button is 56dp round at elevation
 * 3 (4 hovered), its icon 20dp, 8dp above it the items, 4dp apart. Each item
 * is 56dp tall, round, hugging its label: 24dp side padding, a 24dp icon,
 * 8dp to a `title-medium` label, no elevation (4 hovered, 3 focused and
 * pressed). `color`: the close button is `<color>` on `on-<color>`, the items
 * `<color>-container` on `on-<color>-container`. Place the menu at the
 * window's trailing edge (`fixed bottom-4 end-4`): it grows upwards.
 *
 * The root is `data-slot="fab-menu"` with `data-color` and `data-state`
 * (`open`, `closed`); the parts are `fab-menu-fab`, `fab-menu-list` and
 * `fab-menu-item`, reached with `classNames`.
 *
 * Deviations, by name:
 * - **Escape** closes the menu and returns focus to the FAB; a press outside
 *   it closes it too. The kit's additions: Material's page lists Tab, Space
 *   and Enter.
 * - **Web menu.** Material's web guidance opens a menu component from the
 *   FAB on large windows; this is the FAB menu itself, at every width (use
 *   `Menu` with a FAB trigger where a page wants the other).
 * - **Motion.** The FAB's change into the close button eases its size; the
 *   items appear without Material's enter and exit transition.
 * - **Scrolling.** Items that do not fit are not scrolled behind the close
 *   button: keep to six.
 * - **Close button anchor.** A small or large FAB's close button takes its
 *   bottom trailing corner, not its top one.
 *
 * Spec: https://m3.material.io/components/fab-menu/{overview,specs,guidelines,accessibility}
 */
export function FabMenu(props: FabMenuProps) {
  const {
    icon: Icon,
    items,
    color = "primary",
    fabSize = "medium",
    isOpen: isOpenProp,
    defaultOpen = false,
    onOpenChange,
    className,
    classNames,
  } = props;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = isOpenProp ?? ownOpen;
  const setOpen = React.useCallback(
    (open: boolean) => {
      setOwnOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );
  const listId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const fabRef = React.useRef<HTMLButtonElement>(null);

  // A press outside the open menu closes it.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, setOpen]);

  const close = () => {
    setOpen(false);
    fabRef.current?.focus();
  };

  const s = styles({ color, fabSize, isOpen });
  const FabIcon = isOpen ? XIcon : Icon;

  return (
    <div
      ref={rootRef}
      data-slot="fab-menu"
      data-color={color}
      data-state={isOpen ? "open" : "closed"}
      className={s.base({ className })}
      onKeyDown={(event) => {
        if (isOpen && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <AriaButton
        ref={fabRef}
        data-slot="fab-menu-fab"
        aria-label={props["aria-label"]}
        aria-expanded={isOpen}
        aria-controls={listId}
        onPress={() => setOpen(!isOpen)}
        className={s.fab({ className: classNames?.fab })}
      >
        <span className={s.stateLayer({ className: `${fabLayer[color]} ${fabStates}` })} />
        <span className={s.icon()}>
          <FabIcon size={isOpen ? 20 : fabIconSizes[fabSize]} />
        </span>
      </AriaButton>
      <div
        id={listId}
        role="group"
        aria-label={props["aria-label"]}
        data-slot="fab-menu-list"
        hidden={!isOpen}
        className={s.list({ className: classNames?.list })}
      >
        {isOpen &&
          items.map(({ id, label, icon: ItemIcon, onAction }) => (
            <AriaButton
              key={id}
              data-slot="fab-menu-item"
              onPress={() => {
                onAction?.();
                close();
              }}
              className={s.item({ className: classNames?.item })}
            >
              <span
                className={s.stateLayer({ className: `${itemLayer[color]} ${itemStates}` })}
              />
              {ItemIcon && (
                <span className={s.icon()}>
                  <ItemIcon size={24} />
                </span>
              )}
              <span className={s.label()}>{label}</span>
            </AriaButton>
          ))}
      </div>
    </div>
  );
}

export default FabMenu;
