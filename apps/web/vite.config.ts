import { defineConfig } from 'vite';
import { relative } from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { Logger, LoggerEvent } from 'babel-plugin-react-compiler';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

// Where `/api` goes, for `vite` and `vite preview` alike: the api `npm run dev` starts, unless
// `HKB_API_URL` names another — `npm run e2e` starts one on a free port, beside whatever a person runs.
// By number, as the api listens (apps/api/src/port.ts): `localhost` can be ::1 first, where nothing does.
const api = process.env.HKB_API_URL ?? 'http://127.0.0.1:8787';

// What the React Compiler left uncompiled, one line each: a component or hook it bails out of still works, unmemoized, and
// nothing else says so (the node tests load `src/` as it is written).
const logger: Logger = {
  logEvent(filename, event) {
    const why = skipped(event);
    if (!why) return;
    console.warn(`React Compiler skipped ${filename ? relative(import.meta.dirname, filename) : '?'}:${why.line ?? '?'}: ${why.reason}`);
  },
};

// The line is the offending expression's where the compiler names one (GeneratedSource, a symbol, is none), else the function's.
function skipped(event: LoggerEvent): { line?: number; reason: string } | undefined {
  switch (event.kind) {
    case 'PipelineError':
      return { line: event.fnLoc?.start.line, reason: event.data };
    case 'CompileSkip':
      return { line: (event.loc ?? event.fnLoc)?.start.line, reason: event.reason };
    case 'CompileError': {
      const at = event.detail.primaryLocation();
      return { line: (typeof at === 'object' && at ? at : event.fnLoc)?.start.line, reason: event.detail.reason };
    }
    default:
      return undefined;
  }
}

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts and splits each route's component into a module of its own, so it runs first
  // and the compiler, through Babel, sees the split modules. Babel runs before React's plugin, as the compiler's guide has it.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    babel({ presets: [reactCompilerPreset({ logger })] }),
    react(),
    tailwindcss(),
  ],
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
