"use client";

import React from "react";
import {
  Button as AriaButton,
  type ButtonRenderProps as AriaButtonRenderProps,
  Dialog as AriaDialog,
  Link as AriaLink,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";

import { Badge, badgeAccessibleText, BADGE_MAX, hasBadge } from "./Badge";
import {
  destinationName,
  type NavigationItem,
} from "./BottomNavigation";
import { Divider } from "./Divider";
import StateLayer from "../primitives/StateLayer";
import { Label, Title } from "../primitives/Typography";
import { cn, focusRing, tv } from "../utils";

const styles = tv({
  slots: {
    // 360dp, 16dp on the trailing corners only (`corner.large.end`).
    base: "flex h-full w-90 max-w-full flex-col rounded-r-shape-large",
    // "Left padding 28dp / Right padding 28dp", minus the 12dp the active
    // indicator is already inset by, so the pill lands 12dp from the edge and
    // its content 28dp.
    inner: "flex flex-col gap-1 overflow-y-auto px-4 py-3",
    headline: "text-on-surface-variant px-6 pt-4 pb-2",
    list: "flex list-none flex-col",
    destination: [
      focusRing(),
      // `…active-indicator.height` 56dp, full-pill, 16dp of inner padding.
      "relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-shape-full px-4",
    ],
    icon: "shrink-0 transition-colors duration-short-4",
    // Start-aligned, as the spec draws it: a `<button>` centres its text.
    label: "min-w-0 flex-1 truncate text-start transition-colors duration-short-4",
    // The badge label text (anatomy element 5).
    trailing: "shrink-0 transition-colors duration-short-4",
  },
  variants: {
    variant: {
      standard: { base: "bg-surface" },
      // `…modal.container.{color,elevation}`.
      modal: { base: "bg-surface-container-low shadow-elevation-1" },
    },
    isActive: {
      true: {
        icon: "text-on-secondary-container",
        // `…active.label-text.weight` is the prominent (bold) weight.
        label: "font-bold text-on-secondary-container",
        trailing: "text-on-secondary-container",
      },
      false: {
        icon: "text-on-surface-variant",
        label: "text-on-surface-variant",
        trailing: "text-on-surface-variant",
      },
    },
  },
  defaultVariants: { variant: "standard", isActive: false },
});

/** A group of destinations, optionally under its own headline. */
export type NavigationSection = {
  /** `title-small`, `on-surface-variant`, above the group. */
  headline?: React.ReactNode;
  items: NavigationItem[];
};

export type NavigationDrawerProps = {
  /** A single group. Use `sections` for more than one. */
  items?: NavigationItem[];
  /** Groups, separated by a `Divider`. Takes precedence over `items`. */
  sections?: NavigationSection[];
  /** The `title-small` line above the first group. */
  headline?: React.ReactNode;
  /**
   * Above the headline: a logo, a workspace switcher, a search field. Kept
   * separate from `headline` because that one is a heading, and a heading is
   * the wrong element to put a control inside.
   */
  header?: React.ReactNode;
  /** Controlled: the id of the active destination (`null` for none). */
  selectedKey?: string | null;
  /** Uncontrolled starting value. */
  defaultSelectedKey?: string | null;
  /** Fired with the id of the destination that was activated. */
  onSelectionChange?: (key: string) => void;
  /** `standard` sits inline; `modal` floats over a scrim. */
  variant?: "standard" | "modal";
  /** Modal only. */
  isOpen?: boolean;
  /** Modal only: Escape, a click outside, or a destination being chosen. */
  onClose?: () => void;
  /** Pinned to the bottom — an account row, a theme toggle. */
  footer?: React.ReactNode;
  /** Accessible name of the `<nav>`. */
  "aria-label"?: string;
  className?: string;
};

/**
 * Material navigation drawer — the full-height list of destinations an
 * expanded window can keep open, or a compact one can pull over the content.
 *
 *   <NavigationDrawer items={items} selectedKey="orders" />          standard
 *   <NavigationDrawer variant="modal" isOpen={open} onClose={close}  modal
 *                     items={items} headline="Acme" />
 *
 * Spec: https://m3.material.io/components/navigation-drawer/overview ·
 * .../specs · .../guidelines · .../accessibility
 *
 * Both forms the spec defines:
 *
 * - **standard** sits inline in the layout on `surface` at elevation 0. It is
 *   the persistent drawer of a wide window: no scrim, nothing to dismiss.
 * - **modal** floats over a scrim on `surface-container-low` at elevation 1,
 *   traps focus, and closes on Escape or a click outside — React Aria's
 *   `ModalOverlay` + `Modal` + `Dialog`, animated by its `data-entering` /
 *   `data-exiting` states exactly as `SideSheet` and `Modal` are, with no
 *   animation library.
 *
 * The measurements are the spec's: a 360dp container with 16dp rounded
 * trailing corners (`md.comp.navigation-drawer.container.{width,shape}`,
 * `…{standard,modal}.container.{color,elevation}`), 28dp of side padding,
 * and destinations that are a 56dp full-pill active indicator inset 12dp
 * (`…active-indicator.{height,shape}`, "Active indicator padding 12dp"). An
 * active destination is `secondary-container` behind an
 * `on-secondary-container` icon and a **bold** label — the spec's
 * `label-large.weight.prominent`, so the selection is carried by weight as
 * well as colour. `headline` is the optional `title-small`
 * `on-surface-variant` line above the list, and `sections` puts a `Divider`
 * (the kit's, not a hand-rolled border) between groups.
 *
 * Like the rail and the bar, it is a `<nav>` of links or buttons with
 * `aria-current="page"` on the active one, not a tab set: Tab moves between
 * destinations and the arrow keys are not bound.
 *
 * **Badges.** A destination's `badge` is the drawer's own "badge label
 * text" (its anatomy, element 5): the count as `label-large` text at the
 * trailing end of the row, `on-surface-variant`, `on-secondary-container`
 * on the active one, never the red `Badge` the bar and the rail draw. It is
 * read after the name ("Inbox, 24"). A badge of `true`, which has no text,
 * shows its `badgeLabel` as that text; without one it falls back to the small
 * `Badge` dot, so that an unread mark is never drawn as nothing.
 *
 * Deviations: no bottom-anchored drawer
 * (`…bottom.container.shape` describes a compact-window variant the kit's
 * `SideSheet` already covers), and — as with the rail — no filled active icon
 * unless the item carries an `activeIcon`.
 */
export function NavigationDrawer({
  items,
  sections,
  headline,
  header,
  selectedKey,
  defaultSelectedKey = null,
  onSelectionChange,
  variant = "standard",
  isOpen = false,
  onClose,
  footer,
  "aria-label": ariaLabel = "Primary",
  className,
}: NavigationDrawerProps) {
  const [ownKey, setOwnKey] = React.useState(defaultSelectedKey);
  const activeKey = selectedKey !== undefined ? selectedKey : ownKey;

  const s = styles({ variant });
  const groups: NavigationSection[] = sections ?? [{ items: items ?? [] }];

  const select = (id: string) => {
    // Uncontrolled only: a controlled drawer follows its own prop.
    if (selectedKey === undefined) setOwnKey(id);
    onSelectionChange?.(id);
    if (variant === "modal") onClose?.();
  };

  const body = (
    <nav
      data-slot="navigation-drawer"
      data-variant={variant}
      aria-label={ariaLabel}
      className={s.base({ className })}
    >
      {header ? (
        <div
          data-slot="navigation-drawer-header"
          className="flex shrink-0 flex-col gap-3 px-6 pt-4"
        >
          {header}
        </div>
      ) : null}

      {headline ? (
        <Title size="small" component="h2" className={s.headline()}>
          {headline}
        </Title>
      ) : null}

      <div className={s.inner()}>
        {groups.map((group, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <Divider variant="middle-inset" className="my-2" /> : null}
            {group.headline ? (
              <Title size="small" component="h3" className={s.headline()}>
                {group.headline}
              </Title>
            ) : null}
            <ul className={s.list()}>
              {group.items.map((destination) => (
                <li key={destination.id}>
                  <Destination
                    item={destination}
                    variant={variant}
                    isActive={destination.id === activeKey}
                    onSelect={() => select(destination.id)}
                  />
                </li>
              ))}
            </ul>
          </React.Fragment>
        ))}
      </div>

      {footer ? (
        <div data-slot="navigation-drawer-footer" className="mt-auto px-4 pb-4">
          {footer}
        </div>
      ) : null}
    </nav>
  );

  if (variant !== "modal") return body;

  return (
    <ModalOverlay
      data-slot="navigation-drawer-overlay"
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
      className={cn(
        "bg-scrim/50 fixed inset-0 z-50 backdrop-blur-sm",
        "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2",
        "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4",
      )}
    >
      <AriaModal
        className={cn(
          "fixed top-0 left-0 h-full w-fit",
          "data-entering:animate-in data-entering:slide-in-from-left data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
          "data-exiting:animate-out data-exiting:slide-out-to-left data-exiting:duration-short-4 data-exiting:ease-emphasized-accelerate",
        )}
      >
        {/* The dialog is what traps focus and returns it; the nav inside is
            still the navigation landmark. */}
        <AriaDialog aria-label={ariaLabel} className="h-full outline-hidden">
          {body}
        </AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}

/** The states the styles read — common to React Aria `Link` and `Button`. */
type DestinationRenderProps = Pick<
  AriaButtonRenderProps,
  "isHovered" | "isPressed" | "isFocusVisible"
>;

function Destination({
  item,
  variant,
  isActive,
  onSelect,
}: {
  item: NavigationItem;
  variant: "standard" | "modal";
  isActive: boolean;
  onSelect: () => void;
}) {
  const s = styles({ variant, isActive });
  const Icon = (isActive && item.activeIcon) || item.icon;
  const name = destinationName(item);
  // The text the row shows for its badge: the count, or `badgeLabel` for a
  // `true` badge. A `true` badge without one is the small dot.
  const badgeText = !hasBadge(item.badge)
    ? undefined
    : item.badge === true
      ? item.badgeLabel
      : badgeAccessibleText(item.badge, undefined, BADGE_MAX);

  const content = ({
    isHovered,
    isPressed,
    isFocusVisible,
  }: DestinationRenderProps) => (
    <>
      <StateLayer
        color="on-surface"
        isHovered={isHovered}
        isPressed={isPressed}
        isFocusVisible={isFocusVisible}
      />
      <Icon size={24} className={s.icon()} />
      <Label component="span" size="large" className={s.label()}>
        {item.label}
      </Label>
      {badgeText !== undefined ? (
        // Already in the name, after a comma: hidden here so it is not read
        // twice.
        <Label
          component="span"
          size="large"
          aria-hidden="true"
          data-slot="navigation-drawer-badge"
          className={s.trailing()}
        >
          {badgeText}
        </Label>
      ) : hasBadge(item.badge) ? (
        <Badge value={true} />
      ) : null}
    </>
  );

  const shared = {
    "data-slot": "navigation-drawer-item",
    "data-active": isActive || undefined,
    "aria-current": isActive ? ("page" as const) : undefined,
    "aria-label": name,
    onPress: onSelect,
    // The whole row *is* the active indicator, so the container carries the
    // `secondary-container` fill rather than a nested pill.
    className: cn(s.destination(), isActive && "bg-secondary-container"),
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

export default NavigationDrawer;
