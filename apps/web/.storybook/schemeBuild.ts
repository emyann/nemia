/**
 * What Storybook's toolchain adds to draw a story in either theme, read by `main.ts` (a person's Storybook) and `vitest.config.ts` (the
 * stories project) and never by the board's own build: the PostCSS transform that copies each `prefers-color-scheme` rule of the
 * board's styles under the root class of its theme (`postcss-dark-theme-class`, the classes of `scheme.ts`), keeping the media copy
 * for a page with no class; and the browser command the stories project emulates a colour scheme with (Playwright's
 * `page.emulateMedia`), so what reads `matchMedia` (React Flow's `colorMode="system"`) follows the theme too.
 */
import { defineBrowserCommand } from '@vitest/browser-playwright';
import themeClass from 'postcss-dark-theme-class';
import { SCHEME_CLASSES, type Scheme } from './scheme.ts';

/** The PostCSS plugins of Storybook's toolchain: the scheme transform under the classes of `scheme.ts`. */
export const schemePlugins = () => [themeClass({ darkSelector: `.${SCHEME_CLASSES.dark}`, lightSelector: `.${SCHEME_CLASSES.light}` })];

/** The browser command `scheme`: the page's emulated colour scheme set to the theme it is given. */
export const scheme = defineBrowserCommand<[Scheme]>(async ({ page }, theme) => {
  await page.emulateMedia({ colorScheme: theme });
});
