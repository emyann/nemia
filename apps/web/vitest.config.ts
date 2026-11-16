/**
 * The board's Vitest: one project, `storybook`, which runs every story Storybook finds (`.storybook/main.ts`) in Playwright's Chromium,
 * headless: each a smoke test that it renders, its play function where it has one, and axe as the preview sets it (`error`). `npm run
 * stories` runs it, and `npm run e2e -- --look` after the look's tests (`e2e/look.ts`), so CI's `e2e-look` job runs it; `npm test`
 * never does, since it launches Chromium. The browser is the repository's pinned `playwright`'s, the one CI caches.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import vite from './vite.config.ts';

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          plugins: [storybookTest({ configDir: '.storybook', storybookScript: 'npm run storybook' })],
          test: {
            name: 'storybook',
            browser: { enabled: true, headless: true, provider: playwright({}), instances: [{ browser: 'chromium' }] },
          },
        },
      ],
    },
  }),
);
