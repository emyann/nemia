import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { createTV, tv as baseTv } from "tailwind-variants";

/**
 * Every custom utility scale this kit adds to the Tailwind theme must be
 * registered in its tailwind-merge class group. Without this, twMerge cannot
 * tell that `text-title-medium` conflicts with `text-body-small`, or that
 * `rounded-lg` should override `rounded-shape-full` — caller `className`
 * overrides would silently produce two competing classes and let stylesheet
 * order decide. `shadow-elevation-*` is the sharpest case: unregistered,
 * tailwind-merge reads it as a shadow *color* and drops the elevation.
 *
 * Consumers with their own `cn()` (e.g. a shadcn setup) should build it from
 * this same config so every merge in the app behaves identically:
 *
 *   const twMerge = extendTailwindMerge(twMergeConfig);
 *   export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
 */
export const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [
        "text-display-large",
        "text-display-medium",
        "text-display-small",
        "text-headline-large",
        "text-headline-medium",
        "text-headline-small",
        "text-title-large",
        "text-title-medium",
        "text-title-small",
        "text-label-large",
        "text-label-medium",
        "text-label-small",
        "text-body-large",
        "text-body-medium",
        "text-body-small",
      ],
      // MD3's two faces (theme.v4.css) — `font-brand` for display/headline/
      // title, `font-plain` for body/label. Registering them as font-family,
      // and `font-regular` as the font-weight it is, is what lets Typography
      // carry a face and a weight at once: tailwind-merge's stock config reads
      // any unknown `font-*` as a family, so `font-regular font-brand` would
      // otherwise collapse to `font-brand` and lose the weight.
      "font-family": [{ font: ["brand", "plain"] }],
      "font-weight": [{ font: ["regular"] }],
      // State-layer opacities (theme.v4.css `@utility state-opacity-*`). In
      // the `opacity` group so they override — and are overridden by — a plain
      // `opacity-*` instead of stacking with it and letting source order win.
      opacity: [
        {
          "state-opacity": ["hover", "focus", "pressed", "dragged"],
        },
      ],
      shadow: [
        {
          shadow: [
            "elevation-1",
            "elevation-2",
            "elevation-3",
            "elevation-4",
            "elevation-5",
          ],
        },
      ],
      rounded: [{ rounded: shapeScale() }],
      "rounded-l": [{ "rounded-l": shapeScale() }],
      "rounded-r": [{ "rounded-r": shapeScale() }],
      "rounded-t": [{ "rounded-t": shapeScale() }],
      "rounded-b": [{ "rounded-b": shapeScale() }],
      duration: [
        {
          duration: [
            "short-1",
            "short-2",
            "short-3",
            "short-4",
            "medium-1",
            "medium-2",
            "medium-3",
            "medium-4",
            "long-1",
            "long-2",
            "long-3",
            "long-4",
          ],
        },
      ],
      ease: [
        {
          ease: [
            "standard",
            "standard-accelerate",
            "standard-decelerate",
            "emphasized",
            "emphasized-accelerate",
            "emphasized-decelerate",
          ],
        },
      ],
    },
  },
};

function shapeScale() {
  return [
    "shape-extra-small",
    "shape-small",
    "shape-medium",
    "shape-large",
    "shape-extra-large",
    "shape-full",
  ];
}

const twMerge = extendTailwindMerge(twMergeConfig);

/** `clsx` + the MD3-aware `twMerge`. Use this instead of bare `twMerge`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `tailwind-variants` bound to the MD3 merge config. Use for all kit styles. */
export const tv = createTV({ twMergeConfig });

/** The MD3 focus indicator — a 3px `secondary` ring offset 2px (Material's
    md.comp.focus-ring) — extended or inlined by every control. Drawn as a
    box-shadow ring, exactly like shadcn's React Aria base, rather than an
    `outline`: outline-color/offset transitions never settle on React Aria
    buttons in Chromium when `transition-all` is present, and the shadow ring
    is unaffected by `overflow-hidden`. `ring` resolves to the MD3 secondary
    role in theme.v4.css; the offset gap is painted in `background`.
    `composeTailwindRenderProps` lives in ./render-props (client-only). */
export const focusRing = baseTv({
  base: "outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
});

export type { VariantProps } from "tailwind-variants";
