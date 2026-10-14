"use client";

import React from "react";
import {
  Button as AriaButton,
  type ButtonRenderProps as AriaButtonRenderProps,
  Link as AriaLink,
} from "react-aria-components";

import { Badge, badgeAccessibleText, type BadgeValue } from "./Badge";
import { type IconComponent } from "../icons";
import StateLayer from "../primitives/StateLayer";
import { Label } from "../primitives/Typography";
import { focusRing, tv } from "../utils";

const styles = tv({
  slots: {
    // 80dp container on `surface-container` at elevation level 2, square
    // corners, spanning the full width of its parent.
    base: "bg-surface-container shadow-elevation-2",
    list: "flex h-20 list-none items-stretch",
    // Vertical items divide the container into equal-width segments.
    item: "flex-1",
    destination: [
      focusRing(),
      "flex h-full w-full flex-col items-center justify-center gap-1 px-1",
    ],
    // The active indicator: 64×32, pill-shaped, and the box the state layer
    // is painted in. It does not clip, so a badge may reach past its edge.
    indicator:
      "relative flex h-8 w-16 shrink-0 items-center justify-center rounded-shape-full transition-colors duration-short-4",
    // The icon's 24dp box, which a badge is anchored on.
    iconBox: "relative flex",
    icon: "transition-colors duration-short-4",
    // Never truncated: at large text sizes the label wraps and the bar grows.
    label: "w-full text-center transition-colors duration-short-4",
  },
  variants: {
    isActive: {
      true: {
        indicator: "bg-secondary-container",
        icon: "text-on-secondary-container",
        // Active label: `on-surface` at the prominent (bold) weight, so the
        // selection is carried by more than colour alone.
        label: "font-bold text-on-surface",
      },
      false: {
        icon: "text-on-surface-variant",
        label: "text-on-surface-variant",
      },
    },
  },
  defaultVariants: {
    isActive: false,
  },
});

export type NavigationItem = {
  /** Stable id — also the key `onSelectionChange` reports. */
  id: string;
  /** Visible text under the icon. One or two words; never truncated. */
  label: string;
  icon: IconComponent;
  /**
   * Rendered while the destination is active. Material wants a *filled* icon
   * there; the kit takes icons structurally and ships none, so pass the filled
   * member of your set. Without it the indicator alone marks the selection.
   */
  activeIcon?: IconComponent;
  /** With `href` the destination is a link (`<a>`); without it, a button. */
  href?: string;
  /**
   * Overrides the accessible name when the visible label is ambiguous
   * ("Library" → "Music library"). Defaults to the visible label.
   */
  ariaLabel?: string;
  /**
   * A badge on the icon: a count (`3`, shown as "999+" above 999), a short
   * status, or `true` for the small dot. 0 draws nothing. It is read after
   * the destination's name: "Inbox, 3", "Inbox, New notification".
   */
  badge?: BadgeValue;
  /** What the badge says to a screen reader, when the count alone is not
      enough ("3 unread"). */
  badgeLabel?: string;
};

/**
 * The accessible name a destination takes with a badge: its `ariaLabel`, or
 * its visible label, then the badge's words ("Inbox, 3"). Without a badge,
 * the item's own `ariaLabel` (the visible label names it otherwise). Shared
 * by the bar, the rail and the drawer.
 */
export function destinationName(item: NavigationItem) {
  const text = badgeAccessibleText(item.badge, item.badgeLabel);
  if (text === undefined) return item.ariaLabel;
  return `${item.ariaLabel ?? item.label}, ${text}`;
}

export type BottomNavigationProps = Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children"
> & {
  /** Three to five destinations. */
  items: NavigationItem[];
  /** Controlled: the id of the active destination (`null` for none). */
  selectedKey?: string | null;
  /** Uncontrolled starting value. */
  defaultSelectedKey?: string | null;
  /** Fired with the id of the destination that was activated. */
  onSelectionChange?: (key: string) => void;
};

