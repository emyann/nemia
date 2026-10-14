import React from "react";
import { tv, type VariantProps } from "../utils";

/**
 * The Material type scale as five primitives.
 *
 * **Content color is inherited, not asserted.** These primitives set the type
 * role and nothing else, so a `bg-<role>` container that carries its
 * `text-on-<role>` re-colors everything inside it — the pairing rule in
 * `conventions.md` only works if children inherit. The scheme's default,
 * `on-surface`, is the ambient color declared on `:root` / `.dark` in
 * `tokens/theme.css`, so text outside any colored container still lands on the
 * right role in both schemes.
 *
 * `colorRole` states the role explicitly when inheritance is not what you want
 * — secondary text under a heading (`colorRole="on-surface-variant"`), an
 * accent label on a neutral surface (`colorRole="primary"`). A `className`
 * still wins over it, through the kit's tailwind-merge.
 *
 * **The weight is the role's, from the theme.** No weight class is written
 * here: each `text-<role>` utility carries its role's weight with its size,
 * line height and tracking (`--md-sys-typescale-<role>-weight` in
 * `tokens/theme.v4.css`), so a project whose `DESIGN.md` gives a role a
 * weight gets it from these primitives, and one that gives none gets
 * Material's: 500 for the labels, `title-medium` and `title-small`, 400 for
 * the rest, `title-large` among them. A `className` with a weight of its own
 * (`font-bold`) still wins.
 *
 * **The family is the role's too.** Each primitive writes `font-<role>`
 * beside `text-<role>`. It reads `--md-sys-typescale-<role>-font`, the family
 * a project's `DESIGN.md` writes on that role, and where it writes none the
 * role's face: `brand` for display, headline and title, `plain` for body and
 * label. A `className` with a family of its own still wins.
 *
 * It is `colorRole` and
 * not `color` because `color` is a real (deprecated) HTML attribute, and these
 * primitives are prop-forwarding targets: a wrapper that pipes
 * `ComponentPropsWithoutRef<"h3">` through would stop typechecking.
 */
const typography = tv({
  base: "",
  variants: {
    // The family is the role's, in the `font-<role>` utility below, as the
    // size is in `text-<role>`: Material gives each role a font token of its
    // own, which reads one of its two faces (`brand` for display / headline /
    // title, `plain` for body / label) unless the theme's DESIGN.md writes a
    // family on the role. Both faces resolve to the same `--font-inter` hook
    // by default (tokens/theme.v4.css), so a kit that is not themed still
    // renders one family throughout. A `className` with a `font-*` family of
    // its own still wins, through the kit's merge. No weight is written: it
    // is the role's, in the `text-<role>` utility.
    variant: {
      display: "",
      headline: "",
      title: "",
      body: "",
      label: "",
    },
    size: {
      large: "",
      medium: "",
      small: "",
    },
    /**
     * Content color. `inherit` (the default) emits nothing, so the element
     * takes its container's color. Every other value is the matching role
     * utility — written out in full so Tailwind sees the class.
     */
    colorRole: {
      inherit: "",
      "on-surface": "text-on-surface",
      "on-surface-variant": "text-on-surface-variant",
      "on-background": "text-on-background",
      "on-primary": "text-on-primary",
      "on-primary-container": "text-on-primary-container",
      "on-secondary": "text-on-secondary",
      "on-secondary-container": "text-on-secondary-container",
      "on-tertiary": "text-on-tertiary",
      "on-tertiary-container": "text-on-tertiary-container",
      "on-error": "text-on-error",
      "on-error-container": "text-on-error-container",
      "inverse-on-surface": "text-inverse-on-surface",
      primary: "text-primary",
      secondary: "text-secondary",
      tertiary: "text-tertiary",
      error: "text-error",
    },
  },
  compoundVariants: [
    {
      variant: "display",
      size: "large",
      class: "text-display-large font-display-large",
    },
    {
      variant: "display",
      size: "medium",
      class: "text-display-medium font-display-medium",
    },
    {
      variant: "display",
      size: "small",
      class: "text-display-small font-display-small",
    },
    {
      variant: "headline",
      size: "large",
      class: "text-headline-large font-headline-large",
    },
    {
      variant: "headline",
      size: "medium",
      class: "text-headline-medium font-headline-medium",
    },
    {
      variant: "headline",
      size: "small",
      class: "text-headline-small font-headline-small",
    },
    {
      variant: "title",
      size: "large",
      class: "text-title-large font-title-large",
    },
    {
      variant: "title",
      size: "medium",
      class: "text-title-medium font-title-medium",
    },
    {
      variant: "title",
      size: "small",
      class: "text-title-small font-title-small",
    },
    {
      variant: "body",
      size: "large",
      class: "text-body-large font-body-large",
    },
    {
      variant: "body",
      size: "medium",
      class: "text-body-medium font-body-medium",
    },
    {
      variant: "body",
      size: "small",
      class: "text-body-small font-body-small",
    },
    {
      variant: "label",
      size: "large",
      class: "text-label-large font-label-large",
    },
    {
      variant: "label",
      size: "medium",
      class: "text-label-medium font-label-medium",
    },
    {
      variant: "label",
      size: "small",
      class: "text-label-small font-label-small",
    },
  ],
  defaultVariants: {
    variant: "body",
    size: "medium",
    colorRole: "inherit",
  },
});

