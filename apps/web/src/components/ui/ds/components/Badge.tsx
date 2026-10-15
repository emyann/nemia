import { type HTMLAttributes } from "react";

import { tv } from "../utils";

const styles = tv({
  base: "pointer-events-none inline-flex shrink-0 items-center justify-center rounded-shape-full bg-error text-on-error",
  variants: {
    size: {
      // `md.comp.badge.size`
      small: "size-1.5",
      // `md.comp.badge.large.size`, 16 to 34dp wide, 4dp beside the text.
      large:
        "h-4 min-w-4 max-w-8.5 px-1 text-label-small font-label-small whitespace-nowrap",
    },
    anchored: { true: "absolute", false: "" },
  },
  compoundVariants: [
    // Bottom leading corner 6×6dp from the icon's top trailing corner.
    {
      size: "small",
      anchored: true,
      class: "top-0 start-[calc(100%-6px)]",
    },
    // Bottom leading corner 14dp down and 12dp in: the top is 2dp above.
    {
      size: "large",
      anchored: true,
      class: "-top-0.5 start-[calc(100%-12px)]",
    },
  ],
  defaultVariants: { size: "small", anchored: false },
});

/** A host's `badge`: a count or a short status, or `true` for the dot. */
export type BadgeValue = number | string | true;

/** The longest number shown before it becomes "999+". */
export const BADGE_MAX = 999;

/** The text a large badge shows, or `undefined` for the small one. */
function shownText(value: BadgeValue | undefined, max: number) {
  if (value === undefined || value === true) return undefined;
  if (typeof value === "number" && value > max) return `${max}+`;
  return String(value);
}

/** Whether a host's `badge` draws anything at all. */
export function hasBadge(value: BadgeValue | undefined | false | null) {
  return value !== undefined && value !== false && value !== null &&
    value !== 0 && value !== "";
}

/**
 * The words a badge adds to its destination's name: `label` when given, else
 * the count as it is shown, else "New notification" for the small badge, as
 * the accessibility page says. `undefined` when the badge draws nothing.
 */
export function badgeAccessibleText(
  value: BadgeValue | undefined,
  label?: string,
  max: number = BADGE_MAX,
) {
  if (!hasBadge(value)) return undefined;
  return label ?? shownText(value, max) ?? "New notification";
}

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** A count or a short status. Left out (or `true`), the small badge. */
  value?: BadgeValue;
  /** A number above it shows as `${max}+`. Default 999. */
  max?: number;
  /** On the top trailing corner of the positioned parent, the icon's box. */
  anchored?: boolean;
};

/**
 * Material 3 badge: a notification dot (small) or a count (large) on the
 * trailing top corner of a destination's icon.
 *
 *   <Badge />                       small: a 6dp dot, "New notification"
 *   <Badge value={3} />             large: 16dp high, the count in it
 *   <Badge value={1200} />          "999+": four characters at most
 *   <Badge value={3} anchored />    on the icon's corner (the hosts do this)
 *
 * Spec: https://m3.material.io/components/badges/overview · .../specs ·
 * .../guidelines · .../accessibility
 *
 * The measurements are the spec's (`md.comp.badge.*`): the small badge is a
 * 6dp circle, the large one 16dp high and 16dp wide at least, growing with its
 * text to 34dp, with 4dp of padding beside the text, both fully rounded, on
 * `error` with `label-small` text in `on-error`. A number above `max` (999 by
 * default) is shown as "999+", the spec's four characters with the "+".
 *
 * **Placement.** `anchored` sets the badge on the top trailing corner of its
 * positioned parent, the icon's box: the small badge's bottom leading corner
 * 6dp from the icon's top trailing corner each way, the large one's 14dp down
 * and 12dp in, as the spec's measurements give. The offsets are logical
 * (`inset-inline-start`), so the badge moves to the left corner in a
 * right-to-left page, as the guidelines ask. Where a label follows the icon
 * on the same line (an expanded rail, an inline-icon tab), a host sets a
 * large badge after the label instead, at the trailing edge.
 *
 * **What is announced.** The badge is `aria-hidden`: a badge is read after
 * its destination, so the host joins it to the destination's own name
 * ("Inbox, 3"; "Inbox, New notification" for the small badge). The words are
 * `badgeAccessibleText`'s, which `NavigationItem`, `Tab` and `IconButton` use
 * through their `badge` and `badgeLabel`. A count of 0 draws nothing and says
 * nothing.
 *
 * Presentational and server-safe: no React Aria, no `"use client"`.
 *
 * Deviations: none of the colours can be changed by a prop, as the
 * guidelines ask (keep the default mapping). Hiding a badge once its
 * destination is opened is the app's: it owns the unread count the badge
 * shows, and passes no `badge` when there is nothing unread.
 */
export function Badge({
  value,
  max = BADGE_MAX,
  anchored = false,
  className,
  ...rest
}: BadgeProps) {
  if (value === 0 || value === "") return null;
  const text = shownText(value, max);
  const size = text === undefined ? "small" : "large";

  return (
    <span
      data-slot="badge"
      data-size={size}
      aria-hidden="true"
      {...rest}
      className={styles({ size, anchored, className })}
    >
      {/* A count reads left to right in any page ("999+", never "+999"),
          so the text alone is isolated as such: the box keeps the page's
          direction, which is what moves it to the other corner. */}
      {text === undefined ? null : <bdi dir="ltr">{text}</bdi>}
    </span>
  );
}

export default Badge;
