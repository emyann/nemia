import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { remarkMermaid } from './src/mermaid.ts';

export default defineConfig({
  vite: { environments: { prerender: { resolve: { noExternal: true } } } },
  markdown: { processor: unified({ remarkPlugins: [[remarkMermaid, { root: fileURLToPath(new URL('../..', import.meta.url)) }]] }) },
  integrations: [
    starlight({
      title: 'Nemia',
      customCss: ['./src/styles/accent.css'],
      sidebar: [
        { label: 'What Nemia is', link: '/' },
        { label: 'The map', link: '/map/' },
        { label: 'Glossary', link: '/glossary/' },
      ],
      plugins: [starlightLinksValidator()],
    }),
  ],
});
