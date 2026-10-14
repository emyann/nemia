"use client";

import React from "react";
import {
  Button as AriaButton,
  type ButtonRenderProps as AriaButtonRenderProps,
  Link as AriaLink,
} from "react-aria-components";

import { Badge, hasBadge } from "./Badge";
import {
  destinationName,
  type NavigationItem,
} from "./BottomNavigation";
import StateLayer from "../primitives/StateLayer";
import { Label } from "../primitives/Typography";
import { focusRing, tv } from "../utils";

/**
 * Material navigation rail — the vertical destination list a medium or
 * expanded window carries down its leading edge, in the spec's two states.
 *
 *   <NavigationRail items={items} selectedKey="orders" header={<Fab />} />
 *   <NavigationRail items={items} isExpanded />
 *
 * Spec: https://m3.material.io/components/navigation-rail/overview ·
 * .../specs · .../guidelines · .../accessibility
 *
 * **Collapsed** (the default) is 96dp wide — 80dp with `isNarrow` — with 44dp
 * of top space and vertical items: a 56×32 pill indicator behind a 24dp icon,
 * the label 4dp under it, in a 64dp row
 * (`md.comp.nav-rail.collapsed.container.width`, `…collapsed.top-space`,
 * `…item.container.height`, `…item.vertical.active-indicator.{width,height}`).
 * **Expanded** is the same rail at 220dp — the spec's minimum; widen it up to
 * the 360dp maximum with `className` — with the items turned horizontal: icon
 * then label inside
 * a full-width 56dp pill, 16dp of leading and trailing space
 * (`…expanded.container.width.{minimum,maximum}`,
 * `…item.horizontal.active-indicator.height`,
 * `…item.horizontal.full-width.{leading,trailing}-space`). Both states are one
 * component because they are one component in the spec, and because an app
 * that lets the reader collapse its rail needs the transition between them.
 *
 * Colours are the tokens: the active indicator is `secondary-container` with
 * an `on-secondary-container` icon, the active label is `secondary`, and
 * everything inactive is `on-surface-variant` (`md.comp.nav-rail.item.*`).
 *
 * Like `BottomNavigation`, this is a `<nav>` of links (items with `href`) or
 * buttons with `aria-current="page"` on the active one — **not** a tab set. A
 * rail navigates; it does not swap a panel, so Tab moves between destinations
 * and the arrow keys are not bound.
 *
 * `header` is the spec's own slot for what sits above the destinations — a
 * menu button, a FAB, or both (its "Configurations" figure). It keeps the 40dp
 * minimum gap the spec asks for (`…item.header-space-minimum`).
 *
 * A destination's `badge` is the kit's `Badge`, read after its name. It sits
 * on the icon; on an expanded rail, where the label follows the icon, a large
 * badge goes to the trailing edge of the pill instead, as Material's badge
 * guidelines ask, and the small dot stays on the icon.
 *
 * Deviations, the two `BottomNavigation` documents: no filled active icon
 * unless the item carries an `activeIcon` (the kit ships no icon library to
 * pull the filled member from), and the baseline rail rather than any
 * Expressive variant.
 */
const styles = tv({
  slots: {
    // `…container.color` = surface, elevation 0, square corners.
    base: "bg-surface flex h-full flex-col transition-[width] duration-medium-2 ease-emphasized",
    // `…collapsed.top-space` / `…expanded.top-space`.
    header: "flex shrink-0 flex-col items-center gap-2 px-3 pt-11 pb-10",
    list: "flex list-none flex-col",
    item: "",
    destination: [focusRing(), "flex w-full items-center"],
    // Does not clip, so a badge on the icon may reach past the pill.
    indicator:
      "relative flex shrink-0 items-center justify-center rounded-shape-full transition-colors duration-short-4",
    // The icon's 24dp box, which a badge is anchored on.
    iconBox: "relative flex shrink-0",
    icon: "transition-colors duration-short-4",
    label: "transition-colors duration-short-4",
  },
  variants: {
    isExpanded: {
      // `…collapsed.container.width` (96dp) — the narrow case is a compound.
      false: {
        base: "w-24",
        // `…item.container.height` 64dp, `…collapsed.item.vertical-space` 4dp.
        destination: "h-16 flex-col justify-center gap-1 px-2",
        // `…item.vertical.active-indicator.{width,height}` = 56 × 32.
        indicator: "h-8 w-14",
        label: "w-full truncate text-center",
      },
      // `…expanded.container.width.minimum`; cap with `maxWidth`.
      true: {
        base: "w-55",
        // The whole row is the indicator when expanded, so the destination is
        // just its container: 56dp tall with 16dp of side space.
        destination: "h-14 px-4",
        indicator:
          "h-14 w-full justify-start gap-2 px-4 rounded-shape-full",
        label: "truncate",
      },
    },
    isNarrow: { true: {}, false: {} },
    isActive: {
      true: {
        indicator: "bg-secondary-container",
        icon: "text-on-secondary-container",
      },
      false: {
        icon: "text-on-surface-variant",
        label: "text-on-surface-variant",
      },
    },
  },
  compoundVariants: [
    // `…collapsed.narrow.container.width`.
    { isExpanded: false, isNarrow: true, class: { base: "w-20" } },
    // The active label is `secondary` collapsed (`…item.active.label-text
    // .color`) and `on-secondary-container` inside the expanded pill, where it
    // sits on the indicator rather than beside it.
    { isActive: true, isExpanded: false, class: { label: "text-secondary" } },
    {
      isActive: true,
      isExpanded: true,
      class: { label: "text-on-secondary-container" },
    },
  ],
  defaultVariants: { isExpanded: false, isNarrow: false, isActive: false },
});

