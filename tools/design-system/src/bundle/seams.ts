/**
 * The seam between a story and the page's bundle. A story's import of a module under `apps/web/src` resolves to that module's one
 * instance in the bundle (`window.Nemia.__m[<path>]`), never to a second copy: a context, a query key or a store read through two
 * copies would not meet. The shared packages resolve to their namespaces of `window.Nemia`, the kit's package name to the bundle
 * itself, and what a story takes from Storybook, Vitest and MSW to inert stand-ins, exported by the names the stories import, since a
 * bundled import is bound by name.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, PluginBuild } from 'esbuild';
import { SRC, STORYBOOK } from '../paths.ts';
import { STORY, storyFiles } from '../stories/stories.ts';
import { SHARED, literal } from './page.ts';

/** What a story takes from outside the board that no card runs: Storybook, Vitest and MSW. */
const OUTSIDE = /^(@storybook\/|storybook($|\/)|msw($|-|\/)|vitest($|\/)|@vitest\/)/;

/** The names a story imports from outside the board that are always stood in for. */
const ALWAYS = ['fn', 'expect', 'within', 'waitFor', 'userEvent', 'screen', 'http', 'HttpResponse', 'delay'];

/**
 * Each name `text` imports by value from a package `OUTSIDE` matches.
 * @param text a source file's text.
 */
const outsideNames = (text: string) =>
  [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)]
    .filter(([, , from]) => OUTSIDE.test(from ?? ''))
    .flatMap(([, list]) =>
      (list ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && !/^type\s/.test(part))
        .map((part) => part.split(/\s+as\s+/)[0] ?? ''),
    )
    .filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));

/** Every source a story is bundled with: the board's stories, its Storybook's files and the kit's stories. */
const sourcesOfStories = (kit: string) => [
  ...storyFiles(path.join(SRC, 'components')),
  ...fs
    .readdirSync(STORYBOOK, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name)),
  ...fs
    .readdirSync(path.join(kit, 'stories'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name)),
];

/**
 * The inert module every outside import resolves to: a stand-in that answers every property and call with itself, exported under each
 * name a story imports, `fn` a spy-like stand-in that runs the implementation it is given.
 * @param kit the folder holding the kit's `stories/`.
 */
export const inertModule = (kit: string) => {
  const names = new Set([...ALWAYS, ...sourcesOfStories(kit).flatMap((file) => outsideNames(fs.readFileSync(file, 'utf8')))]);
  return [
    'const mock = (impl) => { const f = (...a) => (impl ? impl(...a) : undefined); return new Proxy(f, { get: (t, k) => (k in t ? t[k] : typeof k === "symbol" || k === "then" ? undefined : () => mock(impl)) }); };',
    'const inert = new Proxy(function () {}, { get: (t, k) => (typeof k === "symbol" || k === "then" ? undefined : inert), apply: () => inert, construct: () => inert });',
    'export default inert;',
    ...[...names].filter((name) => name !== 'fn').map((name) => `export const ${name} = inert;`),
    'export const fn = mock;',
  ].join('\n');
};

/** A module's key in `__m`: its path under `src`, its extension dropped. */
export const keyOf = (file: string) => path.relative(SRC, file).replace(/\.(tsx?|mjs|js)$/, '');

/** What `seams` is told. */
export type SeamOptions = {
  readonly inert: string;
  readonly seen?: Set<string>;
  readonly kit?: boolean;
  readonly exported?: readonly string[];
  readonly extra?: (virtual: (filter: RegExp, contents: (asked: string) => string, resolveDir?: string) => void) => void;
};

/** Registers a module whose contents `contents` writes for every import `filter` matches. */
const virtualOf = (build: PluginBuild) => (filter: RegExp, contents: (asked: string) => string, resolveDir?: string) => {
  const namespace = `seam-${String(filter)}`;
  build.onResolve({ filter }, (asked) => ({ path: asked.path, namespace }));
  build.onLoad({ filter: /.*/, namespace }, (asked) => ({ contents: contents(asked.path), loader: 'js', resolveDir }));
};

/** Has an import of the board's own modules, but a story and a stylesheet, read its one instance in the bundle. */
const boardModules = (build: PluginBuild, seen: Set<string> | undefined) => {
  build.onResolve({ filter: /^(\.|@\/)/ }, async (asked) => {
    if (asked.pluginData?.seamed || (asked.namespace !== 'file' && asked.namespace !== '')) return undefined;
    const found = await build.resolve(asked.path, {
      resolveDir: asked.resolveDir,
      kind: asked.kind,
      importer: asked.importer,
      pluginData: { seamed: true },
    });
    if (found.errors.length || !found.path.startsWith(`${SRC}/`) || STORY.test(found.path) || found.path.endsWith('.css')) return undefined;
    seen?.add(found.path);
    return { path: keyOf(found.path), namespace: 'board-module' };
  });
  build.onLoad({ filter: /.*/, namespace: 'board-module' }, (asked) => ({
    contents: `module.exports = window.Nemia.__m[${JSON.stringify(asked.path)}];`,
    loader: 'js',
  }));
};

/**
 * The plugin a story is bundled under.
 * @param options what the stories read: the inert module, the set the board's modules a story reaches are collected in (discovery),
 * whether the story is the kit's (it reaches the bundle by the kit's package name alone), the bundle's export names, and further
 * virtual modules.
 */
export const seams = (options: SeamOptions) =>
  ({
    name: 'story-seams',
    setup(build) {
      const virtual = virtualOf(build);
      const exported = options.exported ?? [];
      virtual(/^@french-tech-homies\/design-system(\/.*)?$/, (asked) =>
        [
          'const k = window.Nemia;',
          ...exported.map((name) => `export const ${name} = k.${name};`),
          `export default k[${JSON.stringify(asked.split('/').pop())}];`,
        ].join('\n'),
      );
      for (const [name, space] of Object.entries(SHARED))
        virtual(new RegExp(`^${literal(name)}$`), () => `module.exports = window.Nemia.${space};`);
      virtual(OUTSIDE, () => options.inert);
      options.extra?.(virtual);
      if (!options.kit) boardModules(build, options.seen);
    },
  }) satisfies Plugin;
