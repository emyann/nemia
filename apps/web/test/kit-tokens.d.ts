/**
 * What the kit's token module (`src/components/ui/ds/tokens/design-md.mjs`, vendored as shipped, with no types of its own) exports that
 * the board's tests read: the pairs of an ink and its ground the kit checks for contrast, and the ratio it holds them to.
 */
declare module '*/tokens/design-md.mjs' {
  /** Each pair of an ink role and the ground role it is drawn on, by their names after `--md-sys-color-`. */
  export const CONTRAST_PAIRS: readonly (readonly [string, string])[];
  /** The contrast ratio each pair reads at, at least: WCAG AA for running text. */
  export const CONTRAST_THRESHOLD: number;
}
