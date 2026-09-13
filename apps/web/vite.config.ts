import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

// Where `/api` goes, for `vite` and `vite preview` alike: the api `npm run dev` starts, unless
// `HKB_API_URL` names another — `npm run e2e` starts one on a free port, beside whatever a person runs.
const api = process.env.HKB_API_URL ?? 'http://localhost:8787';

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts, so it runs before React's.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  // `@/` is declared once, in tsconfig.json's `paths`, and Vite reads it from there.
  resolve: { tsconfigPaths: true },
  server: {
    proxy: { '/api': api },
  },
  // The static build, served by `vite preview`, reads the api through the same proxy the dev server has.
  preview: {
    proxy: { '/api': api },
  },
});
