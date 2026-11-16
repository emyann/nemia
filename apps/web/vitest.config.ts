/**
 * The board's Vitest: one project, `storybook`, which runs every story Storybook finds (`.storybook/main.ts`) in Playwright's Chromium,
 * headless: each a smoke test that it renders, its play function where it has one, and axe as the preview sets it (`error`). `npm run
 * stories` runs it, and `npm run e2e -- --look` after the look's tests (`e2e/look.ts`), so CI's `e2e-look` job runs it; `npm test`
 * never does, since it launches Chromium. The browser is the repository's pinned `playwright`'s, the one CI caches, at the window the
 * look's browser tests and the stories' pictures draw in (1280 × 800). It is built from the board's own Vite config but for the
 * router's plugin, as Storybook is (`.storybook/router.ts`): the addon applies Storybook's `viteFinal` to a bare config, not to this
 * one, and the plugin would write `src/routeTree.gen.ts` again on every run. It runs one story file at a time (`maxWorkers: 1`): each
 * worker is a Chromium page of its own, about a gigabyte summed over its renderers, and the default of one a core took the run's whole
 * tree to 7.9 GiB on an eight-core machine where one at a time takes 3.7 GiB, of which the Vite server holds 1.7, for 50 s against 42
 * (the RSS summed over the run and every process under it, Chromium's included).
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import vite from './vite.config.ts';
import { withoutTheRouter } from './.storybook/router.ts';

export default mergeConfig(
  { ...vite, plugins: withoutTheRouter(vite.plugins) },
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          plugins: [storybookTest({ configDir: '.storybook', storybookScript: 'npm run storybook' })],
          test: {
            name: 'storybook',
            maxWorkers: 1,
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: 'chromium' }],
              viewport: { width: 1280, height: 800 },
            },
          },
        },
      ],
    },
  }),
);
