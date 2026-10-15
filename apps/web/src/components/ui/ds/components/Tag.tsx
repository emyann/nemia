import { type HTMLAttributes, type ReactNode } from "react";

import { Label } from "../primitives/Typography";
import { tv, type VariantProps } from "../utils";

const styles = tv({
  base: "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-shape-small px-2 align-middle",
  variants: {
    variant: {
      tonal: "",
      filled: "",
      outlined: "border border-outline-variant text-on-surface-variant",
    },
    color: {
      neutral: "",
      primary: "",
      secondary: "",
      tertiary: "",
      error: "",
    },
  },
  compoundVariants: [
    {
      variant: "tonal",
      color: "neutral",
      class: "bg-surface-container-highest text-on-surface",
    },
    {
      variant: "tonal",
      color: "primary",
      class: "bg-primary-container text-on-primary-container",
    },
    {
      variant: "tonal",
      color: "secondary",
      class: "bg-secondary-container text-on-secondary-container",
    },
    {
      variant: "tonal",
      color: "tertiary",
      class: "bg-tertiary-container text-on-tertiary-container",
    },
    {
      variant: "tonal",
      color: "error",
      class: "bg-error-container text-on-error-container",
    },
    {
      variant: "filled",
      color: "neutral",
      class: "bg-inverse-surface text-inverse-on-surface",
    },
    {
      variant: "filled",
      color: "primary",
      class: "bg-primary text-on-primary",
    },
    {
      variant: "filled",
      color: "secondary",
      class: "bg-secondary text-on-secondary",
    },
    {
      variant: "filled",
      color: "tertiary",
      class: "bg-tertiary text-on-tertiary",
    },
    { variant: "filled", color: "error", class: "bg-error text-on-error" },
  ],
  defaultVariants: { variant: "tonal", color: "secondary" },
});

export type TagProps = VariantProps<typeof styles> &
  Omit<HTMLAttributes<HTMLSpanElement>, "color"> & {
    children: ReactNode;
    className?: string;
  };

/**
 * A static label — an order number, a plan name, a status, a price — drawn
 * on a colour-role container. Presentational and server-safe: not a chip
 * (chips are actions and filters, this never reacts to the pointer) and not
 * a badge (the notification dot or count anchored on an icon: `Badge`).
 *
 *   <Tag>#42</Tag>
 *   <Tag color="error">Canceled</Tag>
 *   <Tag variant="filled" color="primary">Paid</Tag>
 *   <Tag variant="outlined">Required</Tag>
 *
 * Material 3 does not describe this component. The spec has no standalone
 * label pill. The
 * anatomy borrows from chips (small-shape 8dp corners, label-medium type,
 * 8dp side padding) at 24dp so it sits inside a line of body text; colours
 * are the tonal container pairs (`<color>-container` / `on-<color>-container`,
 * default secondary) or the filled pairs (`<color>` / `on-<color>`), neutral
 * being `surface-container-highest` and `inverse-surface` respectively, so a
 * palette swap restyles every tag.
 */
export function Tag({
  variant = "tonal",
  color = "secondary",
  className,
  children,
  ...rest
}: TagProps) {
  return (
    <span
      data-slot="tag"
      data-variant={variant}
      data-color={color}
      {...rest}
      className={styles({ variant, color, className })}
    >
      <Label size="medium" component="span" className="text-inherit">
        {children}
      </Label>
    </span>
  );
}

export default Tag;
