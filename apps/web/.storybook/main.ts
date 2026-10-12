/**
 * Nemia's Storybook: the look's own parts (`src/components/look`) and the board's components that have stories (`src/components`), each
 * in the stories beside it, for a person to open with `npm run storybook`. It is built from the board's own Vite config but for the router's plugin, which would write the route tree
 * again; it takes no addon, sends no telemetry and asks for no update.
 */
import type { StorybookConfig } from '@storybook/react-vite';
import type { PluginOption } from 'vite';

/** Whether `plugin`, or any plugin of a list it is, is the router's: one that reads the routes and writes their tree. */
const ofTheRouter = (plugin: PluginOption): boolean => {
  if (Array.isArray(plugin)) return plugin.some(ofTheRouter);
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && /tanstack|router/i.test(plugin.name);
};

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/components/look/*.stories.tsx', '../src/components/*.stories.tsx'],
  addons: [],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  viteFinal: (vite) => ({ ...vite, plugins: (vite.plugins ?? []).filter((plugin) => !ofTheRouter(plugin)) }),
};

export default config;
