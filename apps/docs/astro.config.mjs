import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { remarkGlossary } from './src/glossary.ts';
import { remarkMermaid } from './src/mermaid.ts';

/** The repository's root, where the pages read the package docs' diagrams and the contexts' glossary tables. */
const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Inlines every dependency into the prerender environment on `astro build` alone, where Node cannot load `cookie`'s named
 * exports for Astro's prerenderer; in dev, Astro's own external lists stay, so Vite's runner never evaluates a CommonJS package.
 */
const prerenderInlinedOnBuild = {
  name: 'prerender-inlined-on-build',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      if (command === 'build') updateConfig({ vite: { environments: { prerender: { resolve: { noExternal: true } } } } });
    },
  },
};

export default defineConfig({
  markdown: {
    processor: unified({
      remarkPlugins: [
        [remarkGlossary, { root }],
        [remarkMermaid, { root }],
      ],
    }),
  },
  integrations: [
    prerenderInlinedOnBuild,
    starlight({
      title: 'Nemia',
      customCss: ['./src/styles/accent.css'],
      sidebar: [
        { label: 'What Nemia is', link: '/' },
        { label: 'The map', link: '/map/' },
        { label: 'The model', link: '/model/' },
        { label: 'The runtime', link: '/runtime/' },
        { label: 'A2A', link: '/a2a/' },
        { label: 'Workflows', link: '/workflows/' },
        { label: 'Agents', link: '/agents/' },
        { label: 'Factories', link: '/factories/' },
        { label: 'How a run lives', link: '/how-a-run-lives/' },
        { label: 'Nemia', link: '/nemia/' },
        { label: 'Glossary', link: '/glossary/' },
        { label: 'Getting started', link: '/getting-started/' },
      ],
      plugins: [starlightLinksValidator()],
    }),
  ],
});
