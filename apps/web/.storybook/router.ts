/**
 * The router's plugin, which reads the routes and writes their tree (`src/routeTree.gen.ts`), left out of the board's Vite config
 * where the stories are built: by Storybook (`main.ts`'s `viteFinal`) and by the stories' Vitest (`vitest.config.ts`), whose addon
 * applies `viteFinal` to a bare config and not to the board's. Neither draws a route, and neither may write the tree a build owns.
 */
import type { PluginOption } from 'vite';

/**
 * Whether `plugin`, or any plugin of a list it is, is the router's: one that reads the routes and writes their tree.
 * @param plugin A plugin of a Vite config, or a list of them.
 */
export const ofTheRouter = (plugin: PluginOption) => {
  if (Array.isArray(plugin)) return plugin.some(ofTheRouter);
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && /tanstack|router/i.test(plugin.name);
};

/**
 * `plugins` without the router's.
 * @param plugins The plugins of a Vite config.
 */
export const withoutTheRouter = (plugins: readonly PluginOption[] | undefined) => (plugins ?? []).filter((plugin) => !ofTheRouter(plugin));
