import { type HTMLAttributes } from "react";

import { tv, type VariantProps } from "../utils";

const styles = tv({
  base: "shrink-0 bg-outline-variant forced-colors:bg-[ButtonBorder]",
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px self-stretch",
    },
    variant: {
      "full-width": "",
      inset: "",
      "middle-inset": "",
    },
  },
  compoundVariants: [
    // 16dp leading inset; the trailing edge stays flush (spec: right margin 0).
    { orientation: "horizontal", variant: "inset", class: "ms-4 w-auto" },
    { orientation: "horizontal", variant: "middle-inset", class: "mx-4 w-auto" },
    { orientation: "vertical", variant: "inset", class: "mt-4 self-auto" },
    { orientation: "vertical", variant: "middle-inset", class: "my-4 self-auto" },
  ],
  defaultVariants: { orientation: "horizontal", variant: "full-width" },
});

export type DividerProps = VariantProps<typeof styles> &
  Omit<HTMLAttributes<HTMLDivElement>, "role" | "children"> & {
    /** Hidden from assistive technology (the MD3 default). Set `false` where
        the line is the only boundary marker and should be a `separator`. */
    decorative?: boolean;
    className?: string;
  };

/**
 * A divider — the 1dp `outline-variant` line that groups content and implies
 * hierarchy. Presentational and server-safe: no React Aria, no `"use client"`.
 *
 *   <Divider />                            full-width, the section separator
 *   <Divider variant="inset" />            16dp leading inset, for list rows
 *   <Divider variant="middle-inset" />     16dp both sides, inside a block
 *   <Divider orientation="vertical" />     between side-by-side content
 *
 * Spec: https://m3.material.io/components/divider/overview ·
 * .../specs · .../guidelines · .../accessibility
 *
 * Anatomy is the whole component — "a divider is a simple line": 1dp thick
 * (`md.comp.divider.thickness`) in `outline-variant`
 * (`md.comp.divider.color`), drawn as a background on a 1px box rather than a
 * border so the inset variants are plain margins. The three variants are
 * Material's own: **full-width** separates unrelated sections and interactive
 * from non-interactive areas; **inset** (16dp leading, 0 trailing) separates
 * related items in a list and aligns with the leading edge of their anchoring
 * icon or avatar; **middle-inset** (16dp both) separates elements inside one
 * block. Vertical dividers arrange content side by side on wide screens; they
 * stretch to the height of their flex row, so give the row a height or let its
 * content set one.
 *
 * Accessibility: dividers are decorative and have no contrast minimum, so the
 * default is `decorative` — `role="presentation"`, hidden from assistive
 * technology, because the type styles and spacing around it already convey the
 * grouping. Pass `decorative={false}` where the line is the *only* thing
 * marking a boundary (a menu's section break) to get `role="separator"` with
 * the matching `aria-orientation`.
 *
 * Deviation: Material's spec also lists 8dp right/bottom margins for a divider
 * used as a component's own trailing rule. The kit leaves spacing to the
 * layout — every other component here does — so a caller adds `my-2` rather
 * than the divider asserting margin it cannot know is wanted.
 */
export function Divider({
  orientation = "horizontal",
  variant = "full-width",
  decorative = true,
  className,
  ...rest
}: DividerProps) {
  return (
    <div
      data-slot="divider"
      data-orientation={orientation}
      data-variant={variant}
      {...(decorative
        ? { role: "presentation", "aria-hidden": true }
        : { role: "separator", "aria-orientation": orientation })}
      {...rest}
      className={styles({ orientation, variant, className })}
    />
  );
}

export default Divider;
