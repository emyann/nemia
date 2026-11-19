/**
 * Nemia's Storybook: the look's own parts (`src/components/look`), the board's components that have stories and the page bodies with
 * stories (`Pages/`), each in the stories beside it, anywhere under `src/components` but the vendored `ui/` and `ai-elements/`, for a
 * person to open with `npm run storybook` and for the checks to run through Vitest (`npm run stories`, `vitest.config.ts`). It is built
 * from the board's own Vite config but for the router's plugin, which would write the route tree again (`router.ts`). Its addons: the
 * docs, the accessibility panel (axe, held to `error` by the preview), the Vitest addon, the theme switch (`@storybook/addon-themes`,
 * dark by default: its classes are copied onto the board's dark rules by the scheme transform, `schemeBuild.ts`, in Storybook's
 * toolchain alone), and MSW, whose worker is served from
 * `.storybook/public` to Storybook alone, never in the board's build, so a page story answers its reads from fixtures. The ds kit's own
 * published Storybook is composed beside ours (`refs`): its stories load in the person's browser from the kit's site, and no check of ours
 * runs them. It sends no telemetry and asks for no update.
 */
import type { StorybookConfig } from '@storybook/react-vite';
import { withoutTheRouter } from './router.ts';
import { schemePlugins } from './schemeBuild.ts';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/components/!(ui|ai-elements)/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest', 'msw-storybook-addon', '@storybook/addon-themes'],
  staticDirs: ['./public'],
  refs: { kit: { title: 'Design system kit', url: 'https://french-tech-homies.github.io/design-system/' } },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  viteFinal: (vite) => ({
    ...vite,
    plugins: withoutTheRouter(vite.plugins),
    css: { ...vite.css, postcss: { plugins: schemePlugins() } },
  }),
};

export default config;