export type NavigationRailProps = Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children"
> & {
  /** The destinations, in order. Same shape `BottomNavigation` takes. */
  items: NavigationItem[];
  /** Controlled: the id of the active destination (`null` for none). */
  selectedKey?: string | null;
  /** Uncontrolled starting value. */
  defaultSelectedKey?: string | null;
  /** Fired with the id of the destination that was activated. */
  onSelectionChange?: (key: string) => void;
  /** Horizontal items at 220dp instead of vertical ones at 96dp. */
  isExpanded?: boolean;
  /** 80dp instead of 96dp when collapsed (`…collapsed.narrow`). */
  isNarrow?: boolean;
  /** Above the destinations: a menu button, a FAB, or both. */
  header?: React.ReactNode;
  /** Pinned to the bottom of the rail — an account button, a theme toggle. */
  footer?: React.ReactNode;
};

export function NavigationRail({
  items,
  selectedKey,
  defaultSelectedKey = null,
  onSelectionChange,
  isExpanded = false,
  isNarrow = false,
  header,
  footer,
  className,
  "aria-label": ariaLabel = "Primary",
  ...navProps
}: NavigationRailProps) {
  const [ownKey, setOwnKey] = React.useState(defaultSelectedKey);
  const activeKey = selectedKey !== undefined ? selectedKey : ownKey;

  const s = styles({ isExpanded, isNarrow });

  return (
    <nav
      data-slot="navigation-rail"
      data-expanded={isExpanded || undefined}
      aria-label={ariaLabel}
      className={s.base({ className })}
      {...navProps}
    >
      {header ? (
        <div data-slot="navigation-rail-header" className={s.header()}>
          {header}
        </div>
      ) : (
        // Without a header the destinations still start at the spec's top
        // space, so a rail with and without one line up.
        <div className="h-11 shrink-0" />
      )}

      <ul className={s.list()}>
        {items.map((destination) => (
          <li key={destination.id} className={s.item()}>
            <Destination
              item={destination}
              isActive={destination.id === activeKey}
              isExpanded={isExpanded}
              isNarrow={isNarrow}
              onSelect={() => {
                // Uncontrolled only: a controlled rail follows its own prop.
                if (selectedKey === undefined) setOwnKey(destination.id);
                onSelectionChange?.(destination.id);
              }}
            />
          </li>
        ))}
      </ul>

      {footer ? (
        <div
          data-slot="navigation-rail-footer"
          className="mt-auto flex shrink-0 flex-col items-center gap-2 px-3 pb-5"
        >
          {footer}
        </div>
      ) : null}
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
  isExpanded,
  isNarrow,
  onSelect,
}: {
  item: NavigationItem;
  isActive: boolean;
  isExpanded: boolean;
  isNarrow: boolean;
  onSelect: () => void;
}) {
  const s = styles({ isActive, isExpanded, isNarrow });
  const Icon = (isActive && item.activeIcon) || item.icon;
  const name = destinationName(item);
  // A count after the label on the expanded pill; the dot, and any badge on
  // a collapsed rail, on the icon.
  const isTrailingBadge =
    isExpanded && hasBadge(item.badge) && item.badge !== true;

  const content = ({
    isHovered,
    isPressed,
    isFocusVisible,
  }: DestinationRenderProps) => {
    const iconAndLabel = (
      <>
        <span className={s.iconBox()}>
          <Icon size={24} className={s.icon()} />
          {item.badge !== undefined && !isTrailingBadge ? (
            <Badge value={item.badge} anchored />
          ) : null}
        </span>
        {isExpanded ? (
          <Label component="span" size="large" className={s.label()}>
            {item.label}
          </Label>
        ) : null}
        {isTrailingBadge ? (
          <Badge value={item.badge} className="ms-auto" />
        ) : null}
      </>
    );

    return (
      <>
        <span className={s.indicator()}>
          {/* The state layer belongs to the indicator, as in the bar: the
              ripple passes through the pill, not the whole 64dp row. */}
          <StateLayer
            color="on-surface"
            isHovered={isHovered}
            isPressed={isPressed}
            isFocusVisible={isFocusVisible}
            className="rounded-[inherit]"
          />
          {iconAndLabel}
        </span>
        {/* Collapsed, the label sits under the pill rather than inside it. */}
        {isExpanded ? null : (
          <Label component="span" size="medium" className={s.label()}>
            {item.label}
          </Label>
        )}
      </>
    );
  };

  const shared = {
    "data-slot": "navigation-rail-item",
    "data-active": isActive || undefined,
    "aria-current": isActive ? ("page" as const) : undefined,
    "aria-label": name,
    onPress: onSelect,
    className: s.destination(),
  };

  if (item.href !== undefined) {
    return (
      <AriaLink {...shared} href={item.href}>
        {content}
      </AriaLink>
    );
  }

  return <AriaButton {...shared}>{content}</AriaButton>;
}

export default NavigationRail;