type TypographyVariants = VariantProps<typeof typography>;

export type TypographyColorRole = NonNullable<TypographyVariants["colorRole"]>;

// Polymorphic type definitions
type TypographyProps<C extends React.ElementType> = {
  component?: C;
  variant?: TypographyVariants["variant"];
  size?: TypographyVariants["size"];
  /** Content color role. Omit it to inherit the container's. */
  colorRole?: TypographyColorRole;
  className?: string;
  children?: React.ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<C>,
  "className" | "children" | "ref" | "component"
>;

// Base Typography component without explicit type assignment
const TypographyBase = React.forwardRef(
  <C extends React.ElementType = "p">(
    {
      component,
      variant,
      size,
      colorRole,
      className,
      children,
      ...props
    }: TypographyProps<C>,
    ref: React.Ref<Element>,
  ) => {
    const Component = component || ("p" as React.ElementType);
    return (
      <Component
        data-slot="typography"
        ref={ref}
        className={typography({ variant, size, colorRole, className })}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

TypographyBase.displayName = "TypographyBase";

// Display Component
export const Display = React.forwardRef<
  Element,
  Omit<
    TypographyProps<"h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "span">,
    "variant"
  >
>(({ component = "h1", size = "large", ...props }, ref) => (
  <TypographyBase
    ref={ref}
    component={component}
    variant="display"
    size={size}
    {...props}
  />
));

Display.displayName = "Display";

// Headline Component
export const Headline = React.forwardRef<
  Element,
  Omit<
    TypographyProps<"h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "span">,
    "variant"
  >
>(({ component = "h2", size = "large", ...props }, ref) => (
  <TypographyBase
    ref={ref}
    component={component}
    variant="headline"
    size={size}
    {...props}
  />
));

Headline.displayName = "Headline";

// Title Component
// `h1` is in the union because the element and the type role are independent —
// that is what `component` is for. A top app bar's title is `title-large` by
// the spec and is usually the page's own heading, so it needs both.
export const Title = React.forwardRef<
  Element,
  Omit<
    TypographyProps<"h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "span">,
    "variant"
  >
>(({ component = "h3", size = "large", ...props }, ref) => (
  <TypographyBase
    ref={ref}
    component={component}
    variant="title"
    size={size}
    {...props}
  />
));

Title.displayName = "Title";

// Label Component
export const Label = React.forwardRef<
  Element,
  Omit<TypographyProps<"label" | "span" | "div">, "variant">
>(({ component = "label", size = "medium", ...props }, ref) => (
  <TypographyBase
    ref={ref}
    component={component}
    variant="label"
    size={size}
    {...props}
  />
));

Label.displayName = "Label";

// Body Component
export const Body = React.forwardRef<
  Element,
  Omit<TypographyProps<"p" | "span" | "div">, "variant">
>(({ component = "p", size = "medium", ...props }, ref) => (
  <TypographyBase
    ref={ref}
    component={component}
    variant="body"
    size={size}
    {...props}
  />
));

Body.displayName = "Body";
