"use client";

import {
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv, type VariantProps } from "../utils";

const styles = tv({
  extend: focusRing,
  base: [
    "cursor-pointer rounded-shape-extra-small underline-offset-2 transition-colors duration-short-4",
    "data-hovered:decoration-2",
    "data-disabled:cursor-default data-disabled:text-on-surface/38 data-disabled:no-underline",
  ],
  variants: {
    color: {
      primary: "text-primary",
      inherit: "text-inherit",
    },
    underline: {
      always: "underline",
      hover: "no-underline data-hovered:underline data-focus-visible:underline",
    },
  },
  defaultVariants: { color: "primary", underline: "always" },
});

export type LinkProps = AriaLinkProps &
  VariantProps<typeof styles> & {
    /** `primary` (the default) draws the link in the primary role. `inherit`
     *  takes the colour of the text around it, for a list of links that is
     *  already set in a role of its own, such as a footer column. */
    color?: "primary" | "inherit";
    /** `always` (the default) underlines the link. `hover` underlines it only
     *  under the pointer and on keyboard focus: for a list of links, where
     *  position says what they are, and never in running text, where colour
     *  alone would be the only cue. */
    underline?: "always" | "hover";
  };

/**
 * A text link: a word or a phrase that goes somewhere, in a sentence or in a
 * list of links. On React Aria `Link`, so `href` is routed through the
 * router adapter, and without `href` it is a link that acts (`onPress`).
 *
 *   <Body>Read the <Link href="/terms">terms of service</Link>.</Body>
 *   <Link href="/pricing" color="inherit" underline="hover">Pricing</Link>
 *   <Link href="https://example.com" target="_blank">Documentation</Link>
 *   <Link isDisabled>Not available yet</Link>
 *
 * It takes React Aria's `Link` props (`href`, `target`, `rel`, `download`,
 * `routerOptions`, `onPress`, `isDisabled`, `aria-current`) with `color`
 * and `underline`. It sets no type: it takes the size and the weight of the
 * text it sits in, so put a link that stands alone inside a type primitive
 * (`<Body>`, `<Label>`). For a link that should look like a button, use
 * `Button` with `href`.
 *
 * Material 3 does not describe this component. It has buttons that navigate
 * and no text link. What this one borrows:
 *
 * - **The colour**: https://m3.material.io/styles/color/roles — `primary`,
 *   the role for the most prominent actions on a surface, and `on-surface`
 *   at 38% when disabled.
 * - **The states**: https://m3.material.io/foundations/interaction/states —
 *   the focus indicator is the kit's focus ring, on the extra-small corner.
 *   Text has no container for a state layer, so hover thickens the underline
 *   instead.
 * - **The shape**: https://m3.material.io/styles/shape — the extra-small
 *   corner of the focus ring.
 * - **The words**: https://m3.material.io/foundations/designing/elements —
 *   a link's text says where it goes; "Learn more" alone does not.
 *
 * The underline is the cue that does not depend on colour. A link inside a
 * line of text is not held to the 48dp target, which is for controls that
 * stand alone.
 */
export function Link({ color, underline, className, ...props }: LinkProps) {
  return (
    <AriaLink
      data-slot="link"
      {...props}
      className={composeTailwindRenderProps(
        className,
        styles({ color, underline }),
      )}
    />
  );
}

export default Link;
