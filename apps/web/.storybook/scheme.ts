/**
 * The classes Storybook's theme switch sets on `<html>`, Nemia's dark the default: the toolbar's global (`@storybook/addon-themes`,
 * `preview.tsx`) and the light canaries' comparison (`compare.ts`) set them, and the scheme transform (`schemeBuild.ts`) copies each of
 * the board's `prefers-color-scheme` rules under them, in Storybook's toolchain alone, so the board's own build draws what it draws.
 */

/** A theme a story is drawn in. */
export type Scheme = 'light' | 'dark';

/** The class on `<html>` that forces each theme. */
export const SCHEME_CLASSES: Readonly<Record<Scheme, string>> = { light: 'is-light', dark: 'is-dark' };
