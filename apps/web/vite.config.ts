import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts, so it runs before React's.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  // `@/` is declared once, in tsconfig.json's `paths`, and Vite reads it from there.
  resolve: { tsconfigPaths: true },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
});