/**
 * Material 3 navigation bar — three to five top-level destinations at the
 * bottom of a compact or medium window, each an icon, a label and, when
 * active, a pill-shaped indicator.
 *
 * It is a `<nav>` holding a list of links (items with `href`) or buttons, with
 * `aria-current="page"` on the active one — **not** a tab set. A navigation
 * bar takes you to another page; it does not swap a panel inside the current
 * one, so there is no tab/tabpanel relationship to express, and Tab (not the
 * arrow keys) moves between destinations, exactly as the spec's keyboard table
 * says.
 *
 * Spec: https://m3.material.io/components/navigation-bar/{overview,specs,guidelines,accessibility}
 *
 * Deliberate deviations:
 * - The *baseline* navigation bar (80dp, vertical items), not the M3-Expressive
 *   "flexible" one (64dp, horizontal items in medium windows) — the kit's
 *   token set is the baseline one, and the flexible bar has no tokens yet.
 * - Active destinations do not switch to a filled icon unless the item carries
 *   an `activeIcon`: the kit has no icon library of its own to pull the filled
 *   member from.
 *
 * A destination's `badge` is the kit's `Badge`, anchored on its icon, and is
 * read after its name (Material's badges page, accessibility).
 */
export function BottomNavigation({
  items,
  selectedKey,
  defaultSelectedKey = null,
  onSelectionChange,
  className,
  "aria-label": ariaLabel = "Primary",
  ...navProps
}: BottomNavigationProps) {
  const [ownKey, setOwnKey] = React.useState(defaultSelectedKey);
  const activeKey = selectedKey !== undefined ? selectedKey : ownKey;

  const { base, list, item } = styles();

  return (
    <nav
      data-slot="bottom-navigation"
      aria-label={ariaLabel}
      className={base({ className })}
      {...navProps}
    >
      <ul className={list()}>
        {items.map((destination) => (
          <li key={destination.id} className={item()}>
            <Destination
              item={destination}
              isActive={destination.id === activeKey}
              onSelect={() => {
                // Uncontrolled only: a controlled bar follows its own prop.
                if (selectedKey === undefined) setOwnKey(destination.id);
                onSelectionChange?.(destination.id);
              }}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The states the styles read — common to React Aria `Link` and `Button`. */
type DestinationRenderProps = Pick<
  AriaButtonRenderProps,
  "isHovered" | "isPressed" | "isFocusVisible"
>;

function Destination({
  item,
  isActive,
  onSelect,
}: {
  item: NavigationItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { destination, indicator, iconBox, icon, label } = styles();
  const Icon = (isActive && item.activeIcon) || item.icon;
  const name = destinationName(item);

  const content = ({
    isHovered,
    isPressed,
    isFocusVisible,
  }: DestinationRenderProps) => (
    <>
      <span className={indicator({ isActive })}>
        {/* The state layer belongs to the indicator, not the whole item:
            "a touch ripple passes through the indicator". */}
        <StateLayer
          color="on-surface"
          isHovered={isHovered}
          isPressed={isPressed}
          isFocusVisible={isFocusVisible}
          className="rounded-[inherit]"
        />
        <span className={iconBox()}>
          <Icon size={24} className={icon({ isActive })} />
          {item.badge !== undefined ? (
            <Badge value={item.badge} anchored />
          ) : null}
        </span>
      </span>
      <Label component="span" size="medium" className={label({ isActive })}>
        {item.label}
      </Label>
    </>
  );

  // React Aria `Link` gives the same press and hover behaviour as `Button` on
  // a real `<a>`, and routes through the app's RouterProvider (adapters/).
  if (item.href !== undefined) {
    return (
      <AriaLink
        data-slot="bottom-navigation-item"
        data-active={isActive || undefined}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={name}
        onPress={onSelect}
        className={destination()}
      >
        {content}
      </AriaLink>
    );
  }

  return (
    <AriaButton
      data-slot="bottom-navigation-item"
      data-active={isActive || undefined}
      aria-current={isActive ? "page" : undefined}
      aria-label={name}
      onPress={onSelect}
      className={destination()}
    >
      {content}
    </AriaButton>
  );
}

export default BottomNavigation;
